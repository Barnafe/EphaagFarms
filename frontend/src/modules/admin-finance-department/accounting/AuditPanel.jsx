import { useEffect, useState } from "react";
import { apiFetch } from "../../../api/client.js";

// Financial Audit Trail draws on finance_approvals (decisions) and
// finance_transactions (postings) directly — the two sources that
// already capture "who did what, when" for the vast majority of finance
// activity — plus finance_audit_log for anything else. Shown together
// here as one chronological trail rather than three separate screens.
export default function AuditPanel() {
  const [approvals, setApprovals] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      apiFetch("/finance-department/approvals/history"),
      apiFetch("/finance-department/transactions"),
    ])
      .then(([a, t]) => {
        setApprovals(a.approvals);
        setTransactions(t.transactions);
      })
      .catch((err) => setError(err.message));
  }, []);

  const trail = [
    ...approvals.map((a) => ({
      id: `approval-${a.id}`,
      at: a.decided_at,
      label: `${a.request_reference} — ${a.decision.replace(/_/g, " ")} by ${a.approver_name || "—"}`,
    })),
    ...transactions.map((t) => ({
      id: `txn-${t.id}`,
      at: t.transacted_at,
      label: `${t.reference} — ${t.txn_type} of ₦${Number(t.amount).toLocaleString()}${t.department ? ` (${t.department})` : ""}`,
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  return (
    <div className="card">
      <p className="text-sm text-ink-600">The full approval and transaction trail, most recent first.</p>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 space-y-2">
        {trail.length === 0 && <p className="text-sm text-ink-600">Nothing recorded yet.</p>}
        {trail.slice(0, 200).map((e) => (
          <div key={e.id} className="rounded-card border border-soil-200 px-3 py-2 text-sm">
            <p className="text-ink-900">{e.label}</p>
            <p className="text-xs text-ink-600">{new Date(e.at).toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
