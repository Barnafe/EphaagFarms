const LOAN_TYPE_LABELS = {
  aided: "Aided loan (no interest)",
  boost_cash: "Boost Cash",
  business_fast_cash: "Business fast cash",
};

export default function FinanceReviewPanel({ loans, onVerify, onReject }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Finance review</p>
      <p className="mt-1 text-xs text-ink-600">
        Unit-Leader-recommended loans awaiting a credit/financial-standing check. Open the applicant's
        grading indices before deciding.
      </p>
      <div className="mt-3 space-y-2">
        {loans.length === 0 && <p className="text-sm text-ink-600">Nothing awaiting review.</p>}
        {loans.map((l) => (
          <div key={l.id} className="rounded-card border border-soil-200 px-3 py-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-canopy-800">{l.loanReference}</p>
                <p className="text-sm text-ink-900">{l.farmerName}</p>
                <p className="text-xs text-ink-600">
                  {LOAN_TYPE_LABELS[l.loanType] || l.loanType} · ₦{l.amount.toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn-outline" type="button" onClick={() => onReject(l.id)}>
                  Reject
                </button>
                <button className="btn-primary" type="button" onClick={() => onVerify(l.id)}>
                  Verify & pass on
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
