import { useState } from "react";
import { apiFetch } from "../../api/client.js";

const STATUS = {
  pending: "New: waiting for a decision", rejected: "Declined", awaiting_payment: "Approved: waiting for payment",
  ready: "Ready to schedule", scheduled: "Scheduled", completed: "Completed", cancelled: "Cancelled",
};
const FILTERS = ["all", "pending", "awaiting_payment", "ready", "scheduled", "completed", "rejected", "cancelled"];
const naira = (v) => `₦${Number(v).toLocaleString()}`;
const today = () => new Date().toISOString().slice(0, 10);

function RequestCard({ r, run, busy }) {
  const [mode, setMode] = useState(null); // approve | reject | schedule
  const [f, setF] = useState({ amount: "", terms: "", reason: "", date: r.session?.date || "", time: r.session?.time || "", place: r.session?.place || "", note: r.session?.note || "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const go = async (path, body) => { if (await run(r.id, path, body)) setMode(null); };

  return (
    <div className="rounded-card border border-soil-200 px-3 py-3" data-testid={`creq-${r.reference}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-ink-900">{r.applicantName} <span className="text-xs font-normal text-ink-600">({r.isMember ? "member" : "guest"})</span></p>
          <p className="text-xs text-ink-600">{[r.applicantEmail, r.applicantPhone, r.organisation].filter(Boolean).join(" · ")}</p>
          <p className="mt-1 text-sm text-ink-900">{r.offeringTitle || r.topic}</p>
          <p className="text-sm text-ink-600">{r.message}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-canopy-800" data-testid="creq-status">{STATUS[r.status] || r.status}</p>
          <p className="text-xs text-ink-600">{r.reference}</p>
          {r.amount !== null && <p className="text-xs text-ink-600">{r.amount > 0 ? naira(r.amount) : "Free"}</p>}
        </div>
      </div>
      {r.paymentTerms && <p className="mt-1 text-xs text-ink-600">Payment terms: {r.paymentTerms}</p>}
      {r.decisionReason && <p className="mt-1 text-xs text-ink-600">Reason: {r.decisionReason}</p>}
      {r.session && <p className="mt-1 text-xs text-ink-900">Session: {r.session.date} at {r.session.time}, {r.session.place}{r.session.note ? ` (note: ${r.session.note})` : ""}</p>}

      <div className="mt-2 flex flex-wrap gap-2">
        {r.status === "pending" && (<>
          <button type="button" className="btn-primary" onClick={() => setMode(mode === "approve" ? null : "approve")}>Approve…</button>
          <button type="button" className="btn-outline" onClick={() => setMode(mode === "reject" ? null : "reject")}>Decline…</button>
        </>)}
        {r.status === "awaiting_payment" && <button type="button" className="btn-outline" disabled={busy} onClick={() => go("cancel", { reason: "Cancelled by EPHAAG" })}>Cancel request</button>}
        {(r.status === "ready" || r.status === "scheduled") && <button type="button" className="btn-primary" onClick={() => setMode(mode === "schedule" ? null : "schedule")}>{r.status === "ready" ? "Schedule…" : "Reschedule…"}</button>}
        {r.status === "scheduled" && <button type="button" className="btn-outline" disabled={busy} onClick={() => go("complete", {})}>Mark completed</button>}
      </div>

      {mode === "approve" && (
        <div className="field mt-3 space-y-2 rounded-card bg-soil-50 p-3">
          <label htmlFor={`amt-${r.id}`}>Consultancy fee in naira (0 if it is free)</label>
          <input id={`amt-${r.id}`} type="number" min="0" value={f.amount} onChange={set("amount")} />
          <label htmlFor={`terms-${r.id}`}>Payment terms the applicant will see</label>
          <textarea id={`terms-${r.id}`} rows={2} value={f.terms} onChange={set("terms")} placeholder="For example: pay within 7 days of approval." />
          <p className="text-xs text-ink-600">The applicant is sent the fee, Paystack's processing fee on top, and these terms, and pays online. Nothing is charged until then.</p>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => go("approve", { amount: f.amount === "" ? undefined : Number(f.amount), paymentTerms: f.terms })}>Approve and send to applicant</button>
        </div>
      )}
      {mode === "reject" && (
        <div className="field mt-3 space-y-2 rounded-card bg-soil-50 p-3">
          <label htmlFor={`why-${r.id}`}>Reason (the applicant is told)</label>
          <textarea id={`why-${r.id}`} rows={2} value={f.reason} onChange={set("reason")} />
          <button type="button" className="btn-primary" disabled={busy} onClick={() => go("reject", { reason: f.reason })}>Decline and notify</button>
        </div>
      )}
      {mode === "schedule" && (
        <div className="field mt-3 space-y-2 rounded-card bg-soil-50 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor={`d-${r.id}`}>Date</label><input id={`d-${r.id}`} type="date" min={today()} value={f.date} onChange={set("date")} /></div>
            <div><label htmlFor={`t-${r.id}`}>Time</label><input id={`t-${r.id}`} type="time" value={f.time} onChange={set("time")} /></div>
          </div>
          <label htmlFor={`p-${r.id}`}>Place or meeting link</label>
          <input id={`p-${r.id}`} value={f.place} onChange={set("place")} placeholder="EPHAAG office, or a meeting link" />
          <label htmlFor={`n-${r.id}`}>Note from the consultant (optional)</label>
          <textarea id={`n-${r.id}`} rows={2} value={f.note} onChange={set("note")} />
          <button type="button" className="btn-primary" disabled={busy} onClick={() => go("schedule", { date: f.date, time: f.time, place: f.place, note: f.note })}>Schedule and notify applicant</button>
        </div>
      )}
    </div>
  );
}

export default function ConsultancyRequests({ requests, counts, reload, setError }) {
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function run(id, action, body) {
    setBusy(true); setError(null); setNotice("");
    try {
      await apiFetch(`/consultancy/admin/requests/${id}/${action}`, { method: "POST", body });
      await reload();
      setNotice(action === "approve" ? "Approved. The applicant has been sent the amount and payment terms." : action === "schedule" ? "Scheduled. The applicant has been sent the details." : "Done.");
      return true;
    } catch (err) { setError(err.message); return false; } finally { setBusy(false); }
  }

  const shown = filter === "all" ? requests : requests.filter((r) => r.status === filter);
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Requests (members and guests)</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {FILTERS.map((k) => (
          <button key={k} type="button" onClick={() => setFilter(k)}
            className={`rounded-full px-2.5 py-1 text-xs ${filter === k ? "bg-clay-700 text-white" : "bg-soil-100 text-ink-900"}`}>
            {k === "all" ? "All" : (STATUS[k] || k).split(":")[0]}{k !== "all" && counts?.[k] ? ` (${counts[k]})` : ""}
          </button>
        ))}
      </div>
      {notice && <p className="mt-2 text-xs text-canopy-800" role="status">{notice}</p>}
      {shown.length === 0 && <p className="mt-3 text-sm text-ink-600">No requests here.</p>}
      <div className="mt-3 space-y-3">{shown.map((r) => <RequestCard key={r.id} r={r} run={run} busy={busy} />)}</div>
    </div>
  );
}
