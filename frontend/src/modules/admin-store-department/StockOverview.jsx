import { useState } from "react";

function ReorderLevelEditor({ stock, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(stock.reorderLevel);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave(stock.id, Number(value));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button type="button" className="text-xs text-canopy-800 underline" onClick={() => setEditing(true)}>
        reorder at {stock.reorderLevel}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        type="number"
        min="0"
        step="0.01"
        className="w-16 px-1 py-0.5 text-xs"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
      />
      <button type="button" className="text-xs text-canopy-800" disabled={saving} onClick={save}>
        {saving ? "…" : "Save"}
      </button>
      <button type="button" className="text-xs text-ink-600" onClick={() => setEditing(false)}>
        Cancel
      </button>
    </span>
  );
}

export default function StockOverview({ stock, onRaiseRestockRequest, requestingCrop, onSaveReorderLevel }) {
  return (
    <div className="card">
      <p className="text-sm text-ink-600">Stock on hand</p>
      <div className="mt-3 space-y-2">
        {stock.length === 0 && <p className="text-sm text-ink-600">No inventory recorded yet.</p>}
        {stock.map((s) => (
          <div
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-soil-200 px-3 py-2"
          >
            <div>
              <span className="text-ink-900">{s.crop}</span>
              <span className="ml-2 text-sm text-ink-600">
                {s.quantity} {s.unit}
              </span>
              {s.low && (
                <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                  Low
                </span>
              )}
              <span className="ml-2">
                <ReorderLevelEditor stock={s} onSave={onSaveReorderLevel} />
              </span>
            </div>
            {s.low && onRaiseRestockRequest && (
              <button
                type="button"
                className="btn-outline text-xs"
                disabled={requestingCrop === s.crop}
                onClick={() => onRaiseRestockRequest(s)}
              >
                {requestingCrop === s.crop ? "Raising…" : "Raise restock request"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
