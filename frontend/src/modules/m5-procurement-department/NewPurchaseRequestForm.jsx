import { useState } from "react";

const DEPARTMENTS = ["Store", "Production", "Maintenance", "Transport", "Finance", "TRC", "Procurement", "Other"];

function emptyItem() {
  return { description: "", quantity: "", unit: "", estimatedUnitPrice: "" };
}

export default function NewPurchaseRequestForm({ onSubmit }) {
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [title, setTitle] = useState("");
  const [justification, setJustification] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [items, setItems] = useState([emptyItem()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);

  function updateItem(i, field, value) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
  }

  function removeItem(i) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    const cleanItems = items
      .filter((it) => it.description.trim() && it.quantity)
      .map((it) => ({
        description: it.description.trim(),
        quantity: Number(it.quantity),
        unit: it.unit.trim() || undefined,
        estimatedUnitPrice: it.estimatedUnitPrice ? Number(it.estimatedUnitPrice) : undefined,
      }));
    if (!title.trim() || cleanItems.length === 0) {
      setError("Give the request a title and at least one item with a quantity.");
      return;
    }
    setBusy(true);
    try {
      const { request } = await onSubmit({
        department,
        title: title.trim(),
        justification: justification.trim() || undefined,
        neededBy: neededBy || undefined,
        items: cleanItems,
      });
      setDone(request.reference);
      setTitle("");
      setJustification("");
      setNeededBy("");
      setItems([emptyItem()]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card max-w-2xl space-y-4">
      <div>
        <p className="text-sm font-medium text-ink-900">Raise a purchase request</p>
        <p className="text-xs text-ink-600">
          "We need something" — describe what's needed and why. This goes to need verification next.
        </p>
      </div>

      {error && <p className="text-sm text-clay-100">{error}</p>}
      {done && <p className="text-sm text-canopy-200">Submitted as {done} — awaiting need verification.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-ink-600">
          Department
          <select
            className="mt-1 w-full rounded-card border border-soil-200 px-3 py-2 text-sm"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-600">
          Needed by (optional)
          <input
            type="date"
            className="mt-1 w-full rounded-card border border-soil-200 px-3 py-2 text-sm"
            value={neededBy}
            onChange={(e) => setNeededBy(e.target.value)}
          />
        </label>
      </div>

      <label className="block text-xs text-ink-600">
        Title
        <input
          className="mt-1 w-full rounded-card border border-soil-200 px-3 py-2 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Office stationery restock"
        />
      </label>

      <label className="block text-xs text-ink-600">
        Justification (optional)
        <textarea
          className="mt-1 w-full rounded-card border border-soil-200 px-3 py-2 text-sm"
          rows={2}
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
        />
      </label>

      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-600">Items needed</p>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <input
              className="col-span-5 rounded-card border border-soil-200 px-2 py-1.5 text-sm"
              placeholder="Description"
              value={it.description}
              onChange={(e) => updateItem(i, "description", e.target.value)}
            />
            <input
              type="number"
              min="0"
              className="col-span-2 rounded-card border border-soil-200 px-2 py-1.5 text-sm"
              placeholder="Qty"
              value={it.quantity}
              onChange={(e) => updateItem(i, "quantity", e.target.value)}
            />
            <input
              className="col-span-2 rounded-card border border-soil-200 px-2 py-1.5 text-sm"
              placeholder="Unit"
              value={it.unit}
              onChange={(e) => updateItem(i, "unit", e.target.value)}
            />
            <input
              type="number"
              min="0"
              className="col-span-2 rounded-card border border-soil-200 px-2 py-1.5 text-sm"
              placeholder="Est. unit price"
              value={it.estimatedUnitPrice}
              onChange={(e) => updateItem(i, "estimatedUnitPrice", e.target.value)}
            />
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="col-span-1 text-xs text-clay-100"
              title="Remove item"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={addItem} className="text-xs text-canopy-800">
          + Add another item
        </button>
      </div>

      <button className="btn-primary" type="submit" disabled={busy}>
        {busy ? "Submitting…" : "Submit purchase request"}
      </button>
    </form>
  );
}
