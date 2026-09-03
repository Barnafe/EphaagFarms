import { Minus, Plus, Trash2 } from "lucide-react";

// Shopping-cart page — list items with inline quantity adjustment and
// removal, then hand off to checkout. Delivery details, contacts, and
// payment live in the separate checkout step (CheckoutForm), matching a
// real shopping site's cart → checkout → payment flow.
export default function CartReview({ cart, onUpdateQuantity, onRemove, onCheckout, onBack }) {
  const total = cart.reduce((sum, line) => sum + line.lineTotal, 0);

  return (
    <div className="rounded-card border border-soil-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-900">Your cart</p>
        <button type="button" onClick={onBack} className="text-sm text-canopy-800">
          ← Continue shopping
        </button>
      </div>

      {cart.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">Your cart is empty.</p>
      ) : (
        <div className="space-y-2">
          {cart.map((line, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-card border border-gray-100 px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">
                  {line.crop}
                  {line.size ? ` · ${line.size}` : ""}
                </p>
                <p className="text-xs text-gray-500">
                  ₦{(line.lineTotal / line.quantity).toLocaleString()} / {line.unit}
                </p>
              </div>

              <div className="flex items-center rounded-full border border-gray-200">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => onUpdateQuantity(i, Math.max(1, line.quantity - 1))}
                  className="flex h-7 w-7 items-center justify-center text-gray-600 hover:text-canopy-800"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center text-sm text-gray-900">{line.quantity}</span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => onUpdateQuantity(i, line.quantity + 1)}
                  className="flex h-7 w-7 items-center justify-center text-gray-600 hover:text-canopy-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              <p className="w-20 shrink-0 text-right text-sm font-medium text-gray-900">
                ₦{line.lineTotal.toLocaleString()}
              </p>

              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label="Remove item"
                className="text-gray-400 hover:text-clay-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between rounded-card bg-soil-50 px-3 py-2.5 text-sm">
        <span className="text-gray-600">Subtotal</span>
        <span className="font-semibold text-gray-900">₦{total.toLocaleString()}</span>
      </div>

      <button
        className="btn-primary w-full"
        type="button"
        disabled={cart.length === 0}
        onClick={onCheckout}
      >
        Proceed to checkout
      </button>
    </div>
  );
}
