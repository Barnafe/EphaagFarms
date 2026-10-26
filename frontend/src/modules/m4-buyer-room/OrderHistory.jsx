import { useState } from "react";

const statusStyles = {
  awaiting_payment: "bg-harvest-50 text-harvest-600",
  payment_failed: "bg-red-50 text-red-700",
  cancelled: "bg-soil-100 text-ink-600",
  expired: "bg-soil-100 text-ink-600",
  refunded: "bg-soil-100 text-ink-600",
  paid: "bg-soil-100 text-ink-600",
  payment_confirmed: "bg-soil-100 text-ink-600",
  sourcing: "bg-harvest-50 text-harvest-600",
  processing: "bg-harvest-50 text-harvest-600",
  allocated: "bg-harvest-50 text-harvest-600",
  in_transit: "bg-harvest-50 text-harvest-600",
  delivered: "bg-canopy-50 text-canopy-800",
};

const statusLabel = {
  awaiting_payment: "Awaiting payment",
  payment_failed: "Payment failed",
  cancelled: "Cancelled",
  expired: "Expired (not paid in time)",
  refunded: "Refunded",
  paid: "Paid — awaiting confirmation",
  payment_confirmed: "Payment confirmed",
  sourcing: "Sourcing from farmers",
  processing: "Processing",
  allocated: "Allocated for delivery",
  in_transit: "In transit",
  delivered: "Delivered",
};

const naira = (n) => `₦${Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export default function OrderHistory({ orders, onPay, onCancel, onReceipt }) {
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(null);

  async function run(id, fn) {
    setBusy(id);
    try { await fn(); } finally { setBusy(null); }
  }
  async function showReceipt(id) {
    const r = await onReceipt(id);
    if (r) setReceipt(r);
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Your orders</p>
      <div className="mt-3 space-y-3">
        {orders.length === 0 && <p className="text-sm text-ink-600">No orders yet.</p>}
        {orders.map((o) => (
          <div key={o.id} className="rounded-card border border-soil-200 px-3 py-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-canopy-800">{o.reference}</p>
              <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[o.status] || ""}`}>
                {o.waitingForTransfer ? "Waiting for your transfer" : statusLabel[o.status] || o.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-600">{o.deliveryLocation} · {naira(o.total)} · {o.date}</p>
            <ul className="mt-2 space-y-1">
              {o.items.map((line, i) => (
                <li key={i} className="text-sm text-ink-900">
                  {line.quantity} {line.unit} {line.crop}{line.size ? ` · ${line.size}` : ""}
                </li>
              ))}
            </ul>
            {(o.canPay || o.canCancel || o.hasReceipt) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {o.canPay && <button className="btn-primary" disabled={busy === o.id} onClick={() => run(o.id, () => onPay(o.id))}>Pay now</button>}
                {o.canCancel && <button className="rounded-card border border-soil-200 px-3 py-1.5 text-sm text-ink-700" disabled={busy === o.id} onClick={() => run(o.id, () => onCancel(o.id))}>Cancel order</button>}
                {o.hasReceipt && <button className="rounded-card border border-soil-200 px-3 py-1.5 text-sm text-ink-700" onClick={() => showReceipt(o.id)}>Receipt</button>}
              </div>
            )}
            {o.status === "awaiting_payment" && o.expiresAt && <p className="mt-2 text-xs text-ink-600">Pay before {new Date(o.expiresAt).toLocaleString()} or this order expires.</p>}
          </div>
        ))}
      </div>

      {receipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReceipt(null)}>
          <div className="on-light w-full max-w-sm rounded-card bg-white p-5 text-sm text-gray-800" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-medium">Receipt</p>
            <p className="text-xs text-gray-500">{receipt.orderReference} · paid {new Date(receipt.paidAt).toLocaleString()}</p>
            <ul className="mt-3 space-y-1">
              {receipt.items.map((i, k) => <li key={k} className="flex justify-between"><span>{Number(i.quantity)} {i.unit} {i.crop}</span><span>{naira(i.line_total)}</span></li>)}
            </ul>
            <div className="mt-3 space-y-1 border-t pt-2">
              <div className="flex justify-between"><span>Goods</span><span>{naira(receipt.goodsTotal)}</span></div>
              {receipt.fee > 0 && <div className="flex justify-between"><span>Payment processing fee</span><span>{naira(receipt.fee)}</span></div>}
              <div className="flex justify-between font-semibold"><span>Total paid</span><span>{naira(receipt.totalPaid)}</span></div>
            </div>
            <p className="mt-2 text-xs text-gray-500">{receipt.method}{receipt.paymentReference ? ` · ${receipt.paymentReference}` : ""}</p>
            <button className="btn-primary mt-4 w-full" onClick={() => setReceipt(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
