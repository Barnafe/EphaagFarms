import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";

// Full product detail modal — opened when a shopper taps a catalog card.
// Shows the item's icon/description, price, a variant ("size") selector
// where relevant, and a quantity stepper, then "Add to cart". Colors:
// this is a white surface, so text uses plain text-gray-* (see note in
// ProductCatalog.jsx) rather than text-ink-* which the dashboard's dark
// theme would invert to a light color.
export default function ProductDetailPanel({ item, onSave, onClose }) {
  const [quantity, setQuantity] = useState(1);
  const [size, setSize] = useState(item.sizes ? item.sizes[0] : null);

  const lineTotal = item.price * quantity;

  function adjust(delta) {
    setQuantity((q) => Math.max(1, q + delta));
  }

  function handleSave() {
    if (!quantity || quantity <= 0) return;
    onSave({
      crop: item.crop,
      unit: item.unit,
      size,
      quantity: Number(quantity),
      lineTotal,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-card bg-white sm:rounded-card">
        <div className="relative flex h-40 items-center justify-center bg-gradient-to-br from-canopy-50 to-soil-50 text-7xl">
          {item.icon}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-gray-600 shadow hover:text-gray-900"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
            {item.category}
          </span>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <h2 className="text-lg font-medium text-gray-900">{item.crop}</h2>
            <p className="mt-1 text-sm text-gray-500">{item.description}</p>
            <p className="mt-2 text-xl font-semibold text-canopy-800">
              ₦{item.price.toLocaleString()} <span className="text-sm font-normal text-gray-500">/ {item.unit}</span>
            </p>
          </div>

          {item.sizes && (
            <div>
              <p className="mb-1 text-sm font-medium text-gray-800">Choose option</p>
              <div className="flex flex-wrap gap-2">
                {item.sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSize(s)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      size === s
                        ? "border-canopy-600 bg-canopy-50 font-medium text-canopy-800"
                        : "border-gray-200 text-gray-600 hover:border-canopy-400"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-1 text-sm font-medium text-gray-800">Quantity ({item.unit})</p>
            <div className="flex w-fit items-center rounded-full border border-gray-200">
              <button
                type="button"
                onClick={() => adjust(-1)}
                aria-label="Decrease quantity"
                className="flex h-9 w-9 items-center justify-center text-gray-600 hover:text-canopy-800"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                className="w-14 border-x border-gray-200 bg-transparent py-1.5 text-center text-sm text-gray-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => adjust(1)}
                aria-label="Increase quantity"
                className="flex h-9 w-9 items-center justify-center text-gray-600 hover:text-canopy-800"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-card bg-soil-50 px-3 py-2.5 text-sm">
            <span className="text-gray-600">Item total</span>
            <span className="font-semibold text-gray-900">₦{lineTotal.toLocaleString()}</span>
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-gray-100 bg-white p-4">
          <button className="btn-primary w-full" type="button" onClick={handleSave}>
            Add to cart — ₦{lineTotal.toLocaleString()}
          </button>
        </div>
      </div>
    </div>
  );
}
