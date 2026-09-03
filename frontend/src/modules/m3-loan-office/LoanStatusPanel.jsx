import { useState } from "react";
import { apiFetch } from "../../api/client.js";

const LOAN_TYPE_LABELS = {
  aided: "Aided loan — no interest",
  boost_cash: "Boost Cash",
  business_fast_cash: "Business fast cash",
};

const statusCopy = {
  none: { label: "No active application", tone: "text-ink-600" },
  pending: { label: "Awaiting Unit Leader review", tone: "text-harvest-600" },
  recommended: { label: "Recommended — awaiting Finance review", tone: "text-harvest-600" },
  finance_verified: { label: "Finance-verified — awaiting final approval", tone: "text-harvest-600" },
  approved: { label: "Approved", tone: "text-harvest-600" },
  rejected: { label: "Rejected", tone: "text-red-700" },
  active: { label: "Active loan", tone: "text-canopy-800" },
};

function StatusTimeline({ loanId }) {
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const { history: h } = await apiFetch(`/loans/${loanId}/history`);
      setHistory(h);
    } catch (err) {
      setError(err.message);
    }
  }

  if (!history) {
    return (
      <button type="button" className="mt-2 text-xs text-canopy-800 underline" onClick={load}>
        View status timeline
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-1 border-t border-soil-200 pt-2">
      {error && <p className="text-xs text-red-700">{error}</p>}
      {history.length === 0 && <p className="text-xs text-ink-600">No status changes recorded yet.</p>}
      {history.map((h) => (
        <div key={h.id} className="text-xs text-ink-600">
          <span className="font-medium text-ink-900">{h.to_status}</span>
          {h.actor_name ? ` — ${h.actor_name}` : ""}
          {h.note ? ` — ${h.note}` : ""}
          <span className="ml-1">({new Date(h.created_at).toLocaleDateString()})</span>
        </div>
      ))}
    </div>
  );
}

export default function LoanStatusPanel({ loan }) {
  const status = statusCopy[loan.status];

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Application status</p>
      <p className={`mt-1 text-lg font-medium ${status.tone}`}>{status.label}</p>
      {loan.reference && loan.status !== "none" && (
        <p className="mt-1 text-xs font-medium text-canopy-800">{loan.reference}</p>
      )}

      {(loan.status === "active" || loan.status === "approved" || loan.status === "finance_verified" || loan.status === "recommended") && (
        <p className="mt-2 text-sm text-ink-600">
          {LOAN_TYPE_LABELS[loan.loanType] || loan.loanType}
          {loan.repaymentMonths ? ` · ${loan.repaymentMonths}mo repayment` : ""}{" "}
          · ₦{loan.amount.toLocaleString()} total
        </p>
      )}

      {loan.status === "rejected" && (
        <div className="mt-2 space-y-1 text-sm">
          <p className="text-ink-600">Reason: {loan.rejectionReason}</p>
          <p className="text-ink-600">
            You can reapply after {loan.reapplyAfter} — this waiting period depends on
            the reason for rejection.
          </p>
        </div>
      )}

      {loan.id && loan.status !== "none" && <StatusTimeline loanId={loan.id} />}
    </div>
  );
}
