import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import CostDecision, { BudgetLine } from "../../components/CostDecision.jsx";

const naira = (n) => `₦${Number(n).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
const empty = { vehicleId: "", tripId: "", kind: "fuel", amount: "", litres: "", odometerKm: "", vendor: "", expenseDate: "", note: "" };
const statusText = { counted: "Counted", held: "Waiting for Finance", rejected: "Rejected by Finance" };

export default function CostsPanel({ vehicles }) {
  const [data, setData] = useState({ costs: [], budget: null });
  const [report, setReport] = useState(null);
  const [form, setForm] = useState(empty);
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([apiFetch("/transport/costs"), apiFetch("/transport/reports/fleet")]);
      setData(c); setReport(r); setError(null);
    } catch (err) { setError(err.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    try {
      const body = { ...form };
      for (const k of Object.keys(body)) if (body[k] === "") delete body[k];
      const r = await apiFetch("/transport/costs", { method: "POST", body });
      setNotice(r.waitingForFinance ? "Recorded. It is over the Transport budget, so it waits for Finance and does not count yet." : "Recorded.");
      setForm(empty); setShow(false); await load();
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-600">Fuel and running costs</p>
          <button className="btn-outline" type="button" onClick={() => setShow((v) => !v)}>+ Record cost</button>
        </div>
        <div className="mt-1"><BudgetLine budget={data.budget} /></div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        {notice && <p className="mt-3 text-sm text-canopy-800">{notice}</p>}
        {show && (
          <form onSubmit={add} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-3">
            <select aria-label="Vehicle" value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} required>
              <option value="">Vehicle</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate_number}</option>)}
            </select>
            <select aria-label="Kind of cost" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="fuel">Fuel</option><option value="toll">Toll</option><option value="allowance">Driver allowance</option><option value="other">Other</option>
            </select>
            <input type="number" min="0" step="0.01" placeholder="Amount (₦)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            {form.kind === "fuel" && <input type="number" min="0" step="0.01" placeholder="Litres" value={form.litres} onChange={(e) => setForm({ ...form, litres: e.target.value })} />}
            <input type="number" min="0" placeholder="Odometer (km)" value={form.odometerKm} onChange={(e) => setForm({ ...form, odometerKm: e.target.value })} />
            <input placeholder="Vendor or station" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
            <input type="date" aria-label="Date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
            <input className="sm:col-span-2" placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <div className="flex gap-2 sm:col-span-3"><button className="btn-primary" type="submit">Save cost</button><button className="btn-outline" type="button" onClick={() => setShow(false)}>Cancel</button></div>
          </form>
        )}
        <div className="mt-4 space-y-2">
          {data.costs.length === 0 && <p className="text-sm text-ink-600">No costs recorded yet.</p>}
          {data.costs.map((c) => (
            <div key={c.id} className="rounded-card border border-soil-200 px-3 py-2" data-testid="cost-row">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-medium text-ink-900">{c.kind}{c.litres ? `, ${Number(c.litres)} litres` : ""} · {c.plate_number}</p>
                  <p className="text-xs text-ink-600">{c.reference} · {String(c.expense_date).slice(0, 10)}{c.trip_reference ? ` · ${c.trip_reference}` : ""}{c.vendor ? ` · ${c.vendor}` : ""} · {statusText[c.budget_status]}</p>
                  {c.budget_note && <p className="text-xs text-ink-600">{c.budget_note}</p>}
                </div>
                <span className="font-medium text-ink-900">{naira(c.amount)}</span>
              </div>
              {c.budget_status === "held" && <CostDecision path={`/transport/costs/${c.id}/budget-decision`} onDone={load} />}
            </div>
          ))}
        </div>
      </div>

      {report && (
        <div className="card overflow-x-auto">
          <p className="text-sm text-ink-600">Fleet report {report.year}</p>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs text-ink-600"><tr><th className="pr-3">Vehicle</th><th className="pr-3">Trips</th><th className="pr-3">Km</th><th className="pr-3">Fuel (L)</th><th className="pr-3">Costs</th><th className="pr-3">Per km</th><th>Breakdowns</th></tr></thead>
            <tbody>
              {report.vehicles.map((v) => (
                <tr key={v.id} className="border-t border-soil-200">
                  <td className="py-1 pr-3">{v.plate_number}</td><td className="pr-3">{v.trips}</td><td className="pr-3">{Number(v.km).toLocaleString()}</td>
                  <td className="pr-3">{Number(v.fuel_litres).toLocaleString()}</td><td className="pr-3">{naira(v.cost_total)}</td><td className="pr-3">{v.cost_per_km === null ? "n/a" : naira(v.cost_per_km)}</td><td>{v.breakdowns}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
