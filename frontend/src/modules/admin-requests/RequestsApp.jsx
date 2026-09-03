import { useCallback, useEffect, useState } from "react";
import { Inbox, FileClock, FilePlus2 } from "lucide-react";
import { apiFetch, apiUpload } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import DeptSectionNav from "../../components/DeptSectionNav.jsx";
import RequestList from "./RequestList.jsx";
import NewRequestForm from "./NewRequestForm.jsx";
import RequestDetail from "./RequestDetail.jsx";

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
    description: "Raise a request and route it to whoever needs to approve it.",
  },
];

export default function RequestsApp() {
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

  async function handleCreate({ department, title, description, approvers, file }) {
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
    <AdminDashboardShell>
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-canopy-300">Paperless workflow</p>
          <h1 className="text-xl font-medium text-white">Requests</h1>
          <p className="mt-1 text-sm text-canopy-100">
            Raise a request from any department, route it through whoever needs to approve, and track
            every decision — no papers, no chasing people down.
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
            {tab === "new" && <NewRequestForm adminUsers={adminUsers} onSubmit={handleCreate} />}
          </>
        )}
      </div>
    </AdminDashboardShell>
  );
}
