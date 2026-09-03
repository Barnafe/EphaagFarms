export default function RepaymentReconciliationPanel({ repayments, onVerify }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Repayment reconciliation</p>
      <p className="mt-1 text-xs text-ink-600">
        Farmer-logged repayments, verified here against the bank record.
      </p>
      <div className="mt-3 space-y-2">
        {repayments.filter((r) => r.status === "unverified").length === 0 && (
          <p className="text-sm text-ink-600">Nothing waiting on verification.</p>
        )}
        {repayments
          .filter((r) => r.status === "unverified")
          .map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
              <div>
                <p className="text-xs font-medium text-canopy-800">{r.loanReference}</p>
                <p className="text-sm text-ink-900">{r.farmerName}</p>
                <p className="text-xs text-ink-600">
                  ₦{r.amount.toLocaleString()} · {r.method} · {r.date}
                </p>
              </div>
              <button className="btn-primary" type="button" onClick={() => onVerify(r.id)}>
                Mark verified
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
