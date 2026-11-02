import { useEffect, useState } from "react";
import { apiFetch } from "../api/client.js";

const naira = (n) => `₦${Number(n).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// The one place a customer sees the gateway charge: Amount, Paystack Charges,
// Total, then "Proceed & Pay". Pass `amount` to fetch the charge, or pass `fee`
// and `total` when the server has already worked them out.
export default function PaymentPreview({ amount, fee, total, amountLabel = "Amount", amountTestId, totalTestId, onProceed, busy = false, disabled = false, buttonLabel = "Proceed & Pay" }) {
  const given = fee != null && total != null;
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (given) return undefined;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { setQuote(null); setError(null); return undefined; }
    let cancelled = false;
    const t = setTimeout(() => {
      apiFetch(`/payments/fee-quote?amount=${encodeURIComponent(n)}`)
        .then((q) => { if (!cancelled) { setQuote(q); setError(null); } })
        .catch((e) => { if (!cancelled) { setQuote(null); setError(e.message); } });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [amount, given]);

  const q = given ? { amount: Number(amount), fee, total, available: true } : quote;
  if (!q && !error) return null;

  return (
    <div className="on-light space-y-3 rounded-card border border-soil-200 bg-white p-4 text-sm">
      {error && <p className="text-red-700">{error}</p>}
      {q && (
        <>
          <div className="space-y-1">
            <div className="flex justify-between"><span className="text-gray-600">{amountLabel}</span><span className="text-gray-900" data-testid={amountTestId}>{naira(q.amount)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Paystack Charges</span><span className="text-gray-900">{naira(q.fee)}</span></div>
            <div className="flex justify-between border-t border-soil-200 pt-1 font-semibold"><span>Total</span><span data-testid={totalTestId}>{naira(q.total)}</span></div>
          </div>
          {!q.available && <p className="text-red-700">Online payment is unavailable right now. Please try again later.</p>}
          <button type="button" className="btn-primary w-full" onClick={onProceed} disabled={busy || disabled || !q.available}>
            {busy ? "Please wait…" : buttonLabel}
          </button>
        </>
      )}
    </div>
  );
}
