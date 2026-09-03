import { useState } from "react";

export default function PriceListManager({ prices, onUpdate }) {
  const [editingCrop, setEditingCrop] = useState(null);
  const [draftPrice, setDraftPrice] = useState("");

  function startEdit(item) {
    setEditingCrop(item.crop);
    setDraftPrice(String(item.price));
  }

  function saveEdit(crop) {
    const today = new Date().toISOString().slice(0, 7);
    onUpdate(crop, Number(draftPrice), today);
    setEditingCrop(null);
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Standardized prices</p>
      <p className="mt-1 text-xs text-ink-600">
        Set from offline research and the annual buyer/seller price review — not an
        in-app approval workflow.
      </p>
      <div className="mt-3 space-y-2">
        {prices.map((item) => (
          <div
            key={item.crop}
            className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium text-ink-900">{item.crop}</p>
              <p className="text-xs text-ink-600">per {item.unit} · reviewed {item.lastReviewed}</p>
            </div>

            {editingCrop === item.crop ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={draftPrice}
                  onChange={(e) => setDraftPrice(e.target.value)}
                  className="w-28 rounded-card border border-soil-200 px-2 py-1 text-sm"
                />
                <button className="btn-primary" type="button" onClick={() => saveEdit(item.crop)}>
                  Save
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => startEdit(item)} className="text-canopy-800">
                ₦{item.price.toLocaleString()} — edit
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
