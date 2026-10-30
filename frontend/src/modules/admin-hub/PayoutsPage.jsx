import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";

const naira = (n) => `₦${Number(n || 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const btn = "rounded-card border border-soil-200 px-3 py-1 text-xs text-ink-800 hover:bg-soil-50";
const FILTERS = [["", "All"], ["failed", "Failed"], ["held", "On hold"], ["processing", "Sending"], ["success", "Sent"]];
const HOLD = { no_bank_account: "waiting for the person's bank account", daily_cap: "waiting: daily cap reached" };

export default function PayoutsPage() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("");
  const [cap, setCap] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(async () => {
    try { const d = await apiFetch(`/payouts${filter ? `?status=${filter}` : ""}`); setData(d); setCap(d.settings.dailyCap ?? ""); setErr(""); } catch (e) { setErr(e.message); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  async function settings(body) { try { await apiFetch("/payouts/settings", { method: "PUT", body }); await load(); } catch (e) { setErr(e.message); } }
  async function retry(id) { try { await apiFetch(`/payouts/${id}/retry`, { method: "POST", body: {} }); setTimeout(load, 1500); } catch (e) { setErr(e.message); } }
  async function runNow() { try { await apiFetch("/payouts/run", { method: "POST", body: {} }); await load(); } catch (e) { setErr(e.message); } }

  const s = data?.settings;
  return (
    <AdminDashboardShell>
      <div className="max-w-4xl space-y-4">
        <div className="card space-y-3">
          <div className="flex items-center gap-2"><Send size={18} className="text-canopy-700" /><p className="text-sm font-medium text-ink-900">Payouts</p></div>
          <p className="text-xs text-ink-600">Money out is sent by Paystack transfer once the last approval is given: loans, savings and share withdrawals, ROI payouts and produce settlements. Nothing here needs a manual step unless a payout fails.</p>
          {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
          {s && (
            <div className="space-y-2 text-sm text-ink-900">
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" checked={s.paused} onChange={(e) => settings({ paused: e.target.checked })} />
                <span><strong>Pause all payouts.</strong> Nothing is sent while this is on; payouts wait and go out when it is switched off.</span>
              </label>
              <div className="field flex flex-wrap items-end gap-3">
                <div><label>Daily payout cap (₦, empty for none)</label><input type="number" min="1" value={cap} onChange={(e) => setCap(e.target.value)} /></div>
                <button className="btn-primary" onClick={() => settings({ dailyCap: cap === "" ? null : Number(cap) })}>Save cap</button>
                <button className={btn} onClick={runNow}>Send what is waiting now</button>
              </div>
              <p className="text-xs text-ink-600">Sent today: {naira(s.sentToday)}{s.dailyCap ? ` of ${naira(s.dailyCap)}` : ""}.</p>
            </div>
          )}
        </div>
        <div className="card space-y-3">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-card px-3 py-1.5 text-sm ${filter === k ? "bg-canopy-700 text-white" : "border border-soil-200 text-ink-700 hover:bg-soil-50"}`}>
                {label}{k && data?.counts?.[k] ? ` (${data.counts[k]})` : ""}
              </button>
            ))}
          </div>
          {!data && <p className="text-sm text-ink-600">Loading…</p>}
          {data && !data.payouts.length && <p className="text-sm text-ink-600">Nothing here.</p>}
          {data && (
            <ul className="space-y-2">
              {data.payouts.map((p) => (
                <li key={p.id} className="rounded-card border border-soil-200 p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink-900">{p.label} · {naira(p.amount)}</p>
                      <p className="text-xs text-ink-600">{p.userName} · {p.reference}</p>
                      {p.status === "held" && <p className="text-xs text-harvest-700">{HOLD[p.holdReason] || "on hold"}</p>}
                      {p.status === "failed" && <p className="text-xs text-red-700">Failed: {p.failureReason}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs ${p.status === "success" ? "bg-canopy-50 text-canopy-800" : p.status === "failed" ? "bg-red-50 text-red-700" : "bg-soil-100 text-ink-600"}`}>{p.status === "success" ? "sent" : p.status}</span>
                      {p.status === "failed" && <button className={btn} onClick={() => retry(p.id)}>Retry</button>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminDashboardShell>
  );
}
