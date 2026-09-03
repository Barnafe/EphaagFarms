import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";
import ConsultancyManager from "./ConsultancyManager.jsx";

const statusOptions = ["pending", "scheduled", "completed"];

export default function ConsultancyPage() {
  const [consultancy, setConsultancy] = useState([]);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [{ offerings }, { requests: r }] = await Promise.all([
        apiFetch("/rtc/admin/consultancy"),
        apiFetch("/rtc/admin/consultancy-requests"),
      ]);
      setConsultancy(offerings);
      setRequests(r);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd({ title, description }) {
    try {
      await apiFetch("/rtc/admin/consultancy", { method: "POST", body: { title, description } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleStatusChange(id, status) {
    try {
      await apiFetch(`/rtc/admin/consultancy-requests/${id}/status`, { method: "POST", body: { status } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AdminDashboardShell>
    <div className="max-w-4xl space-y-6">
      <div>
        <Link to="/admin/trc" className="text-xs text-canopy-300 hover:underline">
          ← TRC Department
        </Link>
        <h1 className="mt-1 text-xl font-medium text-white">Consultancy</h1>
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <ConsultancyManager items={consultancy} onAdd={handleAdd} />

      <div className="card">
        <p className="text-sm text-ink-600">Consultation requests</p>
        {requests.length === 0 && <p className="mt-2 text-sm text-ink-600">No applications yet.</p>}
        <div className="mt-3 space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="rounded-card border border-soil-200 px-3 py-2">
              <p className="text-xs font-medium text-canopy-800">{r.offeringTitle} — {r.farmerName}</p>
              {r.message && <p className="mt-1 text-sm text-ink-900">{r.message}</p>}
              <div className="mt-2 flex items-center gap-2">
                <label className="text-xs text-ink-600">Status</label>
                <select
                  value={r.status}
                  onChange={(e) => handleStatusChange(r.id, e.target.value)}
                  className="rounded-card border border-soil-200 px-2 py-1 text-xs"
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
    </AdminDashboardShell>
  );
}
