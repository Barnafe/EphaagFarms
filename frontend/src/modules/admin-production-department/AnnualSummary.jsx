import { useState } from "react";

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);
const UNIT_OPTIONS = ["kg", "tons", "bags", "tubers", "crates", "baskets"];

// "Just to take note of our development and farming achievements
// annually" — the actual point of this department, split into two
// distinct things (2026-09-05):
//
// 1. "Declare annual production" — the company's own single official
//    figure per crop for the year, company-wide. No farm selection here
//    on purpose: this is Ephaag declaring one combined total ("we
//    produced X yam in 2026"), not a per-farm breakdown. Backed by
//    production_annual_declarations (one row per year+crop).
// 2. "Farm harvest totals" — a read-only rollup of the Harvests tab's
//    per-farm records (that tab is where farm-by-farm output actually
//    gets tracked — see HarvestLog/FarmList), shown here just so the two
//    views sit side by side for comparison.
export default function AnnualSummary({ year, onYearChange, summary, declarations, onDeclareAnnual }) {
  const [crop, setCrop] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState(UNIT_OPTIONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!crop || !quantity) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await onDeclareAnnual({ year, crop, quantity: Number(quantity), unit, note: note || undefined });
      setSuccess(`Annual production for ${crop} declared for ${year}.`);
      setCrop("");
      setQuantity("");
      setNote("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-600">Annual production summary</p>
          {/* on-light: this is a white control sitting inside the dark
              .dash-scope area — without it, the dashboard's global light-text
              rule (meant for dark cards) would make the selected year
              unreadable on the select's white background. See the on-light
              block in index.css. */}
          <span className="on-light">
            <select
              value={year}
              onChange={(e) => onYearChange(Number(e.target.value))}
              className="rounded-card border border-soil-200 bg-white px-3 py-1.5 text-sm text-ink-900"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </span>
        </div>

        <p className="mt-3 text-sm text-ink-600">Declare annual production</p>
        <p className="mt-1 text-xs text-ink-600">
          The company's own combined total for the year, by crop — not tied to any one farm. For
          per-farm output, use the Harvests tab instead.
        </p>
        <form onSubmit={handleSubmit} className="field mt-3 grid gap-3 sm:grid-cols-3">
          <input value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="Crop, e.g. Yam" required />
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Total quantity"
              required
            />
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
          <button className="btn-primary sm:col-span-3" type="submit" disabled={busy}>
            {busy ? "Declaring…" : `Declare for ${year}`}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        {success && <p className="mt-3 text-sm text-canopy-800">{success}</p>}

        <div className="mt-5 border-t border-soil-200 pt-4">
          {declarations.length === 0 ? (
            <p className="text-sm text-ink-600">No annual production declared for {year} yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-ink-600">
                    <th className="pb-2 pr-3">Crop</th>
                    <th className="pb-2 pr-3">Declared total</th>
                    <th className="pb-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {declarations.map((d) => (
                    <tr key={d.id} className="border-t border-soil-200">
                      <td className="py-2 pr-3 font-medium text-ink-900">{d.crop}</td>
                      <td className="py-2 pr-3 text-ink-900">
                        {d.quantity} {d.unit}
                      </td>
                      <td className="py-2 text-ink-600">{d.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <p className="text-sm text-ink-600">Farm harvest totals ({year})</p>
        <p className="mt-1 text-xs text-ink-600">
          Rolled up from each farm's own records in the Harvests tab, for comparison.
        </p>
        {summary.length === 0 ? (
          <p className="mt-3 text-sm text-ink-600">No harvests declared for {year} yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-ink-600">
                  <th className="pb-2 pr-3">Crop</th>
                  <th className="pb-2 pr-3">Declarations</th>
                  <th className="pb-2 pr-3">Total declared</th>
                  <th className="pb-2">Confirmed by Store</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row) => (
                  <tr key={row.crop} className="border-t border-soil-200">
                    <td className="py-2 pr-3 font-medium text-ink-900">{row.crop}</td>
                    <td className="py-2 pr-3 text-ink-600">{row.declarations}</td>
                    <td className="py-2 pr-3 text-ink-900">
                      {row.totalDeclared} {row.unit}
                    </td>
                    <td className="py-2 text-ink-900">
                      {row.totalReceived} {row.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
