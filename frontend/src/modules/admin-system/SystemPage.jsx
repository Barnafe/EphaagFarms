import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";

import useUrlState from "../../hooks/useUrlState.js";
const TABS = [
  { key: "status", label: "System status" },
  { key: "messages", label: "Messages" },
  { key: "security", label: "Security log" },
];

const fmt = (d) => (d ? new Date(d).toLocaleString() : "—");
const card = "rounded-card border border-white/10 bg-canopy-900/40 p-4";
const btn = "rounded-card border border-white/20 px-3 py-1 text-xs text-white hover:bg-canopy-800";

function StatusTab() {
  const [data, setData] = useState(null);
  const [alertPhone, setAlertPhone] = useState("");
  const [msg, setMsg] = useState(null);
  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([apiFetch("/system/status"), apiFetch("/system/alert-settings")]);
      setData(s);
      setAlertPhone(a.alertSmsPhone || "");
    } catch (e) { setMsg(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function runNow(name) {
    setMsg(null);
    try { const r = await apiFetch(`/system/jobs/${name}/run`, { method: "POST" }); setMsg(`${name}: ${r.status}`); await load(); }
    catch (e) { setMsg(e.message); }
  }
  async function savePhone() {
    try { const r = await apiFetch("/system/alert-settings", { method: "PUT", body: { alertSmsPhone: alertPhone } }); setAlertPhone(r.alertSmsPhone || ""); setMsg("Alert phone saved"); }
    catch (e) { setMsg(e.message); }
  }
  if (!data) return <p className="text-sm text-canopy-100">{msg || "Loading…"}</p>;
  return (
    <div className="space-y-5">
      {msg && <p className="text-sm text-harvest-300">{msg}</p>}
      <div className={card}>
        <h2 className="mb-2 text-sm font-medium text-white">Scheduled jobs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-canopy-100">
            <thead><tr className="text-canopy-300"><th className="py-1 pr-3">Job</th><th className="pr-3">Schedule</th><th className="pr-3">Last run</th><th className="pr-3">Result</th><th className="pr-3">Next run</th><th /></tr></thead>
            <tbody>
              {data.jobs.map((j) => (
                <tr key={j.name} className="border-t border-white/10">
                  <td className="py-1.5 pr-3 text-white" title={j.description}>{j.name}</td>
                  <td className="pr-3">{j.schedule}</td>
                  <td className="pr-3">{fmt(j.lastRun?.started_at)}</td>
                  <td className={`pr-3 ${j.lastRun?.status === "failed" ? "text-red-300" : ""}`} title={j.lastRun?.error || ""}>{j.lastRun?.status || "never run"}</td>
                  <td className="pr-3">{fmt(j.nextRun)}</td>
                  <td><button className={btn} onClick={() => runNow(j.name)}>Run now</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={card}>
          <h2 className="mb-2 text-sm font-medium text-white">Message queues</h2>
          {data.queues.length === 0 ? <p className="text-xs text-canopy-100">Nothing waiting or failed.</p> : (
            <ul className="text-xs text-canopy-100">{data.queues.map((q) => <li key={q.channel + q.status}>{q.channel}: {q.n} {q.status}</li>)}</ul>
          )}
          <p className="mt-3 text-xs text-canopy-300">Last payment webhook: {fmt(data.lastPaymentWebhookAt)}</p>
        </div>
        <div className={card}>
          <h2 className="mb-2 text-sm font-medium text-white">Who gets the SMS when a job or webhook fails</h2>
          <div className="flex gap-2">
            <input value={alertPhone} onChange={(e) => setAlertPhone(e.target.value)} placeholder="0803 000 0000" className="w-full rounded-card bg-white px-2 py-1 text-sm text-ink-800" />
            <button className={btn} onClick={savePhone}>Save</button>
          </div>
          <p className="mt-2 text-xs text-canopy-300">Admins are always emailed. At most one alert per problem per hour.</p>
        </div>
      </div>
    </div>
  );
}

function MessagesTab() {
  const [rows, setRows] = useState([]);
  const [sup, setSup] = useState([]);
  const [status, setStatus] = useState("");
  const [msg, setMsg] = useState(null);
  const [testTo, setTestTo] = useState("");
  const [testChannel, setTestChannel] = useState("email");
  const load = useCallback(async () => {
    try { const r = await apiFetch(`/messaging?limit=100${status ? `&status=${status}` : ""}`); setRows(r.messages); setSup(r.suppressions); }
    catch (e) { setMsg(e.message); }
  }, [status]);
  useEffect(() => { load(); }, [load]);
  async function resend(id) { try { const r = await apiFetch(`/messaging/${id}/resend`, { method: "POST" }); setMsg(`Resent: ${r.message.status}`); await load(); } catch (e) { setMsg(e.message); } }
  async function testSend() { try { const r = await apiFetch("/messaging/test-send", { method: "POST", body: { channel: testChannel, to: testTo } }); setMsg(`Test message: ${r.message.status}${r.message.last_error ? ` (${r.message.last_error})` : ""}`); await load(); } catch (e) { setMsg(e.message); } }
  async function unsuppress(a) { try { await apiFetch(`/messaging/suppressions/${encodeURIComponent(a)}`, { method: "DELETE" }); await load(); } catch (e) { setMsg(e.message); } }
  return (
    <div className="space-y-4">
      {msg && <p className="text-sm text-harvest-300">{msg}</p>}
      <div className={`${card} flex flex-wrap items-end gap-2`}>
        <select value={testChannel} onChange={(e) => setTestChannel(e.target.value)} className="rounded-card bg-white px-2 py-1 text-sm text-ink-800"><option value="email">Email</option><option value="sms">SMS</option></select>
        <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder={testChannel === "email" ? "name@example.com" : "0803 000 0000"} className="rounded-card bg-white px-2 py-1 text-sm text-ink-800" />
        <button className={btn} onClick={testSend}>Send test</button>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="ml-auto rounded-card bg-white px-2 py-1 text-sm text-ink-800">
          <option value="">All statuses</option>{["queued", "sent", "failed", "suppressed"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-left text-xs text-canopy-100">
          <thead><tr className="text-canopy-300"><th className="pr-3">When</th><th className="pr-3">Type</th><th className="pr-3">To</th><th className="pr-3">Subject</th><th className="pr-3">Status</th><th /></tr></thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-white/10">
                <td className="py-1.5 pr-3">{fmt(m.created_at)}</td><td className="pr-3">{m.channel}</td><td className="pr-3">{m.to_address}</td>
                <td className="pr-3">{m.subject || m.template || "—"}</td>
                <td className={`pr-3 ${m.status === "failed" ? "text-red-300" : ""}`} title={m.last_error || ""}>{m.status}</td>
                <td>{["failed", "suppressed"].includes(m.status) && <button className={btn} onClick={() => resend(m.id)}>Resend</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sup.length > 0 && (
        <div className={card}>
          <h2 className="mb-2 text-sm font-medium text-white">Suppressed addresses (bounced or complained)</h2>
          <ul className="text-xs text-canopy-100">{sup.map((s) => <li key={s.address} className="flex gap-3 py-0.5">{s.address} <span className="text-canopy-300">{s.reason}</span><button className={btn} onClick={() => unsuppress(s.address)}>Remove</button></li>)}</ul>
        </div>
      )}
    </div>
  );
}

function SecurityTab() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [err, setErr] = useState(null);
  const load = useCallback(async () => {
    try { const p = new URLSearchParams({ limit: "200" }); if (q) p.set("q", q); if (type) p.set("type", type); setRows((await apiFetch(`/security/log?${p}`)).events); setErr(null); }
    catch (e) { setErr(e.message); }
  }, [q, type]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-3">
      {err && <p className="text-sm text-red-300">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, IP…" className="rounded-card bg-white px-2 py-1 text-sm text-ink-800" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-card bg-white px-2 py-1 text-sm text-ink-800">
          <option value="">All events</option>
          {["login_success", "login_failed", "account_locked", "account_unlocked", "account_locked_by_admin", "password_changed", "password_reset", "sessions_revoked", "acting_as_started", "acting_as_action", "acting_as_blocked", "rate_limited", "alert_phone_changed", "csp_violation"].map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full text-left text-xs text-canopy-100">
          <thead><tr className="text-canopy-300"><th className="pr-3">When</th><th className="pr-3">Event</th><th className="pr-3">Who</th><th className="pr-3">IP</th><th>Details</th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-t border-white/10 align-top">
                <td className="py-1.5 pr-3">{fmt(e.created_at)}</td><td className="pr-3 text-white">{e.event_type}</td>
                <td className="pr-3">{e.user_name || e.user_email || "—"}</td><td className="pr-3">{e.ip || "—"}</td>
                <td className="break-all">{Object.keys(e.detail || {}).length ? JSON.stringify(e.detail) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function SystemPage() {
  const [tab, setTab] = useUrlState("tab", "status");
  return (
    <AdminDashboardShell>
      <div className="max-w-6xl">
        <p className="text-xs uppercase tracking-wide text-canopy-300">Admin</p>
        <h1 className="mb-4 text-xl font-medium text-white">System</h1>
        <div className="mb-5 flex gap-2">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-card px-3 py-1.5 text-sm ${tab === t.key ? "bg-canopy-700 text-white" : "border border-white/15 text-canopy-100 hover:bg-canopy-800"}`}>{t.label}</button>
          ))}
        </div>
        {tab === "status" && <StatusTab />}
        {tab === "messages" && <MessagesTab />}
        {tab === "security" && <SecurityTab />}
      </div>
    </AdminDashboardShell>
  );
}
