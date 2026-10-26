import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const when = (d) => (d ? new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "—");
const EVENT_LABEL = {
  due_date_set: "Due date set",
  marked_complete: "Marked complete",
  unmarked: "Un-marked",
  emails_resent: "Emails resent",
  certificate_reissued: "Certificate reissued",
};

// TRC -> Corps -> Batches. Every batch (year + batch letter + stream) that has
// registered members. Set the due date, then Mark batch complete (allowed on
// or after the due date) to release that batch's hidden certificates and email
// each member.
export default function CorpsBatches() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(null);
  const [dues, setDues] = useState({});
  const [confirm, setConfirm] = useState(null); // { id, kind: "complete" | "uncomplete", reason }

  const load = useCallback(async () => {
    try {
      const d = await apiFetch("/rtc/admin/corps/batches");
      setData(d);
      setError(null);
      setDues((cur) => {
        const next = { ...cur };
        for (const b of d.batches) if (next[b.id] === undefined) next[b.id] = b.dueDate || "";
        return next;
      });
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // While emails are going out, keep refreshing so the counts move.
  const anyRunning = data?.batches.some((b) => b.emails.running);
  useEffect(() => {
    if (!anyRunning) return undefined;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [anyRunning, load]);

  async function act(id, key, fn, okText) {
    setBusy(`${id}:${key}`);
    setError(null);
    setMessage(null);
    try {
      const r = await fn();
      setMessage(typeof okText === "function" ? okText(r) : okText);
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const saveDue = (b) =>
    act(b.id, "due", () => apiFetch(`/rtc/admin/corps/batches/${b.id}`, { method: "PUT", body: { dueDate: dues[b.id] || null } }), "Due date saved.");
  const complete = (b) =>
    act(b.id, "complete", () => apiFetch(`/rtc/admin/corps/batches/${b.id}/complete`, { method: "POST", body: {} }),
      (r) => `Batch marked complete. ${r.released} certificate${r.released === 1 ? "" : "s"} released; ${r.emailsQueued} email${r.emailsQueued === 1 ? "" : "s"} being sent.`);
  const uncomplete = (b, reason) =>
    act(b.id, "uncomplete", () => apiFetch(`/rtc/admin/corps/batches/${b.id}/uncomplete`, { method: "POST", body: { reason } }),
      (r) => `Batch re-opened. ${r.hidden} certificate${r.hidden === 1 ? "" : "s"} hidden again.`);
  const resend = (b) =>
    act(b.id, "resend", () => apiFetch(`/rtc/admin/corps/batches/${b.id}/resend-emails`, { method: "POST", body: {} }),
      (r) => `${r.queued} email${r.queued === 1 ? "" : "s"} queued.`);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium text-white">Batches &amp; certificates</h1>
        <p className="mt-1 text-sm text-canopy-100">
          Certificates are created hidden when a paid member finishes every course. Marking a batch complete (on or after its due date) releases them and emails each member, one by one.
        </p>
      </div>

      {error && <div className="card border-red-200 bg-red-50" role="alert"><p className="text-sm text-red-700">{error}</p></div>}
      {message && <div className="card border-canopy-200 bg-canopy-50" role="status"><p className="text-sm text-canopy-800">{message}</p></div>}
      {!data && !error && <p className="text-sm text-canopy-100">Loading…</p>}
      {data && data.batches.length === 0 && <div className="card"><p className="text-sm text-ink-600">No batch has registered members yet.</p></div>}

      {data?.batches.map((b) => (
        <section key={b.id} className="card space-y-4" data-testid="batch-card">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-ink-900">{b.label}</h2>
              <p className="text-xs text-ink-600">
                {b.members} member{b.members === 1 ? "" : "s"} · {b.paid} paid · {b.finished} finished every course
              </p>
            </div>
            <span className={`rounded-card px-2 py-1 text-xs font-medium ${b.completed ? "bg-canopy-50 text-canopy-800" : "bg-amber-100 text-amber-900"}`}>
              {b.completed ? `Complete — ${when(b.completedAt)}${b.completedBy ? ` by ${b.completedBy}` : ""}` : "Open"}
            </span>
          </div>

          <div className="grid gap-3 text-sm text-ink-900 sm:grid-cols-3">
            <div>
              <p className="text-xs text-ink-600">Certificates</p>
              <p>{b.certificates.total} created · {b.certificates.released} released</p>
            </div>
            <div>
              <p className="text-xs text-ink-600">Emails (released certificates)</p>
              <p>
                {b.emails.sent} sent
                {b.emails.pending > 0 && ` · ${b.emails.pending} waiting`}
                {b.emails.unsent > 0 && ` · ${b.emails.unsent} not delivered`}
                {b.emails.running && " · sending…"}
              </p>
            </div>
            <div className="field">
              <label className="text-xs text-ink-600" htmlFor={`due-${b.id}`}>Due date</label>
              <div className="flex gap-2">
                <input id={`due-${b.id}`} type="date" value={dues[b.id] ?? ""} onChange={(e) => setDues((d) => ({ ...d, [b.id]: e.target.value }))} />
                <button type="button" onClick={() => saveDue(b)} disabled={busy === `${b.id}:due` || (dues[b.id] || "") === (b.dueDate || "")}
                  className="rounded-card border border-soil-200 px-3 text-sm text-ink-900 disabled:opacity-50">Save</button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!b.completed && (
              <button type="button" disabled={!b.canComplete || !!busy} onClick={() => setConfirm({ id: b.id, kind: "complete" })}
                title={b.completeBlockedReason || undefined}
                className="h-10 rounded-card bg-canopy-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
                Mark batch complete
              </button>
            )}
            {b.completed && (
              <>
                <button type="button" disabled={!!busy || b.emails.running || b.emails.pending + b.emails.unsent === 0} onClick={() => resend(b)}
                  className="h-10 rounded-card border border-canopy-600 px-4 text-sm font-medium text-canopy-700 disabled:opacity-50">
                  Send / resend emails ({b.emails.pending + b.emails.unsent})
                </button>
                <button type="button" disabled={!!busy} onClick={() => setConfirm({ id: b.id, kind: "uncomplete", reason: "" })}
                  className="h-10 rounded-card border border-soil-200 px-4 text-sm text-ink-900 disabled:opacity-50">
                  Un-mark (hide certificates)
                </button>
              </>
            )}
            {!b.completed && b.completeBlockedReason && <p className="text-xs text-ink-600">{b.completeBlockedReason}</p>}
          </div>

          {confirm?.id === b.id && (
            <div className="rounded-card border border-amber-300 bg-amber-50 p-3 text-sm text-ink-900" role="alertdialog" aria-label="Confirm">
              {confirm.kind === "complete" ? (
                <p>Release {b.certificates.total} certificate{b.certificates.total === 1 ? "" : "s"} and email the members of <strong>{b.label}</strong>? Members who have not finished get nothing.</p>
              ) : (
                <>
                  <p>Hide this batch&rsquo;s certificates again? Members will see &ldquo;awaiting batch completion&rdquo; and the action is logged.</p>
                  <div className="field mt-2"><input aria-label="Reason (optional)" placeholder="Reason (optional)" value={confirm.reason} onChange={(e) => setConfirm({ ...confirm, reason: e.target.value })} /></div>
                </>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={!!busy} onClick={() => (confirm.kind === "complete" ? complete(b) : uncomplete(b, confirm.reason))}
                  className="h-9 rounded-card bg-canopy-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Confirm</button>
                <button type="button" onClick={() => setConfirm(null)} className="h-9 rounded-card border border-soil-200 px-4 text-sm text-ink-900">Cancel</button>
              </div>
            </div>
          )}

          {b.events.length > 0 && (
            <details className="text-xs text-ink-800">
              <summary className="cursor-pointer text-ink-600">History</summary>
              <ul className="mt-1 space-y-1">
                {b.events.map((e, i) => (
                  <li key={i}>{when(e.at)} — {EVENT_LABEL[e.action] || e.action}{e.by ? ` by ${e.by}` : ""}{e.note ? ` (${e.note})` : ""}</li>
                ))}
              </ul>
            </details>
          )}
        </section>
      ))}
    </div>
  );
}
