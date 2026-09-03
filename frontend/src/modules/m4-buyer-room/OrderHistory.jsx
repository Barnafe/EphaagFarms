const statusStyles = {
  paid: "bg-soil-100 text-ink-600",
  payment_confirmed: "bg-soil-100 text-ink-600",
  sourcing: "bg-harvest-50 text-harvest-600",
  processing: "bg-harvest-50 text-harvest-600",
  allocated: "bg-harvest-50 text-harvest-600",
  in_transit: "bg-harvest-50 text-harvest-600",
  delivered: "bg-canopy-50 text-canopy-800",
};

const statusLabel = {
  paid: "Paid — awaiting sourcing",
  payment_confirmed: "Payment confirmed",
  sourcing: "Sourcing from farmers",
  processing: "Processing",
  allocated: "Allocated for delivery",
  in_transit: "In transit",
  delivered: "Delivered",
};

export default function OrderHistory({ orders }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Your orders</p>
      <div className="mt-3 space-y-3">
        {orders.length === 0 && <p className="text-sm text-ink-600">No orders yet.</p>}
        {orders.map((o) => (
          <div key={o.id} className="rounded-card border border-soil-200 px-3 py-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-canopy-800">{o.reference}</p>
              <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[o.status]}`}>
                {statusLabel[o.status]}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-600">
              {o.deliveryLocation} · ₦{o.total.toLocaleString()} · {o.date}
            </p>
            <ul className="mt-2 space-y-1">
              {o.items.map((line, i) => (
                <li key={i} className="text-sm text-ink-900">
                  {line.quantity} {line.unit} {line.crop}
                  {line.size ? ` · ${line.size}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
