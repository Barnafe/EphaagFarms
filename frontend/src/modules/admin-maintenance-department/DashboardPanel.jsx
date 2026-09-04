import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

function countFor(rows, status) {
  return rows?.find((r) => r.status === status)?.count || 0;
}

export default function DashboardPanel({ onNavigate }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch("/maintenance/dashboard")
      .then(setSummary)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="card border-red-200 bg-red-50">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (!summary) return <p className="text-sm text-canopy-100">Loading…</p>;

  const openRequests = countFor(summary.requestsByStatus, "submitted") + countFor(summary.requestsByStatus, "under_review");
  const activeWorkOrders = summary.workOrdersByStatus
    .filter((r) => !["completed", "cancelled"].includes(r.status))
    .reduce((sum, r) => sum + r.count, 0);
  const assetsInRepair = countFor(summary.assetsByStatus, "in_repair") + countFor(summary.assetsByStatus, "due");

  const cards = [
    { label: "Open requests", value: openRequests, nav: "maintenance", hint: "Awaiting supervisor review" },
    { label: "Active work orders", value: activeWorkOrders, nav: "maintenance", hint: "In progress across all statuses" },
    { label: "Assets needing attention", value: assetsInRepair, nav: "maintenance", hint: "Due for service or in repair" },
    { label: "Low-stock parts", value: summary.lowStockParts, nav: "maintenance", hint: "At or below reorder level" },
    { label: "Preventive tasks due soon", value: summary.scheduleDueSoon, nav: "preventive", hint: "Within the next 7 days" },
    {
      label: "This month's expenses",
      value: `₦${summary.monthToDateExpense.toLocaleString()}`,
      nav: "maintenance",
      hint: "Month-to-date",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => onNavigate?.(c.nav)}
          className="card flex flex-col items-start gap-1 text-left transition hover:border-canopy-400 hover:shadow-md"
        >
          <p className="text-sm text-ink-600">{c.label}</p>
          <p className="text-2xl font-medium text-ink-900">{c.value}</p>
          <p className="text-xs text-ink-600">{c.hint}</p>
        </button>
      ))}
    </div>
  );
}
