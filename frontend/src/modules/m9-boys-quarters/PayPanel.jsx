import { useState } from "react";
import { apiFetch } from "../../api/client.js";

const naira = (n) => `₦${Number(n || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

// Starts a Paystack payment for whatever the investor owes right now: the one-time (bulk) or first
// monthly payment that activates the investment, or the month that is due ("Pay now").
export default function PayPanel({ application, onError }) {
  const [busy, setBusy] = useState(false);
  const ob = application.obligation;
  if (!ob) return null;
  const activating = ob.kind === "activation";

  async function start() {
    setBusy(true); onError?.(null);
    try {
      const r = await apiFetch("/investments/me/pay", { method: "POST", body: {} });
      if (r.alreadyPaid) { window.location.reload(); return; }
      window.location.assign(r.payment.authorizationUrl);
    } catch (e) {
      onError?.(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3" role="region" aria-label="Payment">
      <p className="text-sm font-medium text-ink-900">
        {activating
          ? application.planType === "bulk" ? "Pay to activate your investment" : "Pay your first month to activate your investment"
          : `Pay now: month due ${ob.dueDate}`}
      </p>
      {application.autoChargeFailed && (
        <p className="rounded-card bg-red-50 px-3 py-2 text-xs text-red-700">
          The automatic charge for this month did not go through ({application.autoChargeFailed.error}). It will not be tried again; please pay now.
        </p>
      )}
      <table className="w-full max-w-sm text-sm">
        <tbody>
          <tr><td className="text-ink-600">{activating && application.planType === "bulk" ? "Investment amount" : "Monthly payment"}</td><td className="text-right text-ink-900">{naira(ob.amount)}</td></tr>
          <tr><td className="text-ink-600">Payment processing fee (Paystack)</td><td className="text-right text-ink-900">{naira(ob.fee)}</td></tr>
          <tr className="border-t border-soil-200 font-medium"><td className="text-ink-900">Total to pay</td><td className="text-right text-ink-900">{naira(ob.total)}</td></tr>
        </tbody>
      </table>
      {activating && application.planType === "monthly" && application.paymentMode === "auto" && (
        <p className="text-xs text-ink-600">You chose automatic payments: pay this first month by card and the card is saved, then charged on each due date.</p>
      )}
      <button type="button" className="btn-primary" disabled={busy} onClick={start}>{busy ? "Opening Paystack…" : "Pay securely with Paystack"}</button>
    </div>
  );
}
