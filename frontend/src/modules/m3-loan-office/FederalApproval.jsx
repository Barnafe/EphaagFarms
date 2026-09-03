export default function FederalApproval({ applications, onDecide }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">
        Recommended applications <span className="text-xs">(Federal/CEO final approval)</span>
      </p>
      <div className="mt-3 space-y-3">
        {applications.length === 0 && (
          <p className="text-sm text-ink-600">Nothing awaiting final approval.</p>
        )}
        {applications.map((app) => (
          <div key={app.id} className="rounded-card border border-soil-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-ink-900">{app.farmerName}</p>
                <p className="text-xs text-ink-600">
                  {{ aided: "Aided loan", boost_cash: "Boost Cash", business_fast_cash: "Business fast cash" }[app.loanType] || app.loanType} · ₦{app.amount.toLocaleString()}
                </p>
                <p className="text-xs text-ink-600">Recommended by {app.recommendedBy}</p>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary" onClick={() => onDecide(app.id, "active")}>
                  Approve
                </button>
                <button className="btn-outline" onClick={() => onDecide(app.id, "rejected")}>
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
