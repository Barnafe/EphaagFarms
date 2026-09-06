import { useEffect, useState } from "react";
import { apiFetch, API_ORIGIN } from "../../api/client.js";

function UnitRequestsTab() {
  const [units, setUnits] = useState([]);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const { units: pending } = await apiFetch("/units/admin/pending");
      setUnits(pending);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(id, decision) {
    setBusyId(id);
    try {
      await apiFetch(`/units/admin/${id}/decide`, { method: "POST", body: { decision } });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-700">{error}</p>}
      {units.length === 0 && <p className="text-sm text-ink-600">No pending unit requests.</p>}
      {units.map((u) => (
        <div key={u.id} className="card">
          <p className="text-sm font-medium text-ink-900">{u.name}</p>
          <p className="text-xs text-ink-600">{u.ward}, {u.lga}, {u.state}</p>
          <p className="mt-1 text-xs text-ink-600">Proposed by {u.proposed_by_name}</p>
          {u.note && <p className="mt-1 text-xs text-ink-600">"{u.note}"</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busyId === u.id}
              onClick={() => decide(u.id, "approved")}
              className="rounded-card bg-canopy-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busyId === u.id}
              onClick={() => decide(u.id, "rejected")}
              className="rounded-card border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 disabled:opacity-60"
            >
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfileReportsTab() {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const { reports: pending } = await apiFetch("/profile-reports/admin/pending");
      setReports(pending);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(id, decision) {
    setBusyId(id);
    try {
      await apiFetch(`/profile-reports/admin/${id}/decide`, { method: "POST", body: { decision } });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-700">{error}</p>}
      {reports.length === 0 && <p className="text-sm text-ink-600">No pending profile reports.</p>}
      {reports.map((r) => (
        <div key={r.id} className="card">
          <p className="text-sm font-medium text-ink-900">Report on {r.reported_user_name}</p>
          <p className="mt-1 text-xs text-ink-600">Reported by {r.reported_by_name}</p>
          <p className="mt-2 text-sm text-ink-900">{r.reason}</p>
          {r.proof_image_url && (
            <a
              href={`${API_ORIGIN}${r.proof_image_url}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs text-canopy-800 underline"
            >
              View proof image
            </a>
          )}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => decide(r.id, "actioned")}
              className="rounded-card bg-canopy-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              Mark actioned
            </button>
            <button
              type="button"
              disabled={busyId === r.id}
              onClick={() => decide(r.id, "dismissed")}
              className="rounded-card border border-soil-300 px-3 py-1.5 text-xs font-medium text-ink-700 disabled:opacity-60"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CommunityPage() {
  const [tab, setTab] = useState("units");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium text-white">Community</h1>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTab("units")}
          className={`rounded-card px-3 py-1.5 text-sm ${tab === "units" ? "bg-canopy-800 text-white" : "border border-soil-300 text-ink-700"}`}
        >
          Unit requests
        </button>
        <button
          type="button"
          onClick={() => setTab("reports")}
          className={`rounded-card px-3 py-1.5 text-sm ${tab === "reports" ? "bg-canopy-800 text-white" : "border border-soil-300 text-ink-700"}`}
        >
          Profile reports
        </button>
      </div>
      {tab === "units" ? <UnitRequestsTab /> : <ProfileReportsTab />}
    </div>
  );
}
