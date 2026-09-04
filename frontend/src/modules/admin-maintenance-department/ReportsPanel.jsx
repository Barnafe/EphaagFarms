import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

export default function ReportsPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch("/maintenance/reports")
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="card border-red-200 bg-red-50"><p className="text-sm text-red-700">{error}</p></div>;
  if (!data) return <p className="text-sm text-ink-600">Loading…</p>;

  const maxAssetCount = Math.max(1, ...data.workOrdersByAsset.map((r) => r.work_order_count));
  const maxMonthTotal = Math.max(1, ...data.expenseByMonth.map((r) => Number(r.total)));
  const totalByCategory = data.expenseByCategory.reduce((s, r) => s + Number(r.total), 0) || 1;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm text-ink-600">Total recorded spend</p>
          <p className="mt-1 text-2xl font-medium text-ink-900">
            ₦{data.expenseByCategory.reduce((s, r) => s + Number(r.total), 0).toLocaleString()}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-ink-600">Average completion time</p>
          <p className="mt-1 text-2xl font-medium text-ink-900">
            {data.avgCompletionDays != null ? `${data.avgCompletionDays.toFixed(1)} days` : "—"}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-ink-600">Assets with the most work orders</p>
          <p className="mt-1 text-2xl font-medium text-ink-900">{data.workOrdersByAsset[0]?.asset_name || "—"}</p>
        </div>
      </div>

      <div className="card">
        <p className="text-sm text-ink-600">Spend by category</p>
        <div className="mt-3 space-y-2">
          {data.expenseByCategory.length === 0 && <p className="text-sm text-ink-600">No expenses recorded yet.</p>}
          {data.expenseByCategory.map((r) => (
            <div key={r.category}>
              <div className="flex justify-between text-xs text-ink-600">
                <span className="capitalize">{r.category}</span>
                <span>₦{Number(r.total).toLocaleString()}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-soil-100">
                <div
                  className="h-2 rounded-full bg-clay-600"
                  style={{ width: `${(Number(r.total) / totalByCategory) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <p className="text-sm text-ink-600">Spend by month</p>
        <div className="mt-3 space-y-2">
          {data.expenseByMonth.length === 0 && <p className="text-sm text-ink-600">No expenses recorded yet.</p>}
          {data.expenseByMonth.map((r) => (
            <div key={r.month}>
              <div className="flex justify-between text-xs text-ink-600">
                <span>{r.month}</span>
                <span>₦{Number(r.total).toLocaleString()}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-soil-100">
                <div
                  className="h-2 rounded-full bg-canopy-600"
                  style={{ width: `${(Number(r.total) / maxMonthTotal) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card">
          <p className="text-sm text-ink-600">Work orders by asset</p>
          <div className="mt-3 space-y-2">
            {data.workOrdersByAsset.length === 0 && <p className="text-sm text-ink-600">No data yet.</p>}
            {data.workOrdersByAsset.map((r) => (
              <div key={r.asset_name}>
                <div className="flex justify-between text-xs text-ink-600">
                  <span>{r.asset_name}</span>
                  <span>{r.work_order_count}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-soil-100">
                  <div
                    className="h-2 rounded-full bg-harvest-500"
                    style={{ width: `${(r.work_order_count / maxAssetCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <p className="text-sm text-ink-600">Technician load (completed orders)</p>
          <div className="mt-3 space-y-2">
            {data.technicianLoad.length === 0 && <p className="text-sm text-ink-600">No technicians yet.</p>}
            {data.technicianLoad.map((t) => (
              <div key={t.name} className="flex items-center justify-between text-sm">
                <span className="text-ink-800">{t.name}</span>
                <span className="text-ink-600">{t.completed_count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
