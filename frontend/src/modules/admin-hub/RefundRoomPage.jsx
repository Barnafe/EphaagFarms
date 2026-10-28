import { useCallback, useEffect, useState } from "react";
import { Undo2 } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";

import useUrlState from "../../hooks/useUrlState.js";
const naira = (n) => `₦${Number(n || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const fmt = (d) => (d ? new Date(d).toLocaleString() : "—");
const btn = "rounded-card border border-soil-200 px-3 py-1 text-xs text-ink-800 hover:bg-soil-50";
const TABS = [["attention", "Needs attention"], ["search", "Refund a payment"], ["history", "History"]];

// The one place money is returned. Full refunds only; a written reason is always required;
// the payer is told by the system; Paystack keeps its own processing fee.
function RefundForm({ payment, onDone, onCancel }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function submit() {
    if (reason.trim().length < 3) { setErr("Please write the reason for this refund."); return; }
    setBusy(true); setErr(null);
    try { await apiFetch(`/refunds/${payment.id}`, { method: "POST", body: { reason: reason.trim() } }); onDone(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="mt-2 space-y-2 rounded-card border border-soil-200 bg-soil-50 p-3">
      <p className="text-xs text-ink-700">The full {naira(payment.paid_amount ?? payment.gross_amount)} goes back to the payer through Paystack. Paystack keeps its own processing fee. The payer is told automatically.</p>
      <textarea className="w-full rounded-card border border-soil-200 px-2 py-1 text-sm" rows={2} placeholder="Reason for the refund (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
      {err && <p className="text-xs text-red-700">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? "Refunding…" : "Refund in full"}</button>
        <button className={btn} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Row({ p, onChanged, showAction = true }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-card border border-soil-200 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-ink-900">{p.typeLabel} · {naira(p.paid_amount ?? p.gross_amount)}</p>
          <p className="text-xs text-ink-600">{p.payer_name || "—"}{p.payer_email ? ` · ${p.payer_email}` : ""}{p.payer_phone ? ` · ${p.payer_phone}` : ""}</p>
          <p className="text-xs text-ink-500">{p.reference} · {fmt(p.paid_at)}</p>
          {p.reasonText && <p className="mt-1 text-xs text-harvest-600">Could not be applied because {p.reasonText}.</p>}
          {p.refund_status === "failed" && <p className="text-xs text-red-700">Paystack could not refund it{p.refund_note ? `: ${p.refund_note}` : ""}. Try again, or refund it in the Paystack dashboard.</p>}
          {p.reason && <p className="text-xs text-canopy-800">Refunded {fmt(p.refund_at)} · Reason: {p.reason}</p>}
        </div>
        {showAction && p.refundable !== false && !open && <button className={btn} onClick={() => setOpen(true)}>Refund…</button>}
        {showAction && p.refundable === false && <span className="text-xs text-ink-500">{p.refund_status === "refunded" ? "Already refunded" : "Refund in progress"}</span>}
      </div>
      {open && <RefundForm payment={p} onCancel={() => setOpen(false)} onDone={() => { setOpen(false); onChanged(); }} />}
    </li>
  );
}

function List({ path, empty, showAction, onChanged }) {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(() => apiFetch(path).then((r) => { setItems(r.items); setErr(null); }).catch((e) => setErr(e.message)), [path]);
  useEffect(() => { load(); }, [load]);
  if (err) return <p className="text-sm text-red-700">{err}</p>;
  if (!items) return <p className="text-sm text-ink-600">Loading…</p>;
  if (!items.length) return <p className="text-sm text-ink-600">{empty}</p>;
  return <ul className="space-y-2">{items.map((p) => <Row key={p.id} p={p} showAction={showAction} onChanged={() => { load(); onChanged?.(); }} />)}</ul>;
}

function Search() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const run = useCallback(async () => {
    if (q.trim().length < 3) { setErr("Type at least 3 characters."); return; }
    try { setItems((await apiFetch(`/refunds/search?q=${encodeURIComponent(q.trim())}`)).items); setErr(null); } catch (e) { setErr(e.message); }
  }, [q]);
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-600">For exceptions only, for example goods delivered wrongly and returned. Find the payment by its reference, an order or purchase number, or the payer's name or email.</p>
      <div className="flex gap-2">
        <input className="w-full max-w-sm rounded-card border border-soil-200 px-2 py-1 text-sm" placeholder="Reference, name or email" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
        <button className="btn-primary" onClick={run}>Search</button>
      </div>
      {err && <p className="text-xs text-red-700">{err}</p>}
      {items && !items.length && <p className="text-sm text-ink-600">No matching payment.</p>}
      {items && items.length > 0 && <ul className="space-y-2">{items.map((p) => <Row key={p.id} p={p} onChanged={run} />)}</ul>}
    </div>
  );
}

export default function RefundRoomPage() {
  const [tab, setTab] = useUrlState("tab", "attention");
  const [count, setCount] = useState(0);
  const refreshCount = useCallback(() => apiFetch("/refunds/attention").then((r) => setCount(r.items.length)).catch(() => {}), []);
  useEffect(() => { refreshCount(); }, [refreshCount]);
  return (
    <AdminDashboardShell>
      <div className="card space-y-4">
        <div className="flex items-center gap-2"><Undo2 size={18} className="text-canopy-700" /><p className="text-sm font-medium text-ink-900">Refund room</p></div>
        <p className="text-xs text-ink-600">The only place money is returned. Full refunds only, a written reason is always required, and the payer is told automatically. Every admin can use it.</p>
        <div className="flex flex-wrap gap-2">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-card px-3 py-1.5 text-sm ${tab === k ? "bg-canopy-700 text-white" : "border border-soil-200 text-ink-700 hover:bg-soil-50"}`}>
              {label}{k === "attention" && count > 0 ? ` (${count})` : ""}
            </button>
          ))}
        </div>
        {tab === "attention" && <List path="/refunds/attention" empty="Nothing needs attention." showAction onChanged={refreshCount} />}
        {tab === "search" && <Search />}
        {tab === "history" && <List path="/refunds/history" empty="No refunds yet." showAction={false} />}
      </div>
    </AdminDashboardShell>
  );
}
