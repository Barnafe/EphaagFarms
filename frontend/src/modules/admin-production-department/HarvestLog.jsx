import { useState } from "react";

const UNIT_OPTIONS = ["kg", "tons", "bags", "tubers", "crates", "baskets"];
const LIVESTOCK_UNITS = ["crates", "trays", "birds", "heads", "kg", "litres"];
const naira = (v) => `₦${Number(v).toLocaleString()}`;

// "Admin declares" a harvest, same idea as a farmer declaring produce, // this is Production's own annual record. It is NOT stock yet: Store
// separately confirms/receives each declaration before it enters the
// real inventory pool (see the Production Receiving panel on the Store
// Department page).
export default function HarvestLog({ farms, harvests, onDeclare, onSetRevenue }) {
  const [farmId, setFarmId] = useState(farms[0]?.id ?? "");
  const [crop, setCrop] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState(UNIT_OPTIONS[0]);
  const [harvestedAt, setHarvestedAt] = useState("");
  const [note, setNote] = useState("");
  const [revenue, setRevenue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const selectedFarm = farms.find((f) => f.id === farmId);
  const livestock = selectedFarm?.kind === "livestock";
  const units = livestock ? LIVESTOCK_UNITS : UNIT_OPTIONS;

  function handleFarmChange(id) {
    setFarmId(id);
    const farm = farms.find((f) => f.id === id);
    if (farm?.crop && !crop) setCrop(farm.crop);
    setUnit((farm?.kind === "livestock" ? LIVESTOCK_UNITS : UNIT_OPTIONS)[0]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!farmId || !crop || !quantity) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await onDeclare({
        farmId,
        crop,
        quantity: Number(quantity),
        unit,
        harvestedAt: harvestedAt || undefined,
        note: note || undefined,
        revenue: revenue === "" ? undefined : Number(revenue),
      });
      setSuccess("Harvest declared. Store will confirm and add it to inventory.");
      setQuantity("");
      setNote("");
      setRevenue("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Declare a harvest</p>
      <p className="mt-1 text-xs text-ink-600">
        This records what Ephaag's own farms produced. Store separately confirms each declaration
        before it becomes real, sellable stock, same as a farmer's own declaration.
      </p>

      <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 sm:grid-cols-3">
        <select value={farmId} onChange={(e) => handleFarmChange(e.target.value)} required>
          {farms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <input value={crop} onChange={(e) => setCrop(e.target.value)} placeholder={livestock ? "Product, e.g. Eggs, Broilers" : "Crop, e.g. Yam"} required />
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Quantity"
            required
          />
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {units.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
        <input
          type="date"
          value={harvestedAt}
          onChange={(e) => setHarvestedAt(e.target.value)}
          title="Harvest date (defaults to today)"
        />
        <input
          type="number"
          min="0"
          value={revenue}
          onChange={(e) => setRevenue(e.target.value)}
          placeholder="What it was worth ₦ (optional)"
          title="What this harvest was worth or sold for. You can add it later."
        />
        <input
          className="sm:col-span-3"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
        />
        <button className="btn-primary sm:col-span-3" type="submit" disabled={busy || !selectedFarm}>
          {busy ? "Declaring…" : "Declare harvest"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {success && <p className="mt-3 text-sm text-canopy-800">{success}</p>}

      <div className="mt-5 space-y-2 border-t border-soil-200 pt-4">
        <p className="text-sm text-ink-600">Recent declarations</p>
        {harvests.length === 0 && <p className="text-sm text-ink-600">None yet.</p>}
        {harvests.slice(0, 15).map((h) => (
          <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-ink-600">
              {h.farm_name} · {h.harvested_at?.slice(0, 10)}
            </span>
            <span className="text-ink-900">
              {h.quantity} {h.unit} {h.crop}
            </span>
            <RevenueCell h={h} onSet={onSetRevenue} />
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                h.status === "received" ? "bg-canopy-50 text-canopy-800" : "bg-harvest-50 text-harvest-600"
              }`}
            >
              {h.status === "received" ? `Received by Store (${h.quantity_received} ${h.unit})` : "Awaiting Store confirmation"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// What a harvest was worth: shown when known, and can be filled in or corrected here.
function RevenueCell({ h, onSet }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(h.revenue ?? "");
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    try { await onSet(h.id, value === "" ? null : Number(value)); setEditing(false); } catch (e) { setErr(e.message); }
  }
  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <input aria-label="Harvest value" type="number" min="0" className="w-28 rounded-card border border-soil-200 px-2 py-0.5 text-xs" value={value} onChange={(e) => setValue(e.target.value)} />
        <button type="button" className="text-xs text-canopy-800 underline" onClick={save}>Save</button>
        {err && <span className="text-xs text-red-700">{err}</span>}
      </span>
    );
  }
  return (
    <button type="button" className="text-xs text-ink-600 underline" onClick={() => setEditing(true)} data-testid={`harvest-value-${h.id}`}>
      {h.revenue === null || h.revenue === undefined ? "Add its value" : `Worth ${naira(h.revenue)}`}
    </button>
  );
}
