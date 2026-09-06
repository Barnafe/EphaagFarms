import { useCallback, useEffect, useRef, useState } from "react";
import { PackagePlus, ImagePlus, Pencil, Trash2, X } from "lucide-react";
import { apiFetch, apiUpload, API_ORIGIN } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";

const CROP_CATEGORIES = ["Grains", "Tubers", "Vegetables", "Other"];
const LIVESTOCK_CATEGORIES = ["Goat", "Chicken", "Cattle", "Sheep", "Pig", "Turkey", "Other Livestock"];

// Same fixed vocabulary as farmer_products/farmer_declarations' `unit`
// CHECK constraint (see backend/src/db/migrations/001_init.sql) — one
// consistent set of units app-wide, whether a farmer is listing or an
// admin is cataloging. A dropdown, not free text, so there's no risk of
// "bag" vs "bags" vs "Bag" drifting apart across items. Crops only —
// livestock doesn't use a measured unit at all (see below).
const UNITS = ["kg", "tons", "bags", "tubers", "crates", "baskets"];

const EMPTY_FORM = {
  itemType: "crop",
  crop: "",
  unit: "",
  ageDescription: "",
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
// photo upload — admin snaps or picks an actual picture of the item, same
// as any real shopping app.
//
// 2026-09-05 spec: crops vs livestock. A checkmark toggle switches the form
// between the two — crops keep the existing measured-unit dropdown +
// grains/tubers/vegetables/other categories; livestock swaps the unit
// dropdown for a free-text age/description field (since a goat's price
// depends on how old it is, not a measured quantity) and swaps in
// livestock-specific categories. Every row in "Already in the catalog" now
// also has its own Edit and Delete actions (previously only a photo could
// be changed after creation).
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

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

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

  function setItemType(itemType) {
    setForm((prev) => ({
      ...prev,
      itemType,
      // Reset the fields that mean something different (or nothing) under
      // the other type, so a stale unit doesn't silently linger under
      // livestock, or a stale category from one list under the other.
      unit: "",
      ageDescription: "",
      category: itemType === "livestock" ? LIVESTOCK_CATEGORIES[0] : CROP_CATEGORIES[0],
    }));
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

    const isLivestock = form.itemType === "livestock";
    if (!form.crop.trim() || form.buyPrice === "" || form.sellPrice === "") {
      setError("Product name, buy price, and sell price are all required.");
      return;
    }
    if (isLivestock && !form.ageDescription.trim()) {
      setError('Age/description is required for livestock (e.g. "1 year old", "3 months broiler").');
      return;
    }
    if (!isLivestock && !form.unit) {
      setError("Unit is required.");
      return;
    }

    setSubmitting(true);
    try {
      const body = new FormData();
      body.append("crop", form.crop.trim());
      body.append("itemType", form.itemType);
      if (isLivestock) {
        body.append("ageDescription", form.ageDescription.trim());
      } else {
        body.append("unit", form.unit);
      }
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

  function startEdit(p) {
    setError(null);
    setEditingId(p.id);
    setEditForm({
      itemType: p.item_type || "crop",
      crop: p.crop,
      unit: p.unit || "",
      ageDescription: p.age_description || "",
      buyPrice: String(p.buy_price),
      sellPrice: String(p.sell_price),
      category: p.category || (p.item_type === "livestock" ? LIVESTOCK_CATEGORIES[0] : CROP_CATEGORIES[0]),
      description: p.description || "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  function setEditItemType(itemType) {
    setEditForm((prev) => ({
      ...prev,
      itemType,
      unit: "",
      ageDescription: "",
      category: itemType === "livestock" ? LIVESTOCK_CATEGORIES[0] : CROP_CATEGORIES[0],
    }));
  }

  function setEdit(field, value) {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSaveEdit(id) {
    setError(null);
    const isLivestock = editForm.itemType === "livestock";
    if (!editForm.crop.trim() || editForm.buyPrice === "" || editForm.sellPrice === "") {
      setError("Product name, buy price, and sell price are all required.");
      return;
    }
    if (isLivestock && !editForm.ageDescription.trim()) {
      setError("Age/description is required for livestock.");
      return;
    }
    if (!isLivestock && !editForm.unit) {
      setError("Unit is required.");
      return;
    }

    setSavingEdit(true);
    try {
      await apiFetch(`/finance/prices/${id}`, {
        method: "PATCH",
        body: {
          crop: editForm.crop.trim(),
          itemType: editForm.itemType,
          unit: isLivestock ? undefined : editForm.unit,
          ageDescription: isLivestock ? editForm.ageDescription.trim() : null,
          buyPrice: Number(editForm.buyPrice),
          sellPrice: Number(editForm.sellPrice),
          category: editForm.category,
          description: editForm.description.trim(),
        },
      });
      cancelEdit();
      await loadCatalog();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(p) {
    if (!window.confirm(`Delete "${p.crop}" from the catalog? This can't be undone.`)) return;
    setError(null);
    setDeletingId(p.id);
    try {
      await apiFetch(`/finance/prices/${p.id}`, { method: "DELETE" });
      await loadCatalog();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  const categoryOptions = form.itemType === "livestock" ? LIVESTOCK_CATEGORIES : CROP_CATEGORIES;

  return (
    <AdminDashboardShell>
      <div className="max-w-4xl">
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wide text-canopy-300">Admin</p>
          <h1 className="text-xl font-medium text-white">Add catalog</h1>
          <p className="mt-1 text-sm text-canopy-100">
            Already listed? Use <span className="font-medium text-white">Add Price</span> instead.
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
            <label>What are you listing?</label>
            <div className="mt-1 flex gap-2">
              <button
                type="button"
                onClick={() => setItemType("crop")}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  form.itemType === "crop"
                    ? "border-canopy-600 bg-canopy-600 text-white"
                    : "border-soil-200 text-ink-700 hover:border-canopy-400"
                }`}
              >
                🌾 Crop / produce
              </button>
              <button
                type="button"
                onClick={() => setItemType("livestock")}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  form.itemType === "livestock"
                    ? "border-canopy-600 bg-canopy-600 text-white"
                    : "border-soil-200 text-ink-700 hover:border-canopy-400"
                }`}
              >
                🐐 Livestock
              </button>
            </div>
          </div>

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
              <label>Product name</label>
              <input
                type="text"
                value={form.crop}
                onChange={(e) => set("crop", e.target.value)}
                placeholder={form.itemType === "livestock" ? "e.g. Goat" : "e.g. Sweet Potato"}
              />
            </div>
            {form.itemType === "livestock" ? (
              <div>
                <label>Age / description</label>
                <input
                  type="text"
                  value={form.ageDescription}
                  onChange={(e) => set("ageDescription", e.target.value)}
                  placeholder="e.g. 1 year old, 3 months broiler"
                />
              </div>
            ) : (
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
            )}
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
                {categoryOptions.map((c) => (
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
                className="hidden"
                onChange={handleRowImageChange}
              />
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-ink-600">
                    <th className="pb-2 pr-4">Photo</th>
                    <th className="pb-2 pr-4">Product</th>
                    <th className="pb-2 pr-4">Unit / age</th>
                    <th className="pb-2 pr-4">Category</th>
                    <th className="pb-2 pr-4">Buy price</th>
                    <th className="pb-2 pr-4">Sell price</th>
                    <th className="pb-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map((p) =>
                    editingId === p.id ? (
                      <tr key={p.id} className="border-t border-soil-200 bg-soil-50/60">
                        <td colSpan={7} className="py-3 pr-4">
                          <div className="field space-y-3">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setEditItemType("crop")}
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                                  editForm.itemType === "crop"
                                    ? "border-canopy-600 bg-canopy-600 text-white"
                                    : "border-soil-200 text-ink-700"
                                }`}
                              >
                                🌾 Crop
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditItemType("livestock")}
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                                  editForm.itemType === "livestock"
                                    ? "border-canopy-600 bg-canopy-600 text-white"
                                    : "border-soil-200 text-ink-700"
                                }`}
                              >
                                🐐 Livestock
                              </button>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <div>
                                <label className="text-xs">Product name</label>
                                <input
                                  type="text"
                                  value={editForm.crop}
                                  onChange={(e) => setEdit("crop", e.target.value)}
                                />
                              </div>
                              {editForm.itemType === "livestock" ? (
                                <div>
                                  <label className="text-xs">Age / description</label>
                                  <input
                                    type="text"
                                    value={editForm.ageDescription}
                                    onChange={(e) => setEdit("ageDescription", e.target.value)}
                                    placeholder="e.g. 1 year old"
                                  />
                                </div>
                              ) : (
                                <div>
                                  <label className="text-xs">Unit</label>
                                  <select value={editForm.unit} onChange={(e) => setEdit("unit", e.target.value)}>
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
                              )}
                              <div>
                                <label className="text-xs">Category</label>
                                <select value={editForm.category} onChange={(e) => setEdit("category", e.target.value)}>
                                  {(editForm.itemType === "livestock" ? LIVESTOCK_CATEGORIES : CROP_CATEGORIES).map(
                                    (c) => (
                                      <option key={c} value={c}>
                                        {c}
                                      </option>
                                    )
                                  )}
                                </select>
                              </div>
                              <div>
                                <label className="text-xs">Buy price (₦)</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={editForm.buyPrice}
                                  onChange={(e) => setEdit("buyPrice", e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="text-xs">Sell price (₦)</label>
                                <input
                                  type="number"
                                  min="0"
                                  value={editForm.sellPrice}
                                  onChange={(e) => setEdit("sellPrice", e.target.value)}
                                />
                              </div>
                              <div className="sm:col-span-2 lg:col-span-3">
                                <label className="text-xs">Description (optional)</label>
                                <input
                                  type="text"
                                  value={editForm.description}
                                  onChange={(e) => setEdit("description", e.target.value)}
                                />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="btn-primary text-sm"
                                disabled={savingEdit}
                                onClick={() => handleSaveEdit(p.id)}
                              >
                                {savingEdit ? "Saving…" : "Save changes"}
                              </button>
                              <button type="button" className="btn-outline text-sm" onClick={cancelEdit}>
                                <X size={14} className="mr-1 inline" />
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
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
                              p.icon || (p.item_type === "livestock" ? "🐐" : "🧺")
                            )}
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-ink-900">{p.crop}</td>
                        <td className="py-2 pr-4 text-ink-700">
                          {p.item_type === "livestock" ? p.age_description : p.unit}
                        </td>
                        <td className="py-2 pr-4 text-ink-700">{p.category || "Other"}</td>
                        <td className="py-2 pr-4 text-ink-700">₦{Number(p.buy_price).toLocaleString()}</td>
                        <td className="py-2 pr-4 text-ink-700">₦{Number(p.sell_price).toLocaleString()}</td>
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              className="text-xs text-canopy-800 hover:underline disabled:opacity-50"
                              disabled={rowUploadingId === p.id}
                              onClick={() => triggerRowUpload(p.id)}
                            >
                              {rowUploadingId === p.id ? "Uploading…" : p.image_url ? "Change photo" : "Add photo"}
                            </button>
                            <button
                              type="button"
                              aria-label="Edit"
                              className="text-ink-600 hover:text-canopy-800"
                              onClick={() => startEdit(p)}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              aria-label="Delete"
                              disabled={deletingId === p.id}
                              className="text-ink-600 hover:text-clay-700 disabled:opacity-50"
                              onClick={() => handleDelete(p)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminDashboardShell>
  );
}
