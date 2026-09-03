// Settlement (2026-08-30 spec): the company pays farmers directly when
// Procurement sources from their listing (see procurementController.
// sourceOrder — this is where the `payments` rows this panel shows come
// from). Transporters are staff (paid salary via HR, not per-order) and
// are never part of this screen. Processor settlement wasn't part of this
// spec and isn't built here.
export default function SettlementPanel({ payments, onPay }) {
  const unpaid = payments.filter((p) => p.status === "unpaid");
  const paid = payments.filter((p) => p.status === "paid");

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Settlements — farmer payments</p>
      <p className="mt-1 text-xs text-ink-600">
        Created automatically when Procurement sources a listing. Pay the farmer, then mark it here.
      </p>

      {payments.length === 0 && <p className="mt-4 text-sm text-ink-600">No farmer payments yet.</p>}

      {unpaid.length > 0 && (
        <div className="mt-4 space-y-2">
          {unpaid.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-card border border-soil-200 p-3 text-sm">
              <div>
                <p className="text-xs font-medium text-canopy-800">{p.orderReference}</p>
                <p className="text-ink-900">
                  {p.farmerName} — ₦{p.amount.toLocaleString()}
                </p>
              </div>
              <button className="btn-outline" type="button" onClick={() => onPay(p.id)}>
                Mark paid
              </button>
            </div>
          ))}
        </div>
      )}

      {paid.length > 0 && (
        <div className="mt-4 space-y-1">
          <p className="text-xs text-ink-600">Paid</p>
          {paid.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-xs text-ink-600">
              <span>
                {p.orderReference} — {p.farmerName}
              </span>
              <span>₦{p.amount.toLocaleString()} · Paid</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
