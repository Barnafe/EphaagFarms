import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

const severityStyles = {
  info: "bg-soil-100 text-ink-600",
  warning: "bg-harvest-100 text-harvest-800",
  critical: "bg-red-100 text-red-700",
};

export default function AlertsPanel() {
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);

  async function load() {
    try {
      const { alerts } = await apiFetch("/finance-department/alerts");
      setAlerts(alerts);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleScan() {
    setScanning(true);
    try {
      await apiFetch("/finance-department/alerts/scan", { method: "POST", body: {} });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  async function handleMarkRead(id) {
    try {
      await apiFetch(`/finance-department/alerts/${id}/read`, { method: "POST", body: {} });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">Low cash, budget thresholds, overdue invoices, upcoming payments, unusual spending and failed payments.</p>
        <button className="btn-outline" type="button" disabled={scanning} onClick={handleScan}>{scanning ? "Scanning…" : "Scan now"}</button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 space-y-2">
        {alerts.length === 0 && <p className="text-sm text-ink-600">No alerts. Run a scan to check current conditions.</p>}
        {alerts.map((a) => (
          <div key={a.id} className="rounded-card border border-soil-200 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-ink-900">{a.message}</p>
                <p className="text-xs text-ink-600">{a.alert_type.replace(/_/g, " ")} · {new Date(a.created_at).toLocaleDateString()}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${severityStyles[a.severity]}`}>{a.severity}</span>
            </div>
            {!a.is_read && (
              <button className="text-xs text-canopy-700 underline" type="button" onClick={() => handleMarkRead(a.id)}>Mark read</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
