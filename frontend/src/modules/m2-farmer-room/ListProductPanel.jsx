import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const UNIT_OPTIONS = [
  { value: "kg", label: "Kilograms (kg)" },
  { value: "tons", label: "Tons" },
  { value: "bags", label: "Bags" },
  { value: "tubers", label: "Tubers" },
  { value: "crates", label: "Crates" },
  { value: "baskets", label: "Baskets" },
];

export default function ListProductPanel() {
  const [products, setProducts] = useState([]);
  const [balances, setBalances] = useState([]);
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [crop, setCrop] = useState("");
  const [quantity, setQuantity] = useState("");
  const [address, setAddress] = useState("");

  const selectedBalance = balances.find((b) => b.crop === crop) || null;
  const cropPrice = prices.find((p) => p.crop === crop);

  async function load() {
    setLoading(true);
    try {
      const [{ products }, { balances: bal }, { prices: pr }] = await Promise.all([
        apiFetch("/farmers/me/products"),
        apiFetch("/farmers/me/declared-balances"),
        apiFetch("/farmers/prices"),
      ]);
      setProducts(products);
      setBalances(bal);
      setPrices(pr);
      setCrop((prev) => prev || bal[0]?.crop || "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!crop || !selectedBalance) return;
    setError("");
    setSubmitting(true);
    try {
      await apiFetch("/farmers/me/products", {
        method: "POST",
        body: { crop, quantity: Number(quantity), unit: selectedBalance.unit, address },
      });
      setQuantity("");
      setAddress("");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleStatus(product) {
    try {
      await apiFetch(`/farmers/me/products/${product.id}`, {
        method: "PATCH",
        body: { status: product.status === "available" ? "sold_out" : "available" },
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(product) {
    if (!window.confirm(`Remove this listing (${product.crop} — ${product.quantity} ${product.unit})?`)) return;
    try {
      await apiFetch(`/farmers/me/products/${product.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-600">List product</p>
          <p className="mt-1 text-xs text-ink-600">
            Put something up for sale, whenever you're ready — this morning, this evening, anytime.
          </p>
        </div>
        {!showForm && (
          <button className="btn-outline" type="button" onClick={() => setShowForm(true)}>
            List new product
          </button>
        )}
      </div>

      {balances.length === 0 && (
        <p className="mt-3 text-sm text-harvest-600">
          You haven't declared any products yet — declare one above before listing it for sale.
        </p>
      )}

      {showForm && balances.length > 0 && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label>Product</label>
            <select value={crop} onChange={(e) => { setCrop(e.target.value); setQuantity(""); }}>
              {balances.map((b) => (
                <option key={b.crop} value={b.crop}>
                  {b.crop} — {b.remaining} {b.unit} left to list
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Quantity available</label>
            <input
              type="number"
              min="0"
              max={selectedBalance?.remaining ?? undefined}
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              placeholder="e.g. 30"
            />
            {selectedBalance && (
              <p className="mt-1 text-xs text-ink-600">
                You have {selectedBalance.remaining} {selectedBalance.unit} of {selectedBalance.crop} left to list.
              </p>
            )}
            {cropPrice && (
              <p className="mt-1 text-xs text-canopy-800">
                You'll be paid ₦{Number(cropPrice.price).toLocaleString()} per {cropPrice.unit} sold
              </p>
            )}
          </div>
          <div>
            <label>Nearest EPHAAG unit</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              placeholder="e.g. Luka Unit, Gboko"
            />
          </div>
          <div className="sm:col-span-2 flex gap-3">
            <button className="btn-outline flex-1" type="button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button
              className="btn-primary flex-1"
              type="submit"
              disabled={submitting || !selectedBalance || Number(quantity) > (selectedBalance?.remaining ?? 0)}
            >
              {submitting ? "Listing…" : "List product"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {!loading && products.length > 0 && (
        <div className="mt-4 space-y-2">
          {products.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2 text-sm">
              <div>
                <p className="text-ink-900">{p.crop} — {p.quantity} {p.unit}</p>
                <p className="text-xs text-ink-600">{p.address}</p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    p.status === "available" ? "bg-harvest-50 text-harvest-600" : "bg-canopy-50 text-canopy-800"
                  }`}
                >
                  {p.status === "available" ? "In progress" : "Settled"}
                </span>
                <button onClick={() => handleToggleStatus(p)} className="text-xs text-canopy-800">
                  Mark {p.status === "available" ? "settled" : "in progress"}
                </button>
                <button onClick={() => handleDelete(p)} className="text-xs text-red-700">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
