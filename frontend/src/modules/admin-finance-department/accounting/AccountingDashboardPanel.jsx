import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

function naira(n) {
  return `₦${Number(n || 0).toLocaleString()}`;
}

export default function AccountingDashboardPanel({ onNavigate }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch("/finance-department/dashboard").then(setSummary).catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <div className="card border-red-200 bg-red-50">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (!summary) return <p className="text-sm text-canopy-100">Loading…</p>;

  const cards = [
    { label: "Cash position", value: naira(summary.cashPosition), nav: "bank-cash", hint: "Across all active accounts" },
    { label: "Month-to-date revenue", value: naira(summary.monthToDateRevenue), nav: "income", hint: "This calendar month" },
    { label: "Month-to-date expenses", value: naira(summary.monthToDateExpenses), nav: "expenses", hint: "This calendar month" },
    { label: "Accounts receivable", value: naira(summary.accountsReceivable), nav: "receivables", hint: "Outstanding from customers" },
    { label: "Accounts payable", value: naira(summary.accountsPayable), nav: "payables", hint: "Owed to suppliers/contractors" },
    { label: "Pending requests", value: summary.pendingRequests, nav: "approvals", hint: "Awaiting a decision" },
    { label: "Pending payments", value: summary.pendingPayments, nav: "payments", hint: "Requested through scheduled" },
    {
      label: "Budget utilization",
      value: `${Math.round((summary.budgetUtilization || 0) * 100)}%`,
      nav: "budgets",
      hint: `${naira(summary.budgetSpent)} of ${naira(summary.budgetAllocated)}`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink-900">Department spending (this month)</p>
            <button type="button" className="text-xs text-canopy-700 underline" onClick={() => onNavigate?.("monitoring")}>
              View all
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {summary.departmentSpending.length === 0 && <p className="text-sm text-ink-600">Nothing recorded yet.</p>}
            {summary.departmentSpending.map((d) => (
              <div key={d.department} className="flex items-center justify-between text-sm">
                <span className="text-ink-700">{d.department}</span>
                <span className="font-medium text-ink-900">{naira(d.total)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-ink-900">Financial alerts</p>
            <button type="button" className="text-xs text-canopy-700 underline" onClick={() => onNavigate?.("alerts")}>
              View all
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {summary.financialAlerts.length === 0 && <p className="text-sm text-ink-600">No open alerts.</p>}
            {summary.financialAlerts.map((a) => (
              <div key={a.id} className="rounded-card border border-soil-200 px-3 py-2">
                <p className="text-sm text-ink-900">{a.message}</p>
                <p className="text-xs text-ink-600">{a.alert_type.replace(/_/g, " ")} · {a.severity}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <p className="text-sm font-medium text-ink-900">Recent transactions</p>
        <div className="mt-3 space-y-2">
          {summary.recentTransactions.length === 0 && <p className="text-sm text-ink-600">No transactions yet.</p>}
          {summary.recentTransactions.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2 text-sm">
              <div>
                <p className="text-ink-900">{t.description || t.reference}</p>
                <p className="text-xs text-ink-600">{t.reference} · {t.txn_type}</p>
              </div>
              <span className="font-medium text-ink-900">{naira(t.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
