import { useCallback, useEffect, useState } from "react";
import { PackagePlus } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";

const CATEGORIES = ["Grains", "Tubers", "Vegetables", "Other"];

// Same fixed vocabulary as farmer_products/farmer_declarations' `unit`
// CHECK constraint (see backend/src/db/migrations/001_init.sql) — one
// consistent set of units app-wide, whether a farmer is listing or an
// admin is cataloging. A dropdown, not free text, so there's no risk of
// "bag" vs "bags" vs "Bag" drifting apart across items.
const UNITS = ["kg", "tons", "bags", "tubers", "crates", "baskets"];

const EMPTY_FORM = {
  crop: "",
  unit: "",
  buyPrice: "",
  sellPrice: "",
  category: "Grains",
  description: "",
  icon: "",
};

// New feature (2026-09-03 spec) — there was previously no way to add a crop
// that didn't already exist in standard_prices; Finance's price editor could
// only ever edit one that was already there. This is the one place a new
// product enters the system — once created here it shows up automatically
// in the buyer's Product Catalog, the farmer's visible prices, and
// Procurement's price list, all of which read straight from standard_prices.
export default function AddCatalogPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const loadCatalog = useCallback(async () => {
    try {
      const { prices } = await apiFetch("/finance/prices");
      setCatalog(prices);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  function set(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!form.crop.trim() || !form.unit || form.buyPrice === "" || form.sellPrice === "") {
      setError("Crop name, unit, buy price, and sell price are all required.");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/finance/prices", {
        method: "POST",
        body: {
          crop: form.crop.trim(),
          unit: form.unit,
          buyPrice: Number(form.buyPrice),
          sellPrice: Number(form.sellPrice),
          category: form.category,
          description: form.description.trim() || undefined,
          icon: form.icon.trim() || undefined,
        },
      });
      setSuccess(`${form.crop.trim()} added to the catalog — it's already live in the buyer's Product Catalog.`);
      setForm(EMPTY_FORM);
      await loadCatalog();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminDashboardShell>
      <div className="max-w-4xl">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-canopy-300">Admin</p>
          <h1 className="text-xl font-medium text-white">Add catalog</h1>
          <p className="mt-1 text-sm text-canopy-100">
            Add a new crop or product the company will produce and sell. Once added, it appears
            automatically in the buyer's Product Catalog, the farmer's visible prices, and
            Procurement's price list — no separate publish step. To change the price of something
            already here, use <span className="font-medium text-white">Add Price</span> instead.
          </p>
        </div>

        {error && (
          <div className="card mb-4 border-red-200 bg-red-50">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {success && (
          <div className="card mb-4 border-canopy-300 bg-canopy-50">
            <p className="text-sm text-canopy-800">{success}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="card field space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label>Crop / product name</label>
              <input
                type="text"
                value={form.crop}
                onChange={(e) => set("crop", e.target.value)}
                placeholder="e.g. Sweet Potato"
              />
            </div>
            <div>
              <label>Unit</label>
              <select value={form.unit} onChange={(e) => set("unit", e.target.value)}>
                <option value="" disabled>
                  Select unit
                </option>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Buy price (₦) — paid to farmers</label>
              <input
                type="number"
                min="0"
                value={form.buyPrice}
                onChange={(e) => set("buyPrice", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label>Sell price (₦) — charged to buyers</label>
              <input
                type="number"
                min="0"
                value={form.sellPrice}
                onChange={(e) => set("sellPrice", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label>Category</label>
              <select value={form.category} onChange={(e) => set("category", e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Icon (optional emoji)</label>
              <input
                type="text"
                value={form.icon}
                onChange={(e) => set("icon", e.target.value)}
                placeholder="e.g. 🍠 (defaults by category if left blank)"
              />
            </div>
          </div>
          <div>
            <label>Description (optional — shown to buyers)</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Shown on the product card in the buyer's catalog. Leave blank for a generic description."
            />
          </div>
          <button className="btn-primary" type="submit" disabled={submitting}>
            <PackagePlus size={16} className="mr-1.5 inline" />
            {submitting ? "Adding…" : "Add to catalog"}
          </button>
        </form>

        <div className="mt-8">
          <p className="mb-2 text-sm font-medium text-white">Already in the catalog</p>
          {loading ? (
            <p className="text-sm text-canopy-100">Loading…</p>
          ) : catalog.length === 0 ? (
            <p className="text-sm text-canopy-100">Nothing added yet — the form above adds the first one.</p>
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-ink-600">
                    <th className="pb-2 pr-4">Crop</th>
                    <th className="pb-2 pr-4">Unit</th>
                    <th className="pb-2 pr-4">Category</th>
                    <th className="pb-2 pr-4">Buy price</th>
                    <th className="pb-2 pr-4">Sell price</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map((p) => (
                    <tr key={p.id} className="border-t border-soil-200">
                      <td className="py-2 pr-4 text-ink-900">
                        {p.icon ? `${p.icon} ` : ""}
                        {p.crop}
                      </td>
                      <td className="py-2 pr-4 text-ink-700">{p.unit}</td>
                      <td className="py-2 pr-4 text-ink-700">{p.category || "Other"}</td>
                      <td className="py-2 pr-4 text-ink-700">₦{Number(p.buy_price).toLocaleString()}</td>
                      <td className="py-2 pr-4 text-ink-700">₦{Number(p.sell_price).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminDashboardShell>
  );
}
