import { useState } from "react";

// The two-price split (2026-08-30 spec): buy_price is what farmers are
// paid, sell_price is what buyers pay — set here.
export default function PriceEditorPanel({ prices, onSave }) {
  const [edits, setEdits] = useState({});

  function setEdit(id, field, value) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  function handleSave(p) {
    const edit = edits[p.id] || {};
    onSave(p.id, {
      buyPrice: edit.buyPrice != null && edit.buyPrice !== "" ? Number(edit.buyPrice) : undefined,
      sellPrice: edit.sellPrice != null && edit.sellPrice !== "" ? Number(edit.sellPrice) : undefined,
    });
    setEdits((prev) => ({ ...prev, [p.id]: {} }));
  }

  return (
    <div className="card">
      <p className="text-sm text-ink-600">Prices</p>
      <p className="mt-1 text-xs text-ink-600">
        Buy price is what farmers are paid (farmer-visible). Sell price is what buyers pay (buyer-visible) —
        keep sell price above buy price to cover conveying, processing, and overhead.
      </p>
      <div className="mt-4 space-y-2 field">
        {prices.map((p) => (
          <div key={p.id} className="grid grid-cols-1 items-end gap-2 rounded-card border border-soil-200 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-ink-900">{p.crop}</p>
              <p className="text-xs text-ink-600">per {p.unit}</p>
            </div>
            <div>
              <label className="text-xs">Buy price (₦)</label>
              <input
                type="number"
                min="0"
                value={edits[p.id]?.buyPrice ?? p.buy_price}
                onChange={(e) => setEdit(p.id, "buyPrice", e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs">Sell price (₦)</label>
              <input
                type="number"
                min="0"
                value={edits[p.id]?.sellPrice ?? p.sell_price}
                onChange={(e) => setEdit(p.id, "sellPrice", e.target.value)}
              />
            </div>
            <button className="btn-outline" type="button" onClick={() => handleSave(p)}>
              Save
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
