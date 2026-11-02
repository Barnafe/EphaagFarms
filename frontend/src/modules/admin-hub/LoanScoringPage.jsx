import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";

const PARTS = [
  ["Monthly savings record", 6],
  ["Loan repayment", 12],
  ["Training attendance", 20],
  ["Productive funds utilization", 12],
];

export default function LoanScoringPage() {
  const [settings, setSettings] = useState(null);
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    apiFetch("/loans/scoring-settings")
      .then((d) => { setSettings(d); setValue(d.minimumScore ? String(d.minimumScore) : ""); })
      .catch((e) => setErr(e.message));
  }, []);

  async function save() {
    setErr(""); setMsg("");
    try {
      const d = await apiFetch("/loans/scoring-settings", { method: "PUT", body: { minimumScore: value === "" ? 0 : Number(value) } });
      setSettings(d);
      setMsg(d.minimumScore ? `Saved. Farmers need at least ${d.minimumScore} of ${d.maxScore} points (${d.minimumPercent}%) to apply.` : "Saved. There is no minimum score, so any farmer who passes the other checks can apply.");
    } catch (e) { setErr(e.message); }
  }

  return (
    <AdminDashboardShell>
      <div className="max-w-3xl space-y-4">
        <div className="card space-y-3">
          <div className="flex items-center gap-2"><Gauge size={18} className="text-canopy-700" /><p className="text-sm font-medium text-ink-900">Loan scoring</p></div>
          <p className="text-xs text-ink-600">
            A farmer must reach a minimum total score to apply for a loan. The score that counts is the last completed calendar
            quarter's, so a new farmer must finish one quarter first. Nobody is exempt, including farmers with a Unit Leader
            recommendation ticket and first-time applicants. The Unit Leader's recommendation is a yes/no step and carries no points.
          </p>
          <ul className="space-y-1 text-sm text-ink-900">
            {PARTS.map(([label, max]) => (
              <li key={label} className="flex justify-between border-b border-soil-100 py-1"><span>{label}</span><span>up to {max} points</span></li>
            ))}
            <li className="flex justify-between py-1 font-medium"><span>Total</span><span>{settings?.maxScore ?? 50} points</span></li>
          </ul>
          <p className="text-xs text-ink-600">
            Productive funds utilization is worked out by the system: 6 points if the farmer declared produce in the quarter and 6 more
            if they listed produce for sale. If a loan was paid out during the quarter, only produce declared or listed after the payout counts.
          </p>
          {err && <p className="text-xs text-red-700" role="alert">{err}</p>}
          {msg && <p className="text-xs text-canopy-800" role="status">{msg}</p>}
          <div className="field flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="min-score">Minimum total score (0 to {settings?.maxScore ?? 50}, empty for no minimum)</label>
              <input id="min-score" type="number" min="0" max={settings?.maxScore ?? 50} step="0.5" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={save}>Save minimum</button>
          </div>
          {settings && <p className="text-xs text-ink-600">Now: {settings.minimumScore ? `${settings.minimumScore} points (${settings.minimumPercent}%)` : "no minimum set"}.</p>}
        </div>
      </div>
    </AdminDashboardShell>
  );
}
