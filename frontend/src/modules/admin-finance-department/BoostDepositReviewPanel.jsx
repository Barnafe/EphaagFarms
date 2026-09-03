export default function BoostDepositReviewPanel({ deposits, onVerify }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Boost Cash deposits awaiting verification</p>
      <div className="mt-3 space-y-2">
        {deposits.length === 0 && <p className="text-sm text-ink-600">Nothing pending.</p>}
        {deposits.map((d) => (
          <div key={d.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
            <div>
              <p className="text-sm text-ink-900">{d.farmerName}</p>
              <p className="text-xs text-ink-600">
                ₦{d.intendedLoanAmount.toLocaleString()} loan · ₦{d.depositAmount.toLocaleString()} deposit paid{" "}
                {new Date(d.paidAt).toLocaleDateString()}
              </p>
            </div>
            <button className="btn-primary" type="button" onClick={() => onVerify(d.id)}>
              Verify
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
