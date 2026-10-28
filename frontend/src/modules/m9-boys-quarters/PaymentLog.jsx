import { useState } from "react";
import { apiFetch } from "../../api/client.js";
import PayPanel from "./PayPanel.jsx";

const statusStyles = {
  due: "bg-soil-100 text-ink-600",
  on_time: "bg-canopy-50 text-canopy-800",
  late: "bg-harvest-50 text-harvest-600",
  missed: "bg-red-50 text-red-700",
};
const viaLabel = { paystack: "Paystack", auto_charge: "saved card", offline: "recorded by Finance" };

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const due = new Date(dateStr);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

export default function PaymentLog({ application, payments, onChanged, onError }) {
  const [busy, setBusy] = useState(false);
  if (application.planType !== "monthly") return null;

  const paidPayments = payments.filter((p) => p.date);
  const days = daysUntil(application.nextDueDate);
  const card = application.savedCard;

  async function change(fn) {
    setBusy(true); onError?.(null);
    try { await fn(); await onChanged?.(); } catch (e) { onError?.(e.message); } finally { setBusy(false); }
  }
  const setMode = (paymentMode) => change(() => apiFetch("/investments/me/payment-mode", { method: "PATCH", body: { paymentMode } }));
  const removeCard = () => change(() => apiFetch("/investments/me/card", { method: "DELETE" }));

  return (
    <div className="space-y-4">
      <PayPanel application={application} onError={onError} />
      <div className="card">
        {application.nextDueDate && (
          <div className="mb-4 rounded-card bg-soil-50 px-4 py-3">
            <p className="text-sm text-ink-600">Next payment due</p>
            <p className="mt-0.5 text-lg font-medium text-ink-900">
              {application.nextDueDate}
              {days !== null && (
                <span className="ml-2 text-sm font-normal text-ink-600">
                  {days > 0 ? `— ${days} day${days === 1 ? "" : "s"} away` : days === 0 ? "— due today" : `— ${Math.abs(days)} day(s) overdue`}
                </span>
              )}
            </p>
          </div>
        )}

        <p className="text-sm text-ink-600">Payment history</p>
        <div className="mt-2 space-y-1">
          {paidPayments.length === 0 && <p className="text-sm text-ink-600">No payments yet.</p>}
          {paidPayments.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm">
              <span className="text-ink-600">{String(p.date).slice(0, 10)}</span>
              <span className="text-ink-900">₦{p.amount.toLocaleString()}{p.paidVia && <span className="ml-1 text-xs text-ink-500">({viaLabel[p.paidVia] || p.paidVia})</span>}</span>
              <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[p.status]}`}>{p.status.replace("_", " ")}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-soil-200 pt-3 text-sm">
          <p className="font-medium text-ink-900">How each month is paid</p>
          {application.paymentMode === "auto" ? (
            <div className="mt-1 space-y-2">
              <p className="text-xs text-ink-600">
                {card ? `Charged automatically on the due date to your saved ${card.brand || "card"} ending ${card.last4}.` : "Automatic payment is on, but no card is saved yet. Pay once by card (above) and it will be saved."}
                {" "}If a charge fails we tell you straight away and do not try again; you then use Pay now.
              </p>
              <div className="flex gap-3 text-xs">
                <button type="button" className="text-canopy-800 underline" disabled={busy} onClick={() => setMode("manual")}>Switch to Pay now each month</button>
                {card && <button type="button" className="text-red-700 underline" disabled={busy} onClick={removeCard}>Remove saved card</button>}
              </div>
            </div>
          ) : (
            <div className="mt-1 space-y-2">
              <p className="text-xs text-ink-600">You pay each month yourself with Pay now.</p>
              <button type="button" className="text-xs text-canopy-800 underline" disabled={busy} onClick={() => setMode("auto")}>Switch to automatic card payments</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
