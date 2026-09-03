const LOAN_TYPE_LABELS = {
  aided: "Aided loan (no interest)",
  boost_cash: "Boost Cash",
  business_fast_cash: "Business fast cash",
};

export default function LoanDisbursementPanel({ loans, onDisburse }) {
  const approved = loans.filter((l) => l.status === "approved");
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Loan disbursements</p>
      <p className="mt-1 text-xs text-ink-600">Federal-approved loans awaiting funds release.</p>
      <div className="mt-3 space-y-2">
        {approved.length === 0 && <p className="text-sm text-ink-600">Nothing awaiting disbursement.</p>}
        {approved.map((l) => (
          <div key={l.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
            <div>
              <p className="text-xs font-medium text-canopy-800">{l.loanReference}</p>
              <p className="text-sm text-ink-900">{l.farmerName}</p>
              <p className="text-xs text-ink-600">
                {LOAN_TYPE_LABELS[l.loanType] || l.loanType} · ₦{l.amount.toLocaleString()}
                {l.repaymentMonths ? ` · ${l.repaymentMonths}mo repayment` : ""}
              </p>
            </div>
            <button className="btn-primary" type="button" onClick={() => onDisburse(l.id)}>
              Mark disbursed
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
