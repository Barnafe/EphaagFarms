import { useState } from "react";

function StockCheckRow({ row }) {
  return (
    <div className="flex justify-between text-xs">
      <span className={row.sufficient ? "text-ink-600" : "text-red-700"}>
        {row.required} {row.unit} {row.crop}
      </span>
      <span className={row.sufficient ? "text-ink-600" : "text-red-700"}>
        {row.available} {row.unit} available
      </span>
    </div>
  );
}

function OrderCard({ order, distributors, selected, onSelectDistributor, onAudit, onAllocate }) {
  const [note, setNote] = useState("");
  const [showAuditForm, setShowAuditForm] = useState(!order.audit);

  const audit = order.audit;
  const passed = audit?.verified === true;

  async function submitAudit(verified) {
    await onAudit(order.id, verified, note);
    setNote("");
    setShowAuditForm(false);
  }

  return (
    <div className="rounded-card border border-soil-200 p-3">
      <p className="text-xs font-medium text-canopy-800">{order.orderReference}</p>
      <p className="text-xs text-ink-600">To {order.deliveryLocation}</p>

      <div className="mt-2 space-y-1">
        {order.stockCheck.breakdown.map((row, i) => (
          <StockCheckRow key={i} row={row} />
        ))}
      </div>
      {!order.stockCheck.sufficient && (
        <p className="mt-1 text-xs text-red-700">Not enough stock on hand for every item on this order.</p>
      )}

      {audit && (
        <p className={`mt-2 text-xs font-medium ${passed ? "text-canopy-800" : "text-red-700"}`}>
          {passed ? "Audit passed" : "Audit failed"}
          {audit.note ? ` — ${audit.note}` : ""}
        </p>
      )}

      {showAuditForm ? (
        <div className="mt-2 space-y-2">
          <textarea
            className="w-full"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Audit note — quality/stock verification (optional)"
          />
          <div className="flex gap-2">
            <button type="button" className="btn-outline flex-1 text-xs" onClick={() => submitAudit(false)}>
              Fails audit
            </button>
            <button type="button" className="btn-primary flex-1 text-xs" onClick={() => submitAudit(true)}>
              Verified — passes audit
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="mt-2 text-xs text-canopy-800 underline" onClick={() => setShowAuditForm(true)}>
          Re-audit
        </button>
      )}

      {passed && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-soil-200 pt-3">
          <select
            className="rounded-card border border-soil-200 px-2 py-1 text-sm"
            value={selected ?? ""}
            onChange={(e) => onSelectDistributor(order.id, e.target.value)}
          >
            <option value="">Choose a distributor</option>
            {distributors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button className="btn-primary" type="button" disabled={!selected} onClick={() => onAllocate(order.id)}>
            Allocate — confirm taken out of store
          </button>
        </div>
      )}
    </div>
  );
}

export default function AllocationPanel({ orders, distributors, onAudit, onAllocate }) {
  const [selected, setSelected] = useState({});

  function handleSelectDistributor(orderId, distributorId) {
    setSelected((prev) => ({ ...prev, [orderId]: distributorId }));
  }

  function handleAllocate(orderId) {
    const distributorId = selected[orderId];
    if (!distributorId) return;
    onAllocate(orderId, distributorId);
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Awaiting allocation</p>
      <p className="mt-1 text-xs text-ink-600">
        Audit each order against stock and quality before it can be allocated to a distributor and taken out
        of the store.
      </p>
      <div className="mt-3 space-y-3">
        {orders.length === 0 && <p className="text-sm text-ink-600">Nothing waiting on allocation.</p>}
        {orders.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            distributors={distributors}
            selected={selected[o.id]}
            onSelectDistributor={handleSelectDistributor}
            onAudit={onAudit}
            onAllocate={handleAllocate}
          />
        ))}
      </div>
    </div>
  );
}
