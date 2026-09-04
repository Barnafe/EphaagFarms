import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

export default function HistoryPanel() {
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch("/maintenance/history")
      .then(({ history }) => setHistory(history))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Completed work, with full cost and who did what</p>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-3 space-y-2">
        {history.length === 0 && <p className="text-sm text-ink-600">Nothing completed yet.</p>}
        {history.map((h) => (
          <div key={h.id} className="rounded-card border border-soil-200 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-ink-900">{h.title}</p>
                <p className="text-xs text-ink-600">
                  {h.reference} · {h.asset_name || "No asset"} · {h.technician_name || h.contractor_name || "Unassigned"} ·{" "}
                  completed {h.completed_at ? new Date(h.completed_at).toLocaleDateString() : "—"}
                </p>
                {h.work_performed && <p className="mt-1 text-sm text-ink-700">{h.work_performed}</p>}
              </div>
              <span className="shrink-0 font-medium text-ink-900">₦{Number(h.total_cost).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
