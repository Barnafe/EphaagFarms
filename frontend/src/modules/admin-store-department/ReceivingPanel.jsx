import { useState } from "react";

// "Any goods that comes, store verify and store it physically and update
// the inventory on the portal" — Store's explicit receiving action.
// Quantity received defaults to what the order expected but is editable
// (e.g. shrinkage), and that entered number — not the order's original
// ask — is what actually enters the stock pool.
export default function ReceivingPanel({ orders, onReceive }) {
  const [quantities, setQuantities] = useState({});

  function setQty(itemId, value) {
    setQuantities((prev) => ({ ...prev, [itemId]: value }));
  }

  function handleReceive(order) {
    const items = order.items.map((i) => ({
      orderItemId: i.id,
      quantityReceived: Number(quantities[i.id] ?? i.quantity),
    }));
    onReceive(order.id, items);
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Goods awaiting receipt</p>
      <p className="mt-1 text-xs text-ink-600">
        Processed orders ready to be physically received into store — verify quantity before confirming.
      </p>
      <div className="mt-3 space-y-3">
        {orders.length === 0 && <p className="text-sm text-ink-600">Nothing waiting on receipt.</p>}
        {orders.map((o) => (
          <div key={o.id} className="rounded-card border border-soil-200 p-3">
            <p className="text-xs font-medium text-canopy-800">{o.reference}</p>
            <div className="field mt-2 space-y-2">
              {o.items.map((i) => (
                <div key={i.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-ink-900">{i.crop} — expected {i.quantity} {i.unit}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-28"
                    value={quantities[i.id] ?? i.quantity}
                    onChange={(e) => setQty(i.id, e.target.value)}
                  />
                  <span className="text-xs text-ink-600">{i.unit}</span>
                </div>
              ))}
            </div>
            <button className="btn-primary mt-3" type="button" onClick={() => handleReceive(o)}>
              Confirm receipt
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
