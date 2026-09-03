import { ShoppingCart } from "lucide-react";

// Persistent floating bar while browsing the catalog — shows a running
// item count + total and a way into the cart, same pattern as any
// shopping site's mini-cart bar.
export default function CartBar({ cart, onReview }) {
  if (cart.length === 0) return null;

  const total = cart.reduce((sum, line) => sum + line.lineTotal, 0);

  return (
    <div className="sticky bottom-4 z-10 flex items-center justify-between rounded-card border border-canopy-600 bg-white px-4 py-3 shadow-lg">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-canopy-50 text-canopy-800">
          <ShoppingCart className="h-4 w-4" />
        </span>
        <p className="text-sm text-gray-900">
          <span className="font-medium">{cart.length}</span> item{cart.length > 1 ? "s" : ""} · ₦{total.toLocaleString()}
        </p>
      </div>
      <button className="btn-primary" type="button" onClick={onReview}>
        View cart
      </button>
    </div>
  );
}
