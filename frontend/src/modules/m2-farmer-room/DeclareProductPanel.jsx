import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";

const UNIT_OPTIONS = [
  { value: "kg", label: "Kilograms (kg)" },
  { value: "tons", label: "Tons" },
  { value: "bags", label: "Bags" },
  { value: "tubers", label: "Tubers" },
  { value: "crates", label: "Crates" },
  { value: "baskets", label: "Baskets" },
];

export default function DeclareProductPanel() {
  const { session } = useAuth();
  const registeredCrops = session?.user?.crops || [];

  const [declarations, setDeclarations] = useState([]);
  const [prices, setPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [crop, setCrop] = useState(registeredCrops[0] || "");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");

  const cropPrice = prices.find((p) => p.crop === crop);

  async function load() {
    setLoading(true);
    try {
      const [{ declarations }, { prices: pr }] = await Promise.all([
        apiFetch("/farmers/me/declarations"),
        apiFetch("/farmers/prices"),
      ]);
      setDeclarations(declarations);
      setPrices(pr);
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
    if (!crop) return;
    setError("");
    setSubmitting(true);
    try {
      await apiFetch("/farmers/me/declarations", {
        method: "POST",
        body: { crop, quantity: Number(quantity), unit },
      });
      setQuantity("");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink-600">Declare product</p>
          <p className="mt-1 text-xs text-ink-600">
            What you've harvested — for the record, whether or not you're selling it right now.
          </p>
        </div>
        {!showForm && (
          <button className="btn-outline" type="button" onClick={() => setShowForm(true)}>
            Declare new
          </button>
        )}
      </div>

      {registeredCrops.length === 0 && (
        <p className="mt-3 text-sm text-harvest-600">
          No products on your profile yet — add them from your Profile tab before declaring.
        </p>
      )}

      {showForm && registeredCrops.length > 0 && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 sm:grid-cols-3">
          <div>
            <label>Product</label>
            <select value={crop} onChange={(e) => setCrop(e.target.value)}>
              {registeredCrops.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            {cropPrice && (
              <p className="mt-1 text-xs text-canopy-800">
                You'll be paid ₦{Number(cropPrice.price).toLocaleString()} per {cropPrice.unit}
              </p>
            )}
          </div>
          <div>
            <label>Quantity</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              placeholder="e.g. 150"
            />
          </div>
          <div>
            <label>Unit</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-3 flex gap-3">
            <button className="btn-outline flex-1" type="button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button className="btn-primary flex-1" type="submit" disabled={submitting}>
              {submitting ? "Declaring…" : "Declare"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {!loading && declarations.length > 0 && (
        <div className="mt-4 space-y-2">
          {declarations.map((d) => (
            <div key={d.id} className="rounded-card border border-soil-200 px-3 py-2 text-sm">
              <p className="text-ink-900">{d.crop} — {d.quantity} {d.unit}</p>
              <p className="text-xs text-ink-600">
                {d.declaration_year} · {new Date(d.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
