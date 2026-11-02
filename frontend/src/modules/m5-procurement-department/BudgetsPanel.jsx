import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const naira = (v) => `₦${Number(v).toLocaleString()}`;

function Row({ b, year, canEdit, onSaved, setError }) {
  const [amount, setAmount] = useState(b.configured ? String(b.amount) : "");
  const [warn, setWarn] = useState(String(b.warnAtPercent ?? 80));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setAmount(b.configured ? String(b.amount) : ""); setWarn(String(b.warnAtPercent ?? 80)); }, [b.configured, b.amount, b.warnAtPercent]);
  const tone = !b.configured ? "text-ink-600" : b.exhausted ? "text-clay-700" : b.low ? "text-harvest-600" : "text-canopy-800";
  const status = !b.configured ? "No budget set (no limit)" : b.exhausted ? "Used up: new orders wait for Finance" : b.low ? `Getting low (${b.percentUsed}% used)` : `${b.percentUsed}% used`;
  async function save() {
    setBusy(true); setError(null);
    try {
      await apiFetch(`/purchasing/budgets/${encodeURIComponent(b.department)}`, { method: "PUT", body: { year, amount: Number(amount), warnAtPercent: Number(warn) } });
      await onSaved();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="rounded-card border border-soil-200 px-3 py-2" data-testid={`budget-${b.department}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink-900">{b.department}</p>
        <p className={`text-xs ${tone}`} data-testid="budget-status">{status}</p>
      </div>
      {b.configured && (
        <>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-soil-100">
            <div className={`h-full ${b.exhausted ? "bg-clay-600" : b.low ? "bg-harvest-500" : "bg-canopy-600"}`} style={{ width: `${Math.min(100, b.percentUsed)}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-600">
            Budget {naira(b.amount)} · committed {naira(b.committed)} · left {naira(Math.max(0, b.remaining))}
          </p>
        </>
      )}
      {!b.configured && b.committed > 0 && <p className="mt-1 text-xs text-ink-600">Committed so far: {naira(b.committed)}</p>}
      {canEdit && (
        <div className="field mt-2 flex flex-wrap items-end gap-2">
          <div><label htmlFor={`amt-${b.department}`}>Annual budget ₦</label><input id={`amt-${b.department}`} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div><label htmlFor={`warn-${b.department}`}>Warn at % used</label><input id={`warn-${b.department}`} type="number" min="1" max="100" value={warn} onChange={(e) => setWarn(e.target.value)} /></div>
          <button type="button" className="btn-primary" disabled={busy || amount === ""} onClick={save}>Save budget</button>
        </div>
      )}
    </div>
  );
}

export default function BudgetsPanel({ me }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    try { setData(await apiFetch(`/purchasing/budgets?year=${year}`)); setError(null); } catch (e) { setError(e.message); }
  }, [year]);
  useEffect(() => { load(); }, [load]);
  const canEdit = me?.isMain || me?.role === "Finance";
  return (
    <div className="space-y-3" data-testid="budgets-panel">
      <div className="card space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-ink-900">Annual purchasing budgets</p>
          <div className="flex items-center gap-2 text-xs text-ink-600">
            <button type="button" className="underline" onClick={() => setYear((y) => y - 1)}>previous year</button>
            <span className="font-medium text-ink-900">{year}</span>
            <button type="button" className="underline" onClick={() => setYear((y) => y + 1)}>next year</button>
          </div>
        </div>
        <p className="text-xs text-ink-600">
          {canEdit ? "Finance sets one budget for each department." : "Finance sets these budgets; you can see where each department stands."} What counts is the value of purchase orders the CEO has approved.
          A department head is told as soon as the budget is getting low. When it is used up, the next purchase waits for Finance's approval.
        </p>
      </div>
      {error && <p className="text-sm text-clay-100">{error}</p>}
      {data?.budgets.map((b) => <Row key={`${year}-${b.department}`} b={b} year={year} canEdit={canEdit} onSaved={load} setError={setError} />)}
    </div>
  );
}
