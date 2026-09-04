import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

// Everything with a scheduled_date, across every source (request-derived,
// preventive-generated, or manually created) — the department's single
// calendar view. This is distinct from Preventive Maintenance's own
// per-asset recurring schedule (see PreventiveMaintenance.jsx), which is
// about setting up the recurrence, not viewing the calendar of dated work.
export default function SchedulePanel() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch("/maintenance/work-orders")
      .then(({ workOrders }) => setOrders(workOrders.filter((o) => o.scheduled_date && o.status !== "completed" && o.status !== "cancelled")))
      .catch((err) => setError(err.message));
  }, []);

  const sorted = [...orders].sort((a, b) => new Date(a.scheduled_date) - new Date(b.scheduled_date));

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Upcoming scheduled work, by date</p>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-3 space-y-2">
        {sorted.length === 0 && <p className="text-sm text-ink-600">Nothing scheduled right now.</p>}
        {sorted.map((o) => (
          <div key={o.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
            <div>
              <p className="font-medium text-ink-900">{o.title}</p>
              <p className="text-xs text-ink-600">{o.reference} · {o.asset_name || "No asset"} · {o.source}</p>
            </div>
            <span className="rounded-full bg-harvest-100 px-2 py-1 text-xs text-harvest-800">{o.scheduled_date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
