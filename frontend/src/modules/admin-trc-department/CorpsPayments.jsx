import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const naira = (n) => `₦${Number(n).toLocaleString("en-NG")}`;
const when = (d) => (d ? new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "—");

const STATUS_LABEL = { pending: "Pending", paid: "Paid", failed: "Rejected", cancelled: "Cancelled", refunded: "Refunded" };
const STATUS_TONE = {
  pending: "bg-amber-100 text-amber-900",
  paid: "bg-canopy-50 text-canopy-800",
  failed: "bg-red-50 text-red-800",
  cancelled: "bg-soil-100 text-ink-800",
  refunded: "bg-soil-100 text-ink-800",
};
const FILTERS = [["all", "All"], ["pending", "Pending"], ["paid", "Paid"], ["failed", "Rejected"], ["refunded", "Refunded"], ["cancelled", "Cancelled"]];

// TRC -> Corps -> Payments. The fee is editable any time (payments already
// created keep their own amount). Until PAYSTACK_SECRET_KEY is set on the
// server, members' payments wait here for a hand confirmation; with it set,
// Paystack confirms them automatically and these buttons are the fallback.
export default function CorpsPayments() {
  const [summary, setSummary] = useState(null);
  const [payments, setPayments] = useState(null);
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [feeDraft, setFeeDraft] = useState("");
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  // { id, kind: "reject" | "refund", reason } — the inline reason form.
  const [reasonFor, setReasonFor] = useState(null);

  const loadSummary = useCallback(async () => {
    try {
      const s = await apiFetch("/rtc/admin/corps/payments/summary");
      setSummary(s);
      setFeeDraft((cur) => (cur === "" && s.fee ? String(s.fee) : cur));
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadPayments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (q.trim()) params.set("q", q.trim());
      const d = await apiFetch(`/rtc/admin/corps/payments?${params}`);
      setPayments(d.payments);
    } catch (err) {
      setError(err.message);
    }
  }, [status, q]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const t = setTimeout(loadPayments, q ? 250 : 0); // small debounce while typing
    return () => clearTimeout(t);
  }, [loadPayments, q]);

  async function run(fn, doneMessage) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      if (doneMessage) setMessage(doneMessage);
      await Promise.all([loadSummary(), loadPayments()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const saveFee = (e) => {
    e.preventDefault();
    run(async () => {
      const d = await apiFetch("/rtc/admin/corps/fee", { method: "PUT", body: { amount: Number(feeDraft) } });
      setFeeDraft(String(d.fee));
    }, "Fee updated. Payments already started keep the amount they were created with.");
  };

  // Paystack is asked first. Only if Paystack cannot be reached does the server accept a hand
  // confirmation, and then it needs a reason (for example a transfer reference).
  async function confirm(p) {
    setBusy(true); setError(null); setMessage(null);
    try {
      await apiFetch(`/rtc/admin/corps/payments/${p.id}/confirm`, { method: "POST", body: {} });
      setMessage(`Payment ${p.reference} confirmed — training unlocked and the access fee posted to Finance.`);
      await Promise.all([loadSummary(), loadPayments()]);
    } catch (err) {
      if (/could not be reached/i.test(err.message)) { setReasonFor({ id: p.id, kind: "confirm", reason: "" }); setError(err.message); }
      else setError(err.message);
    } finally { setBusy(false); }
  }

  const recheck = (p) => run(async () => {
    const r = await apiFetch(`/rtc/admin/corps/payments/${p.id}/recheck`, { method: "POST" });
    setMessage(r.unreachable ? "Paystack could not be reached just now. Try again in a moment." : r.payment.status === "paid" ? `Paystack confirms ${p.reference} was paid; training unlocked.` : "Paystack has not received this payment yet.");
  });

  const submitReason = (e) => {
    e.preventDefault();
    const { id, kind, reason } = reasonFor;
    run(async () => {
      await apiFetch(`/rtc/admin/corps/payments/${id}/${kind}`, { method: "POST", body: { reason } });
      setReasonFor(null);
      setError(null);
    }, kind === "confirm" ? "Confirmed by hand and flagged for review. If Paystack later reports the same payment it will not be credited twice." : "Payment rejected — the member can try again.");
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-canopy-300">TRC — NYSC AGROALLIED SAED</p>
        <h1 className="text-xl font-medium text-white">NYSC AGROALLIED SAED access-fee payments</h1>
        <p className="mt-1 text-sm text-canopy-100">
          {summary?.mode === "paystack"
            ? "Paystack is connected: payments are confirmed automatically and listed in Finance. If one is stuck, Re-check asks Paystack again. You can confirm by hand only if Paystack cannot be reached, with a reason. The access fee is non-refundable once paid, so there is no refund action."
            : "Paystack isn’t connected yet — confirm each payment by hand once the money is received."}
        </p>
      </div>

      {error && <div className="card border-red-200 bg-red-50" role="alert"><p className="text-sm text-red-700">{error}</p></div>}
      {message && <div className="card border-canopy-200 bg-canopy-50" role="status"><p className="text-sm text-canopy-800">{message}</p></div>}

      {summary && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["Collected", naira(summary.collected), `${summary.paidCount} paid`],
            ["Awaiting confirmation", summary.pendingCount, naira(summary.pendingTotal)],
            ["Rejected", summary.failedCount, ""],
            ["Refunded (before refunds were removed)", summary.refundedCount, naira(summary.refundedTotal)],
          ].map(([label, value, hint]) => (
            <div key={label} className="card">
              <p className="text-xs text-ink-600">{label}</p>
              <p className="mt-1 text-xl font-medium text-ink-900">{value}</p>
              {hint && <p className="text-xs text-ink-600">{hint}</p>}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={saveFee} className="card field">
        <p className="text-sm text-ink-600">Access fee (one-time, per NYSC AGROALLIED SAED member)</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="corps-fee" className="text-xs text-ink-600">Amount (₦)</label>
            <input id="corps-fee" type="number" min="1" step="0.01" inputMode="decimal" value={feeDraft} onChange={(e) => setFeeDraft(e.target.value)} placeholder="e.g. 5000" />
          </div>
          <button className="btn-primary" type="submit" disabled={busy || !feeDraft}>{summary?.fee ? "Update fee" : "Set fee"}</button>
        </div>
        <p className="mt-2 text-xs text-ink-600">
          {summary?.fee ? `Current fee: ${naira(summary.fee)}.` : "No fee is set, so members can’t start a payment yet."} You can change it at any time.
        </p>
      </form>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-ink-600">Payments</p>
          <div role="group" aria-label="Filter payments" className="flex flex-wrap gap-2 text-xs">
            {FILTERS.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)}
                className={`rounded-card border px-2 py-1 ${status === value ? "border-canopy-600 bg-canopy-600 text-white" : "border-soil-200 text-ink-900"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="field mt-3">
          <input aria-label="Search payments" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, state code or reference" />
        </div>

        {!payments && <p className="mt-3 text-sm text-ink-600">Loading…</p>}
        {payments && payments.length === 0 && <p className="mt-3 text-sm text-ink-600">No payments match.</p>}
        {payments && payments.length > 0 && (
          <ul className="mt-3 space-y-2">
            {payments.map((p) => (
              <li key={p.id} className="rounded-card border border-soil-200 px-3 py-2" data-testid="payment-row">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">
                      {p.memberName}
                      {p.stateCode ? <span className="ml-2 text-xs text-ink-600">{p.stateCode}</span> : null}
                    </p>
                    <p className="text-xs text-ink-600">{p.memberEmail || "no email"} · {p.reference} · {p.provider === "paystack" ? "Paystack" : "Manual"}</p>
                    <p className="text-xs text-ink-600">Started {when(p.createdAt)}{p.confirmedAt ? ` · confirmed ${when(p.confirmedAt)}${p.confirmedByName ? ` by ${p.confirmedByName}` : ""}` : ""}</p>
                    {p.failedReason && <p className="text-xs text-red-700">Rejected: {p.failedReason}</p>}
                    {p.confirmedUnverified && <p className="text-xs text-harvest-600">Confirmed by hand without Paystack: {p.manualReason}</p>}
                    {p.refundReason && <p className="text-xs text-ink-600">Refunded{p.refundedByName ? ` by ${p.refundedByName}` : ""}: {p.refundReason}</p>}
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-ink-900">{naira(p.accessFee)} <span className="text-xs font-normal text-ink-600">access fee</span></p>
                    {p.processingFee > 0 && <p className="text-xs text-ink-600">+ {naira(p.processingFee)} processing fee = {naira(p.totalCharged)} charged</p>}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                  </div>
                </div>

                {p.status === "pending" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="btn-primary" disabled={busy} onClick={() => confirm(p)}>Confirm payment</button>
                    {p.provider === "paystack" && <button type="button" className="rounded-card border border-soil-200 px-3 py-2 text-sm text-ink-900" disabled={busy} onClick={() => recheck(p)}>Re-check with Paystack</button>}
                    <button type="button" className="rounded-card border border-soil-200 px-3 py-2 text-sm text-ink-900" disabled={busy} onClick={() => setReasonFor({ id: p.id, kind: "reject", reason: "" })}>Reject</button>
                  </div>
                )}

                {reasonFor?.id === p.id && (
                  <form onSubmit={submitReason} className="field mt-2 space-y-2">
                    <label htmlFor={`reason-${p.id}`} className="text-xs text-ink-600">
                      {reasonFor.kind === "confirm"
                        ? "Reason or transfer reference (required, recorded, and the payment is flagged for review)"
                        : "Reason for rejecting (the member will see it)"}
                    </label>
                    <input id={`reason-${p.id}`} value={reasonFor.reason} onChange={(e) => setReasonFor({ ...reasonFor, reason: e.target.value })} maxLength={500} autoFocus />
                    <div className="flex gap-2">
                      <button className="btn-primary" type="submit" disabled={busy || reasonFor.reason.trim().length < 3}>{reasonFor.kind === "confirm" ? "Confirm by hand" : "Reject payment"}</button>
                      <button type="button" className="rounded-card border border-soil-200 px-3 py-2 text-sm text-ink-900" onClick={() => setReasonFor(null)}>Cancel</button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
