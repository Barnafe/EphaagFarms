import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const PARAMS = { savingsPayment: "savings deposit", repaymentPayment: "loan repayment", boostPayment: "Boost Cash deposit" };

// When Paystack sends the farmer back, ask what happened to the payment and say so plainly.
export default function PaymentReturnBanner({ onSettled }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const key = Object.keys(PARAMS).find((k) => q.get(k));
    if (!key) return undefined;
    const ref = q.get(key);
    let tries = 0, stop = false;
    (async function check() {
      try {
        const st = await apiFetch(`/payments/status/${encodeURIComponent(ref)}`);
        if (stop) return;
        setState({ ...st, what: PARAMS[key] });
        if (st.outcome === "pending" && tries++ < 8) { setTimeout(check, 2500); return; }
      } catch { /* the page still works without the message */ }
      window.history.replaceState({}, "", window.location.pathname);
      onSettled?.();
    })();
    return () => { stop = true; };
  }, [onSettled]);
  if (!state) return null;
  const tone = state.outcome === "success" ? "border-canopy-200 bg-canopy-50" : state.outcome === "pending" ? "border-harvest-200 bg-harvest-50" : "border-red-200 bg-red-50";
  return (
    <div className={`card mb-6 ${tone}`} role="status">
      <p className="text-sm text-ink-900">
        {state.outcome === "success" && `Your ${state.what} was received. Thank you.`}
        {state.outcome === "pending" && `We are still waiting for Paystack to confirm your ${state.what}. This updates by itself.`}
        {state.outcome === "failed" && `Your ${state.what} did not go through. Nothing was taken, so you can try again.`}
        {state.outcome === "refused" && `Your ${state.what} arrived but could not be used because ${state.refusalText || "it could not be applied"}. Our administrators have been told and will return the money to you.`}
        {state.outcome === "expired" && `That payment page has expired. Please start again.`}
      </p>
    </div>
  );
}
