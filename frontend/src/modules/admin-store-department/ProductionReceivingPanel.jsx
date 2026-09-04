import { useState } from "react";

// Production (admin) declares its own annual company-harvest records
// separately (Production Department page). Those declarations aren't
// real stock until Store confirms them here — same two-step pattern as
// receiving a farmer-sourced order, just for company-grown produce.
export default function ProductionReceivingPanel({ harvests, onReceive }) {
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  function setDraft(id, value) {
    setDrafts((prev) => ({ ...prev, [id]: value }));
  }

  async function handleReceive(harvest) {
    const qty = Number(drafts[harvest.id] ?? harvest.quantity);
    if (!qty || qty <= 0) return;
    setBusyId(harvest.id);
    setError("");
    try {
      await onReceive(harvest.id, qty);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Company harvests awaiting confirmation</p>
      <p className="mt-1 text-xs text-ink-600">
        Declared by Production Department. Confirm the actual quantity received to add it to the
        stock pool above.
      </p>

      <div className="mt-3 space-y-3">
        {harvests.length === 0 && <p className="text-sm text-ink-600">Nothing waiting.</p>}
        {harvests.map((h) => (
          <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-soil-200 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-ink-900">
                {h.quantity} {h.unit} {h.crop}
              </p>
              <p className="text-xs text-ink-600">
                {h.farm_name} · {h.harvested_at?.slice(0, 10)} · declared by {h.declared_by_name || "admin"}
              </p>
              {h.note && <p className="text-xs text-ink-600">Note: {h.note}</p>}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                className="w-24"
                placeholder={String(h.quantity)}
                value={drafts[h.id] ?? ""}
                onChange={(e) => setDraft(h.id, e.target.value)}
              />
              <button className="btn-outline" type="button" disabled={busyId === h.id} onClick={() => handleReceive(h)}>
                {busyId === h.id ? "Confirming…" : "Confirm & add to stock"}
              </button>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
