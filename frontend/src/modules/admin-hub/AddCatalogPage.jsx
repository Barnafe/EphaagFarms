import { useCallback, useEffect, useRef, useState } from "react";
import { PackagePlus, ImagePlus } from "lucide-react";
import { apiFetch, apiUpload, API_ORIGIN } from "../../api/client.js";
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
};

// New feature (2026-09-03 spec) — there was previously no way to add a crop
// that didn't already exist in standard_prices; Finance's price editor could
// only ever edit one that was already there. This is the one place a new
// product enters the system — once created here it shows up automatically
// in the buyer's Product Catalog, the farmer's visible prices, and
// Procurement's price list, all of which read straight from standard_prices.
//
// 2026-09-04: the old "type an emoji" icon field is replaced with a real
// photo upload — admin snaps or picks an actual picture of the item,
// same as any real shopping app, since a real product photo does more
// to draw a buyer in than a generic emoji tile. Items with no photo
// still fall back to an emoji icon (by category) so nothing already in
// the catalog looks broken.
export default function AddCatalogPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [rowUploadingId, setRowUploadingId] = useState(null);
  const rowFileInputRef = useRef(null);
  const [rowUploadTargetId, setRowUploadTargetId] = useState(null);

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

  function handleImagePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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
      const body = new FormData();
      body.append("crop", form.crop.trim());
      body.append("unit", form.unit);
      body.append("buyPrice", Number(form.buyPrice));
      body.append("sellPrice", Number(form.sellPrice));
      body.append("category", form.category);
      if (form.description.trim()) body.append("description", form.description.trim());
      if (imageFile) body.append("image", imageFile);

      await apiUpload("/finance/prices", body);
      setSuccess(`${form.crop.trim()} added to the catalog — it's already live in the buyer's Product Catalog.`);
      setForm(EMPTY_FORM);
      clearImage();
      await loadCatalog();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function triggerRowUpload(id) {
    setRowUploadTargetId(id);
    rowFileInputRef.current?.click();
  }

  async function handleRowImageChange(e) {
    const file = e.target.files?.[0];
    const id = rowUploadTargetId;
    if (!file || !id) return;
    setRowUploadingId(id);
    setError(null);
    try {
      const body = new FormData();
      body.append("image", file);
      await apiUpload(`/finance/prices/${id}/image`, body);
      await loadCatalog();
    } catch (err) {
      setError(err.message);
    } finally {
      setRowUploadingId(null);
      setRowUploadTargetId(null);
      if (rowFileInputRef.current) rowFileInputRef.current.value = "";
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
          <div>
            <label>Product photo (optional)</label>
            <div className="mt-1 flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-card border border-dashed border-soil-200 bg-soil-50 text-2xl">
                {imagePreview ? (
                  <img src={imagePreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-ink-600" />
                )}
              </div>
              <div>
                <button
                  type="button"
                  className="btn-outline text-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {imagePreview ? "Change photo" : "Snap or upload photo"}
                </button>
                {imagePreview && (
                  <button type="button" className="ml-2 text-sm text-clay-800" onClick={clearImage}>
                    Remove
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  className="hidden"
                  onChange={handleImagePick}
                />
                <p className="mt-1 text-xs text-ink-600">
                  Shown to buyers on the product card and detail page. Leave blank to fall back to a
                  generic icon by category.
                </p>
              </div>
            </div>
          </div>

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
              <input
                ref={rowFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={handleRowImageChange}
              />
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-ink-600">
                    <th className="pb-2 pr-4">Photo</th>
                    <th className="pb-2 pr-4">Crop</th>
                    <th className="pb-2 pr-4">Unit</th>
                    <th className="pb-2 pr-4">Category</th>
                    <th className="pb-2 pr-4">Buy price</th>
                    <th className="pb-2 pr-4">Sell price</th>
                    <th className="pb-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map((p) => (
                    <tr key={p.id} className="border-t border-soil-200">
                      <td className="py-2 pr-4">
                        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-card bg-soil-50 text-lg">
                          {p.image_url ? (
                            <img
                              src={`${API_ORIGIN}${p.image_url}`}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            p.icon || "🧺"
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-ink-900">{p.crop}</td>
                      <td className="py-2 pr-4 text-ink-700">{p.unit}</td>
                      <td className="py-2 pr-4 text-ink-700">{p.category || "Other"}</td>
                      <td className="py-2 pr-4 text-ink-700">₦{Number(p.buy_price).toLocaleString()}</td>
                      <td className="py-2 pr-4 text-ink-700">₦{Number(p.sell_price).toLocaleString()}</td>
                      <td className="py-2 pr-4">
                        <button
                          type="button"
                          className="text-xs text-canopy-800 hover:underline disabled:opacity-50"
                          disabled={rowUploadingId === p.id}
                          onClick={() => triggerRowUpload(p.id)}
                        >
                          {rowUploadingId === p.id ? "Uploading…" : p.image_url ? "Change photo" : "Add photo"}
                        </button>
                      </td>
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
