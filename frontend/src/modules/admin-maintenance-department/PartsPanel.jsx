import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const emptyForm = { name: "", partNumber: "", category: "", unit: "pcs", quantityOnHand: "0", unitCost: "0", reorderLevel: "5", supplier: "", location: "" };

export default function PartsPanel() {
  const [parts, setParts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [adjustFor, setAdjustFor] = useState(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [{ parts }, { movements }] = await Promise.all([
        apiFetch("/maintenance/parts"),
        apiFetch("/maintenance/parts/movements"),
      ]);
      setParts(parts);
      setMovements(movements);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/maintenance/parts", {
        method: "POST",
        body: { ...form, quantityOnHand: Number(form.quantityOnHand), unitCost: Number(form.unitCost), reorderLevel: Number(form.reorderLevel) },
      });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAdjust(direction) {
    const qty = Number(adjustQty);
    if (!qty || qty <= 0) return;
    try {
      await apiFetch(`/maintenance/parts/${adjustFor.id}/adjust`, {
        method: "POST",
        body: { direction, quantity: qty, reason: direction === "in" ? "purchase" : "adjustment" },
      });
      setAdjustFor(null);
      setAdjustQty("");
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between">
          <p className="text-sm text-ink-600">Spare parts stock levels</p>
          <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>+ Add part</button>
        </div>

        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

        {showForm && (
          <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-4">
            <input className="sm:col-span-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Part name" required />
            <input value={form.partNumber} onChange={(e) => setForm({ ...form, partNumber: e.target.value })} placeholder="Part number" />
            <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Category" />
            <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="Unit (pcs, ltr...)" />
            <input type="number" min="0" value={form.quantityOnHand} onChange={(e) => setForm({ ...form, quantityOnHand: e.target.value })} placeholder="Starting quantity" />
            <input type="number" min="0" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} placeholder="Unit cost (₦)" />
            <input type="number" min="0" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} placeholder="Reorder level" />
            <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="Supplier" />
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Storage location" />
            <div className="flex gap-2 sm:col-span-4">
              <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Add part"}</button>
              <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        )}

        <div className="mt-4 space-y-2">
          {parts.length === 0 && <p className="text-sm text-ink-600">No parts recorded yet.</p>}
          {parts.map((p) => {
            const low = Number(p.quantity_on_hand) <= Number(p.reorder_level);
            return (
              <div key={p.id} className="rounded-card border border-soil-200 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink-900">{p.name}</p>
                    <p className="text-xs text-ink-600">
                      {p.part_number || "—"} · {p.category || "—"} · ₦{Number(p.unit_cost).toLocaleString()}/{p.unit}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-xs ${low ? "bg-clay-100 text-clay-700" : "bg-canopy-50 text-canopy-800"}`}>
                      {Number(p.quantity_on_hand)} {p.unit} on hand
                    </span>
                    <button className="btn-outline" type="button" onClick={() => setAdjustFor(p)}>Adjust</button>
                  </div>
                </div>
                {adjustFor?.id === p.id && (
                  <div className="field mt-2 flex flex-wrap items-end gap-2">
                    <div>
                      <label>Quantity</label>
                      <input type="number" min="1" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} />
                    </div>
                    <button className="btn-primary" type="button" onClick={() => handleAdjust("in")}>Stock in</button>
                    <button className="btn-outline" type="button" onClick={() => handleAdjust("out")}>Stock out</button>
                    <button className="text-xs text-ink-600 underline" type="button" onClick={() => setAdjustFor(null)}>Cancel</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <p className="text-sm text-ink-600">Recent stock movements</p>
        <div className="mt-3 space-y-1">
          {movements.length === 0 && <p className="text-sm text-ink-600">No movements yet.</p>}
          {movements.slice(0, 20).map((m) => (
            <div key={m.id} className="flex items-center justify-between text-sm">
              <span className="text-ink-800">{m.part_name} — {m.reason.replace(/_/g, " ")}</span>
              <span className={m.direction === "in" ? "text-canopy-800" : "text-clay-700"}>
                {m.direction === "in" ? "+" : "−"}{Number(m.quantity)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
