import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, XCircle, AlertTriangle } from "lucide-react";
import { apiFetch } from "../../api/client.js";

const naira = (n) => `₦${Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

// Where Paystack sends the buyer back to. We ask the server (which asks
// Paystack) what happened, and keep checking while a bank transfer is pending.
export default function PaymentReturn() {
  const [params] = useSearchParams();
  const reference = params.get("reference") || params.get("trxref");
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const tries = useRef(0);

  const check = useCallback(async () => {
    try {
      const s = await apiFetch(`/payments/status/${encodeURIComponent(reference)}`);
      setState(s);
      setError(null);
      return s;
    } catch (e) { setError(e.message); return null; }
  }, [reference]);

  useEffect(() => {
    if (!reference) return;
    let timer;
    const loop = async () => {
      const s = await check();
      tries.current += 1;
      if (s?.outcome === "pending" && tries.current < 60) timer = setTimeout(loop, 5000);
    };
    loop();
    return () => clearTimeout(timer);
  }, [reference, check]);

  async function retry() {
    if (!state?.order?.id) return;
    setRetrying(true);
    try {
      const r = await apiFetch(`/orders/${state.order.id}/pay`, { method: "POST" });
      if (r.payment?.authorizationUrl) window.location.href = r.payment.authorizationUrl;
      else await check();
    } catch (e) { setError(e.message); } finally { setRetrying(false); }
  }

  const back = () => navigate("/dashboard/buyer");
  let body;
  if (!reference) body = <Msg icon={XCircle} tone="red" title="No payment to check" text="This page needs a payment reference." />;
  else if (error && !state) body = <Msg icon={XCircle} tone="red" title="Could not check the payment" text={error} />;
  else if (!state) body = <p className="text-sm text-gray-600">Checking your payment…</p>;
  else if (state.outcome === "success") {
    body = <Msg icon={CheckCircle2} tone="green" title="Payment received"
      text={state.payment.type === "commitment"
        ? `${naira(state.payment.goodsTotal)} has been added to your standing commitment balance.`
        : `Thank you. Your order ${state.order?.reference || ""} is confirmed. A receipt has been emailed to you.`}
      extra={`Total paid ${naira(state.payment.amountCharged)} (including ${naira(state.payment.fee)} processing fee)`} />;
  } else if (state.outcome === "refused") {
    body = <Msg icon={AlertTriangle} tone="amber" title="Your payment could not be used"
      text={`We received your payment but could not use it because ${state.refusalText || "it could not be applied"}. Nothing has been ordered with it, and it will be returned to your original payment method. A message has been sent to you.`}
      extra={state.refusalReason === "duplicate_payment" ? "This order was already paid, so you do not need to pay again." : null}
      action={["amount_mismatch", "currency_mismatch"].includes(state.refusalReason) && state.order?.status === "awaiting_payment"
        ? <button className="btn-primary" onClick={retry} disabled={retrying}>{retrying ? "Please wait…" : "Pay the correct amount"}</button> : null} />;
  } else if (state.outcome === "pending") {
    body = <Msg icon={Clock} tone="amber"
      title={state.waitingForTransfer ? "Waiting for your transfer" : "We haven't received your payment yet"}
      text={state.waitingForTransfer
        ? "Complete the bank transfer with the details Paystack gave you. This page updates by itself once Paystack confirms it."
        : "If you have just paid, this page will update in a moment. If you closed the payment window, you can try again."}
      action={!state.waitingForTransfer && state.order && <button className="btn-primary" onClick={retry} disabled={retrying}>{retrying ? "Please wait…" : "Pay now"}</button>} />;
  } else if (state.outcome === "expired") {
    body = <Msg icon={XCircle} tone="red" title="This order has expired" text="The 24-hour payment window has passed. Please place the order again." />;
  } else {
    body = <Msg icon={XCircle} tone="red" title="Payment failed" text="Your payment did not go through and you have not been charged."
      action={state.order && <button className="btn-primary" onClick={retry} disabled={retrying}>{retrying ? "Please wait…" : "Try again"}</button>} />;
  }

  return (
    <div className="mx-auto mt-16 max-w-md space-y-4 px-4">
      <div className="on-light rounded-card border border-soil-200 bg-white p-6 text-center">{body}</div>
      <button type="button" onClick={back} className="mx-auto block text-sm text-canopy-100 underline">Back to my dashboard</button>
    </div>
  );
}

function Msg({ icon: Icon, tone, title, text, extra, action }) {
  const colour = { green: "bg-canopy-50 text-canopy-700", red: "bg-red-50 text-red-700", amber: "bg-harvest-50 text-harvest-600" }[tone];
  return (
    <div className="space-y-2">
      <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${colour}`}><Icon className="h-7 w-7" /></span>
      <p className="text-lg font-medium text-gray-900">{title}</p>
      <p className="text-sm text-gray-600">{text}</p>
      {extra && <p className="text-xs text-gray-500">{extra}</p>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}
