import { useState, useEffect } from "react";

const UNIT_OPTIONS = ["kg", "tons", "bags", "tubers", "crates", "baskets"];

// "Stock get low, store make purchase request via the approval workflow
// and tag relevant people eg. Procurement, finance and admin" — creates a
// department_request pre-chained to Procurement's and Finance's current
// heads (whichever are assigned), same generic system every other
// department's requests already use — see it and its approvals in
// Requests > Mine, including the print view once approved.
export default function RestockRequestPanel({ onSubmit, prefill }) {
  const [crop, setCrop] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState(UNIT_OPTIONS[0]);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // A "Raise restock request" click from the low-stock badge in
  // StockOverview prefills this form rather than silently submitting
  // for the user — quantity/unit for a purchase request is a judgment
  // call Store should confirm, not something to auto-decide.
  useEffect(() => {
    if (!prefill) return;
    setCrop(prefill.crop);
    if (prefill.unit && UNIT_OPTIONS.includes(prefill.unit)) setUnit(prefill.unit);
    setNote(
      `Stock on hand for ${prefill.crop} is ${prefill.quantity} ${prefill.unit}, below the reorder level of ${prefill.reorderLevel} ${prefill.unit}.`
    );
  }, [prefill]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!crop || !quantity) return;
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const request = await onSubmit({ crop, quantity: Number(quantity), unit, note });
      setSuccess(`Request ${request.reference} created — see Requests > Mine for approval status.`);
      setCrop("");
      setQuantity("");
      setNote("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Request a restock</p>
      <p className="mt-1 text-xs text-ink-600">
        Routes to Procurement, then Finance, then Admin for final approval — same as any other department request.
      </p>
      <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 sm:grid-cols-4">
        <input value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="Crop, e.g. Yam" required />
        <input
          type="number"
          min="0"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Quantity"
          required
        />
        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          {UNIT_OPTIONS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Sending…" : "Request restock"}
        </button>
        <input
          className="sm:col-span-4"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
        />
      </form>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {success && <p className="mt-3 text-sm text-canopy-800">{success}</p>}
    </div>
  );
}
