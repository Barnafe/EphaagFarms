import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const naira = (n) => `₦${Number(n).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// Final checkout step. Orders paid from the standing balance are placed straight
// away. Everything else shows the payment preview (Amount, Paystack Charges, Total)
// and the "Proceed & Pay" button; the order only counts once the payment is confirmed.
export default function PaymentStep({ total, paidVia, onConfirm, onBack, submitting }) {
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const useBalance = paidVia === "balance";

  useEffect(() => {
    if (useBalance) return;
    let cancelled = false;
    apiFetch(`/orders/fee-quote?amount=${encodeURIComponent(total)}`)
      .then((q) => !cancelled && setQuote(q))
      .catch((e) => !cancelled && setQuoteError(e.message));
    return () => { cancelled = true; };
  }, [total, useBalance]);

  const unavailable = !useBalance && quote && !quote.paystackAvailable;

  return (
    <div className="on-light rounded-card border border-soil-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">Payment</p>
        <button type="button" onClick={onBack} className="text-sm text-canopy-800">← Back</button>
      </div>

      {useBalance ? (
        <div className="rounded-card bg-canopy-50 px-4 py-3 text-sm text-canopy-800">
          This order will be paid from your standing commitment balance.
        </div>
      ) : (
        <>
          {quoteError && <p className="text-sm text-red-700">{quoteError}</p>}
          {unavailable && (
            <p className="rounded-card border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Online payment is unavailable right now. Please try again later.
            </p>
          )}
        </>
      )}

      <div className="space-y-1 rounded-card bg-soil-50 px-3 py-2.5 text-sm">
        <div className="flex justify-between"><span className="text-gray-600">Amount</span><span className="text-gray-900">{naira(total)}</span></div>
        {!useBalance && quote && (
          <>
            <div className="flex justify-between"><span className="text-gray-600">Paystack Charges</span><span className="text-gray-900">{naira(quote.fee)}</span></div>
            <div className="flex justify-between border-t border-soil-200 pt-1 font-semibold"><span>Total</span><span>{naira(quote.amountCharged)}</span></div>
          </>
        )}
        {useBalance && <div className="flex justify-between border-t border-soil-200 pt-1 font-semibold"><span>Total</span><span>{naira(total)}</span></div>}
      </div>

      <button className="btn-primary w-full" type="button" onClick={onConfirm} disabled={submitting || unavailable || (!useBalance && !quote)}>
        {submitting ? "Please wait…" : useBalance ? "Place order" : "Proceed & Pay"}
      </button>
      {!useBalance && <p className="text-xs text-gray-500">Unpaid orders expire after 24 hours.</p>}
    </div>
  );
}
