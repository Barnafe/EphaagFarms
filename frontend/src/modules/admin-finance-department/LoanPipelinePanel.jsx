const LOAN_TYPE_LABELS = {
  aided: "Aided loan (no interest)",
  boost_cash: "Boost Cash",
  business_fast_cash: "Business fast cash",
};

// Shared shape for the two farmer-rank-gated pipeline stages (Unit Leader
// recommend, Federal final approval) that admin now performs too, per the
// 2026-08-30 temporary-universal-access spec — admin acts company-wide
// here rather than for one specific unit, since there's no single
// jurisdiction to attribute to an admin account.
export default function LoanPipelinePanel({ title, blurb, loans, primaryLabel, onPrimary, onReject }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">{title}</p>
      <p className="mt-1 text-xs text-ink-600">{blurb}</p>
      <div className="mt-3 space-y-2">
        {loans.length === 0 && <p className="text-sm text-ink-600">Nothing waiting here.</p>}
        {loans.map((l) => (
          <div key={l.id} className="rounded-card border border-soil-200 px-3 py-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-canopy-800">{l.loanReference}</p>
                <p className="text-sm text-ink-900">{l.farmerName}</p>
                <p className="text-xs text-ink-600">
                  {LOAN_TYPE_LABELS[l.loanType] || l.loanType} · ₦{l.amount.toLocaleString()} ·{" "}
                  {l.repaymentMonths} months
                </p>
              </div>
              <div className="flex gap-2">
                {onReject && (
                  <button className="btn-outline" type="button" onClick={() => onReject(l.id)}>
                    Reject
                  </button>
                )}
                <button className="btn-primary" type="button" onClick={() => onPrimary(l.id)}>
                  {primaryLabel}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
