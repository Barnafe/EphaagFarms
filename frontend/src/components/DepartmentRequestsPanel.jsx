import { useCallback, useEffect, useState } from "react";
import { Inbox, FileClock, FilePlus2 } from "lucide-react";
import { apiFetch, apiUpload } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import DeptSectionNav from "./DeptSectionNav.jsx";
import RequestList from "../modules/admin-requests/RequestList.jsx";
import NewRequestForm from "../modules/admin-requests/NewRequestForm.jsx";
import RequestDetail from "../modules/admin-requests/RequestDetail.jsx";

const TABS = [
  {
    key: "awaiting",
    label: "Awaiting my approval",
    icon: Inbox,
    description: "Requests routed to you that still need a decision.",
  },
  {
    key: "mine",
    label: "My requests",
    icon: FileClock,
    description: "Requests you've raised and their current status.",
  },
  {
    key: "new",
    label: "New request",
    icon: FilePlus2,
    description: "Raise a request from this department and route it to whoever needs to approve it.",
  },
];

// The same generic cross-department Requests engine used by the top-level
// Admin "Requests" tool (see admin-requests/RequestsApp.jsx), but embedded
// directly inside a department's own dashboard so a department doesn't
// have to leave its own space to raise or act on a request. New requests
// raised from here default to (and can't be reassigned away from) this
// department, so it's clear who raised what.
export default function DepartmentRequestsPanel({ department }) {
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  const [tab, setTab] = useState(null);
  const [awaiting, setAwaiting] = useState([]);
  const [mine, setMine] = useState([]);
  const [adminUsers, setAdminUsers] = useState([]);
  const [openRequest, setOpenRequest] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [{ requests: a }, { requests: m }, { users: u }] = await Promise.all([
        apiFetch("/requests/awaiting-me"),
        apiFetch("/requests/mine"),
        apiFetch("/requests/admin-users"),
      ]);
      setAwaiting(a);
      setMine(m);
      setAdminUsers(u);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(id) {
    try {
      const { request } = await apiFetch(`/requests/${id}`);
      setOpenRequest(request);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreate({ title, description, approvers, file }) {
    try {
      const form = new FormData();
      form.append("department", department);
      form.append("title", title);
      if (description) form.append("description", description);
      form.append("approvers", JSON.stringify(approvers));
      if (file) form.append("attachment", file);
      await apiUpload("/requests", form);
      await load();
      setTab("mine");
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }

  async function handleDecide(stepId, decision, note) {
    try {
      const { request } = await apiFetch(`/requests/${openRequest.id}/steps/${stepId}/decide`, {
        method: "POST",
        body: { decision, note },
      });
      setOpenRequest(request);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCancel() {
    try {
      await apiFetch(`/requests/${openRequest.id}/cancel`, { method: "POST" });
      setOpenRequest(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-300">{department} Department</p>
        <h1 className="text-xl font-medium text-white">Requests</h1>
        <p className="mt-1 text-sm text-canopy-100">
          Raise a request from {department}, tag who needs to approve it in order, and track it
          through to admin's final sign-off.
        </p>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {openRequest ? (
        <RequestDetail
          request={openRequest}
          currentUserId={currentUserId}
          onBack={() => setOpenRequest(null)}
          onDecide={handleDecide}
          onCancel={handleCancel}
        />
      ) : (
        <>
          <DeptSectionNav sections={TABS} activeKey={tab} onSelect={setTab} deptLabel="request views" />

          {tab === "awaiting" && (
            <RequestList requests={awaiting} onOpen={openDetail} emptyText="Nothing awaiting your approval." />
          )}
          {tab === "mine" && (
            <RequestList requests={mine} onOpen={openDetail} emptyText="You haven't raised any requests yet." />
          )}
          {tab === "new" && (
            <NewRequestForm
              adminUsers={adminUsers}
              onSubmit={handleCreate}
              defaultDepartment={department}
              lockDepartment
            />
          )}
        </>
      )}
    </div>
  );
}
