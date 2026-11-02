import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiFetch } from "../../api/client.js";
import PaymentPreview from "../../components/PaymentPreview.jsx";

const STEPS = [
  ["pending", "Received"], ["awaiting_payment", "Approved: pay online"], ["ready", "Paid: we are scheduling"], ["scheduled", "Session scheduled"], ["completed", "Completed"],
];
const naira = (v) => `₦${Number(v).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

/** The applicant's private page (their emailed link): status, the fee and terms, a pay button, and the session details. */
export default function ConsultancyRequest() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const returning = !!(params.get("reference") || params.get("trxref"));
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const polls = useRef(0);

  const load = useCallback(async () => {
    try { setData(await apiFetch(`/consultancy/track/${token}`)); setError(""); } catch (e) { setError(e.message); }
  }, [token]);
  useEffect(() => { load(); }, [load]);
  // Coming back from Paystack: the payment may take a few seconds to be confirmed.
  useEffect(() => {
    if (!returning || !data || data.request.status !== "awaiting_payment" || polls.current >= 6) return undefined;
    const t = setTimeout(() => { polls.current += 1; load(); }, 2500);
    return () => clearTimeout(t);
  }, [returning, data, load]);

  async function pay() {
    setBusy(true); setError("");
    try {
      const d = await apiFetch(`/consultancy/track/${token}/pay`, { method: "POST", body: email ? { email } : {} });
      window.location.assign(d.authorizationUrl);
    } catch (e) { setError(e.message); setBusy(false); }
  }

  if (error && !data) return <div className="mx-auto max-w-xl px-6 py-14"><div className="card"><p className="text-sm text-red-700" role="alert">{error}</p><Link className="mt-3 inline-block text-sm text-canopy-800 underline" to="/">Back to home</Link></div></div>;
  if (!data) return <div className="mx-auto max-w-xl px-6 py-14 text-ink-600">Loading your request…</div>;

  const r = data.request;
  const closed = ["rejected", "cancelled"].includes(r.status);
  const stepIndex = STEPS.findIndex(([k]) => k === r.status);
  return (
    <div className="mx-auto max-w-xl space-y-4 px-6 py-12" data-testid="consultancy-track">
      <div>
        <p className="text-xs uppercase tracking-wide text-clay-600">Consultancy request</p>
        <h1 className="text-2xl font-medium text-ink-900">Hello {data.applicantName}</h1>
        <p className="text-sm text-ink-600">Reference <span data-testid="track-reference">{r.reference}</span>. Keep this page's link: it is how you follow your request.</p>
      </div>

      {!closed && (
        <ol className="card space-y-1 text-sm">
          {STEPS.map(([k, label], i) => (
            <li key={k} className={i < stepIndex ? "text-canopy-800" : i === stepIndex ? "font-medium text-ink-900" : "text-ink-400"}>
              {i < stepIndex ? "✓ " : i === stepIndex ? "● " : "○ "}{label}
            </li>
          ))}
        </ol>
      )}
      <div className="card text-sm">
        <p className="text-ink-600">About</p>
        <p className="text-ink-900">{r.offeringTitle || r.topic}</p>
        <p className="mt-1 text-ink-600">{r.message}</p>
      </div>

      {r.status === "pending" && <div className="card text-sm text-ink-900" data-testid="track-pending">We are reviewing your request. You have not been charged. If approved, the fee and terms will appear here.</div>}

      {r.status === "awaiting_payment" && (
        <div className="card space-y-2 text-sm" data-testid="track-pay">
          <p className="font-medium text-ink-900">Your request is approved</p>
          <p className="text-ink-600"><span className="font-medium text-ink-900">Payment terms:</span> {r.paymentTerms}</p>
          {data.lastPayment?.status === "refused" && <p className="text-amber-800">Your last payment could not be applied. Our team has been told and will contact you, so please do not pay again.</p>}
          {returning && <p className="text-ink-600" role="status">Checking your payment…</p>}
          {data.unreachable && <p className="text-amber-800">We could not confirm your payment just now. This page checks again when you reopen it.</p>}
          <div className="field"><label htmlFor="pay-email">Email for your receipt (only needed if you applied with a phone number)</label><input id="pay-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {error && <p className="text-red-700" role="alert">{error}</p>}
          {data.request.quote ? (
            <PaymentPreview amount={data.request.quote.amount} fee={data.request.quote.fee} total={data.request.quote.totalToPay} amountLabel="Consultancy fee" amountTestId="quote-fee" totalTestId="quote-total" onProceed={pay} busy={busy} />
          ) : (
            <button className="btn-primary" onClick={pay} disabled={busy}>{busy ? "Please wait…" : "Proceed & Pay"}</button>
          )}
        </div>
      )}

      {r.status === "ready" && <div className="card text-sm" data-testid="track-ready">{r.amount > 0 ? "We have received your payment. " : "Your request is approved and there is nothing to pay. "}We are scheduling your session and will send you the date, time and place.</div>}

      {(r.status === "scheduled" || r.status === "completed") && r.session && (
        <div className="card space-y-1 text-sm" data-testid="track-session">
          <p className="font-medium text-ink-900">{r.status === "completed" ? "Your session took place" : "Your session is scheduled"}</p>
          <p>Date: <span data-testid="session-date">{r.session.date}</span></p>
          <p>Time: {r.session.time}</p>
          <p>Place or meeting link: {/^https?:\/\//.test(r.session.place) ? <a className="text-canopy-800 underline" href={r.session.place} target="_blank" rel="noreferrer">{r.session.place}</a> : r.session.place}</p>
          {r.session.note && <p className="mt-1 rounded-card bg-soil-50 p-2"><span className="font-medium">Note from your consultant:</span> {r.session.note}</p>}
        </div>
      )}

      {closed && <div className="card text-sm" data-testid="track-closed"><p className="font-medium text-ink-900">{r.status === "rejected" ? "We could not take this request forward" : "This request was cancelled"}</p>{r.decisionReason && <p className="text-ink-600">{r.decisionReason}</p>}</div>}
      <Link to="/" className="text-sm text-canopy-800 underline">Back to the EPHAAG home page</Link>
    </div>
  );
}
