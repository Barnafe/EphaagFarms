import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const naira = (v) => `₦${Number(v).toLocaleString()}`;
const CATEGORY = { inputs: "Inputs (seed, feed, fertiliser…)", labour: "Labour", other: "Other" };

function Tile({ label, value, sub, tone, testId }) {
  return (
    <div className="card">
      <p className="text-xs text-ink-600">{label}</p>
      <p className={`mt-1 text-xl font-medium ${tone || "text-canopy-800"}`} data-testid={testId}>{value}</p>
      {sub && <p className="text-xs text-ink-600">{sub}</p>}
    </div>
  );
}

/** Costs per farm (inputs, labour, other) and the profit they leave, per harvest and per farm. */
export default function CostsAndProfit({ farms, onChanged }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [profit, setProfit] = useState(null);
  const [costs, setCosts] = useState([]);
  const [harvests, setHarvests] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ farmId: "", category: "inputs", description: "", amount: "", incurredOn: "", harvestId: "" });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value, ...(k === "farmId" ? { harvestId: "" } : {}) }));

  const load = useCallback(async () => {
    try {
      const [p, c, h] = await Promise.all([
        apiFetch(`/production/profit?year=${year}`), apiFetch(`/production/costs?year=${year}`), apiFetch(`/production/harvests?year=${year}`),
      ]);
      setProfit(p); setCosts(c.costs); setHarvests(h.harvests); setError("");
    } catch (e) { setError(e.message); }
  }, [year]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!f.farmId && farms[0]) setF((p) => ({ ...p, farmId: farms[0].id })); }, [farms, f.farmId]);

  async function addCost(e) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await apiFetch("/production/costs", { method: "POST", body: {
        farmId: f.farmId, category: f.category, description: f.description, amount: Number(f.amount),
        incurredOn: f.incurredOn || undefined, harvestId: f.harvestId || undefined } });
      setF((p) => ({ ...p, description: "", amount: "", incurredOn: "", harvestId: "" }));
      await load(); onChanged?.();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function removeCost(id) {
    if (!confirm("Remove this cost?")) return;
    try { await apiFetch(`/production/costs/${id}`, { method: "DELETE" }); await load(); onChanged?.(); } catch (err) { setError(err.message); }
  }

  const farmHarvests = harvests.filter((h) => h.farm_id === f.farmId);
  const t = profit?.totals;
  return (
    <div className="space-y-4" data-testid="costs-profit">
      <div className="card flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink-900">Costs and profit</p>
          <p className="text-xs text-ink-600">Record what each farm spends. Charge a cost to a harvest to see that harvest's profit, or leave it as a general farm cost.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-600">
          <button type="button" className="underline" onClick={() => setYear((y) => y - 1)}>previous</button>
          <span className="font-medium text-ink-900" data-testid="profit-year">{year}</span>
          <button type="button" className="underline" onClick={() => setYear((y) => y + 1)}>next</button>
        </div>
      </div>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}

      {t && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Revenue" value={naira(t.revenue)} testId="tile-revenue" />
          <Tile label="Costs" value={naira(t.costs)} tone="text-clay-700" testId="tile-costs" />
          <Tile label="Profit" value={naira(t.profit)} tone={t.profit < 0 ? "text-clay-700" : "text-canopy-800"} testId="tile-profit" />
          <Tile label="Harvests with no value yet" value={t.harvestsMissingRevenue} sub="Their profit is unknown, not zero" />
        </div>
      )}

      <form onSubmit={addCost} className="card field grid gap-3 sm:grid-cols-3" data-testid="cost-form">
        <p className="text-sm text-ink-600 sm:col-span-3">Record a cost</p>
        <div><label htmlFor="cost-farm">Farm</label><select id="cost-farm" value={f.farmId} onChange={set("farmId")} required>{farms.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div><label htmlFor="cost-cat">Type</label><select id="cost-cat" value={f.category} onChange={set("category")}>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label htmlFor="cost-amt">Amount ₦</label><input id="cost-amt" type="number" min="1" value={f.amount} onChange={set("amount")} required /></div>
        <div className="sm:col-span-2"><label htmlFor="cost-desc">What was it for?</label><input id="cost-desc" value={f.description} onChange={set("description")} placeholder="For example: layer feed, 40 bags" required /></div>
        <div><label htmlFor="cost-date">Date (today if empty)</label><input id="cost-date" type="date" value={f.incurredOn} onChange={set("incurredOn")} /></div>
        <div className="sm:col-span-3">
          <label htmlFor="cost-harvest">Charge it to a harvest of this farm (optional)</label>
          <select id="cost-harvest" value={f.harvestId} onChange={set("harvestId")}>
            <option value="">General farm cost (not for one harvest)</option>
            {farmHarvests.map((h) => <option key={h.id} value={h.id}>{h.harvested_at?.slice(0, 10)} · {h.quantity} {h.unit} {h.crop}</option>)}
          </select>
        </div>
        <button className="btn-primary sm:col-span-3" type="submit" disabled={busy || !f.farmId}>{busy ? "Saving…" : "Add cost"}</button>
      </form>

      {profit && (
        <>
          <div className="card">
            <p className="text-sm text-ink-600">Profit per harvest, {year}</p>
            <div className="mt-2 space-y-2" data-testid="harvest-profit">
              {profit.harvests.length === 0 && <p className="text-sm text-ink-600">No harvests this year.</p>}
              {profit.harvests.map((h) => (
                <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-soil-100 pb-2 text-sm">
                  <span className="text-ink-900">{h.farmName}: {h.quantity} {h.unit} {h.crop} <span className="text-xs text-ink-600">({h.harvestedAt?.slice(0, 10)})</span></span>
                  <span className="text-xs text-ink-600">
                    {h.revenue === null ? "value not recorded" : `worth ${naira(h.revenue)}`} · costs {naira(h.costs)} ·{" "}
                    <span className={h.profit === null ? "" : h.profit < 0 ? "text-clay-700 font-medium" : "text-canopy-800 font-medium"}>{h.profit === null ? "profit unknown" : `profit ${naira(h.profit)}${h.margin !== null ? ` (${h.margin}%)` : ""}`}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <p className="text-sm text-ink-600">Each farm, {year} (includes general farm costs)</p>
            <div className="mt-2 space-y-2" data-testid="farm-profit">
              {profit.farms.filter((x) => x.revenue || x.costs).map((x) => (
                <div key={x.farmId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-ink-900">{x.name} <span className="text-xs text-ink-600">({x.kind})</span></span>
                  <span className="text-xs text-ink-600">revenue {naira(x.revenue)} · costs {naira(x.costs)} (general {naira(x.generalCosts)}) · <span className={x.profit < 0 ? "text-clay-700 font-medium" : "text-canopy-800 font-medium"}>profit {naira(x.profit)}</span></span>
                </div>
              ))}
              <p className="text-xs text-ink-600">Costs by type: inputs {naira(profit.costsByCategory.inputs)} · labour {naira(profit.costsByCategory.labour)} · other {naira(profit.costsByCategory.other)}</p>
            </div>
          </div>
        </>
      )}

      <div className="card">
        <p className="text-sm text-ink-600">Costs recorded, {year}</p>
        <div className="mt-2 space-y-1" data-testid="cost-list">
          {costs.length === 0 && <p className="text-sm text-ink-600">None yet.</p>}
          {costs.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-ink-900">{c.farm_name}: {c.description} <span className="text-xs text-ink-600">({c.category}{c.harvest_crop ? `, for the ${c.harvest_crop} harvest` : ", general"})</span></span>
              <span className="flex items-center gap-3 text-xs text-ink-600">{c.incurred_on?.slice(0, 10)} · {naira(c.amount)}
                <button type="button" className="text-red-700 underline" onClick={() => removeCost(c.id)}>Remove</button></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
