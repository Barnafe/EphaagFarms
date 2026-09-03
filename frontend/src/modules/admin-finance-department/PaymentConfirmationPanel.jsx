export default function PaymentConfirmationPanel({ orders, onConfirm }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Payment confirmations</p>
      <p className="mt-1 text-xs text-ink-600">
        Procurement can't start sourcing an order until it's confirmed here.
      </p>
      <div className="mt-3 space-y-2">
        {orders.filter((o) => o.status === "pending").length === 0 && (
          <p className="text-sm text-ink-600">Nothing waiting on confirmation.</p>
        )}
        {orders
          .filter((o) => o.status === "pending")
          .map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
              <div>
                <p className="text-xs font-medium text-canopy-800">{o.orderReference}</p>
                <p className="text-sm text-ink-900">{o.buyerName}</p>
                <p className="text-xs text-ink-600">₦{o.amount.toLocaleString()}</p>
              </div>
              <button className="btn-primary" type="button" onClick={() => onConfirm(o.id)}>
                Confirm payment
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
