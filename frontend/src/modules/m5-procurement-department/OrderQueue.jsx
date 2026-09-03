const statusStyles = {
  paid: "bg-soil-100 text-ink-600",
  sourcing: "bg-harvest-50 text-harvest-600",
};

const statusLabel = {
  paid: "Awaiting sourcing",
  sourcing: "Sourcing in progress",
};

export default function OrderQueue({ orders, selectedId, onSelect }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Order queue</p>
      <div className="mt-3 space-y-2">
        {orders.length === 0 && <p className="text-sm text-ink-600">Nothing to source right now.</p>}
        {orders.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onSelect(o.id)}
            className={`block w-full rounded-card border px-3 py-2 text-left ${
              selectedId === o.id ? "border-canopy-600 bg-canopy-50" : "border-soil-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-canopy-800">{o.reference}</p>
              <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[o.status]}`}>
                {statusLabel[o.status]}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-900">
              {o.items.map((i) => `${i.quantity} ${i.unit} ${i.crop}`).join(", ")}
            </p>
            <p className="text-xs text-ink-600">{o.deliveryLocation}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
