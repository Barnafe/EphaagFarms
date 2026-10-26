import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CalendarClock, X, Receipt } from "lucide-react";
import { apiFetch } from "../../api/client.js";

const naira = (n) => `₦${Number(n).toLocaleString("en-NG")}`;
const when = (d) => (d ? new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "");

const STATUS_LABEL = { pending: "Awaiting confirmation", paid: "Paid", failed: "Not received", cancelled: "Cancelled", refunded: "Refunded" };
const STATUS_TONE = {
  pending: "bg-[#fbf1dd] text-[#7a5a10]",
  paid: "bg-[#e9f1e6] text-[#1f4d22]",
  failed: "bg-red-50 text-red-800",
  cancelled: "bg-soil-100 text-ink-800",
  refunded: "bg-soil-100 text-ink-800",
};

// The one-time access fee. The amount always comes from the server; the
// member only presses "Pay now". `verifying` is set by the room while it
// checks a payment the member has just come back from Paystack with.
export default function CorperPayments({ user, verifying, notice, onChanged }) {
  const [data, setData] = useState(null); // { fee, mode, access, payments }
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch("/corpers/payments"));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, verifying]);

  async function payNow() {
    setBusy(true);
    setError(null);
    try {
      const { payment } = await apiFetch("/corpers/payments/initiate", { method: "POST", body: {} });
      if (payment.authorizationUrl) {
        window.location.href = payment.authorizationUrl; // Paystack checkout
        return;
      }
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(id) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/corpers/payments/${id}/cancel`, { method: "POST", body: {} });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function recheck(reference) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/corpers/payments/${reference}/verify`, { method: "POST", body: {} });
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="text-sm text-ink-800">{error || "Loading..."}</p>;

  const { fee, mode, access, payments } = data;
  const paidPayment = payments.find((p) => p.status === "paid");
  const lastFailed = !access.pending && !access.paid ? payments.find((p) => p.status === "failed") : null;
  const lastRefunded = !access.pending && !access.paid ? payments.find((p) => p.status === "refunded") : null;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink-900">Payments</h1>

      {error && <p role="alert" className="rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {verifying && <p className="rounded-card border border-[#dba532] bg-[#fbf1dd] p-3 text-sm text-ink-900">Checking your payment with the gateway…</p>}
      {notice && !verifying && <p role="status" className="rounded-card border border-[#dba532] bg-[#fbf1dd] p-3 text-sm text-ink-900">{notice}</p>}

      {/* Paid: receipt */}
      {access.paid && paidPayment && (
        <section className="rounded-card border border-[#2c6b2f] bg-[#e9f1e6] p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="text-[#2c6b2f]" size={22} aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-ink-900">Access fee paid</h2>
          </div>
          <p className="mt-2 text-sm text-ink-800">Your corps training is unlocked. Open <strong>My Training</strong> to begin.</p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-xs uppercase tracking-wide text-ink-600">Receipt reference</dt><dd className="font-semibold text-ink-900">{paidPayment.reference}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-ink-600">Amount</dt><dd className="font-semibold text-ink-900">{naira(paidPayment.amount)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-ink-600">Paid on</dt><dd className="font-semibold text-ink-900">{when(paidPayment.confirmedAt)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wide text-ink-600">Member</dt><dd className="font-semibold text-ink-900">{user.name}</dd></div>
          </dl>
          <button type="button" onClick={() => window.print()} className="mt-4 inline-flex h-11 items-center gap-2 rounded-card border border-[#2c6b2f] px-4 text-sm font-medium text-[#2c6b2f]">
            <Receipt size={16} aria-hidden="true" /> Print receipt
          </button>
        </section>
      )}

      {/* Pending */}
      {access.pending && (
        <section className="rounded-card border border-[#dba532] bg-[#fbf1dd] p-5">
          <div className="flex items-center gap-2">
            <CalendarClock className="text-[#7a5a10]" size={22} aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-ink-900">Awaiting confirmation</h2>
          </div>
          <p className="mt-2 text-sm text-ink-800">
            {access.pending.provider === "paystack"
              ? "If you have finished paying, press “I’ve paid — check now”. If you left the payment page, you can start again below."
              : "Your payment is recorded. Pay using the details our team gave you and quote the reference below — once we confirm it, your training unlocks and you’ll get an email receipt."}
          </p>
          <p className="mt-3 text-sm text-ink-900">Reference: <strong>{access.pending.reference}</strong> · Amount: <strong>{naira(access.pending.amount)}</strong></p>
          <div className="mt-4 flex flex-wrap gap-3">
            {access.pending.provider === "paystack" && (
              <>
                <button type="button" disabled={busy} onClick={() => recheck(access.pending.reference)} className="h-11 rounded-card bg-[#2c6b2f] px-5 text-sm font-semibold text-white disabled:opacity-60">I’ve paid — check now</button>
                {access.pending.authorizationUrl && (
                  <a href={access.pending.authorizationUrl} className="inline-flex h-11 items-center rounded-card border border-[#2c6b2f] px-5 text-sm font-medium text-[#2c6b2f]">Open payment page</a>
                )}
              </>
            )}
            <button type="button" disabled={busy} onClick={() => cancel(access.pending.id)} className="h-11 rounded-card border border-soil-200 bg-white px-5 text-sm font-medium text-ink-900 disabled:opacity-60">Cancel this payment</button>
          </div>
        </section>
      )}

      {/* Unpaid: fee card */}
      {!access.paid && !access.pending && (
        <section className="rounded-card border border-soil-200 bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-ink-900">One-time access fee</h2>
          {lastFailed && (
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-card bg-red-50 p-3 text-sm text-red-800">
              <X size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>Your last payment wasn’t received{lastFailed.failedReason ? `: ${lastFailed.failedReason}` : "."} You can try again.</span>
            </p>
          )}
          {lastRefunded && (
            <p className="mt-3 rounded-card bg-soil-100 p-3 text-sm text-ink-800">
              Your earlier payment was refunded{lastRefunded.refundReason ? ` (${lastRefunded.refundReason})` : ""}, so your training is locked again.
            </p>
          )}
          {fee ? (
            <>
              <p className="mt-3 font-display text-4xl font-semibold text-ink-900">{naira(fee)}</p>
              <p className="mt-1 text-sm text-ink-800">Pay once to unlock all corps training, quizzes and your certificate. Nothing opens or counts toward your progress until the fee is paid.</p>
              <button type="button" disabled={busy} onClick={payNow} className="mt-4 h-11 rounded-card bg-[#2c6b2f] px-6 text-sm font-semibold text-white disabled:opacity-60">
                {busy ? "Please wait…" : "Pay now"}
              </button>
              {mode === "manual" && <p className="mt-2 text-xs text-ink-600">Online card payment isn’t switched on yet — we’ll confirm your payment by hand.</p>}
            </>
          ) : (
            <p className="mt-3 text-sm text-ink-800">The access fee hasn’t been announced yet. Please check back soon.</p>
          )}
        </section>
      )}

      {/* History */}
      <section className="rounded-card border border-soil-200 bg-white p-5">
        <h2 className="font-display text-lg font-semibold text-ink-900">Payment history</h2>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-ink-800">No payments yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-ink-600"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Reference</th><th className="py-2 pr-3">Amount</th><th className="py-2">Status</th></tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-soil-200 text-ink-900">
                    <td className="py-2 pr-3">{when(p.createdAt)}</td>
                    <td className="py-2 pr-3">{p.reference}</td>
                    <td className="py-2 pr-3">{naira(p.amount)}</td>
                    <td className="py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[p.status]}`}>{STATUS_LABEL[p.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
