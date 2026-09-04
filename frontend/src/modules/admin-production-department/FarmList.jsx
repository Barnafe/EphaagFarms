import { useState } from "react";

const statusStyles = {
  active: "bg-canopy-50 text-canopy-800",
  fallow: "bg-soil-100 text-ink-600",
};

const emptyForm = { name: "", state: "", crop: "", sizeHectares: "", status: "active" };

export default function FarmList({ farms, onCreate, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function startCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
    setError("");
  }

  function startEdit(farm) {
    setForm({
      name: farm.name,
      state: farm.state || "",
      crop: farm.crop || "",
      sizeHectares: farm.size_hectares ?? "",
      status: farm.status,
    });
    setEditingId(farm.id);
    setShowForm(true);
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    setError("");
    try {
      const body = {
        name: form.name.trim(),
        state: form.state.trim() || null,
        crop: form.crop.trim() || null,
        sizeHectares: form.sizeHectares === "" ? null : Number(form.sizeHectares),
        status: form.status,
      };
      if (editingId) await onUpdate(editingId, body);
      else await onCreate(body);
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(farm) {
    if (!confirm(`Delete "${farm.name}"? This only works if it has no harvest records.`)) return;
    try {
      await onDelete(farm.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">Company-owned farms</p>
        <button className="btn-outline" type="button" onClick={startCreate}>
          + Add farm
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {farms.length === 0 && <p className="text-sm text-ink-600">No farms recorded yet.</p>}
        {farms.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
            <div>
              <p className="font-medium text-ink-900">{f.name}</p>
              <p className="text-xs text-ink-600">
                {f.crop || "—"} · {f.size_hectares ? `${f.size_hectares} ha` : "—"} · {f.state || "—"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[f.status]}`}>{f.status}</span>
              <button className="text-xs text-ink-600 underline" type="button" onClick={() => startEdit(f)}>
                Edit
              </button>
              <button className="text-xs text-red-700 underline" type="button" onClick={() => handleDelete(f)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-5">
          <input
            className="sm:col-span-2"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Farm name, e.g. Ephaag Farm — Kaduna"
            required
          />
          <input
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
            placeholder="State"
          />
          <input
            value={form.crop}
            onChange={(e) => setForm({ ...form, crop: e.target.value })}
            placeholder="Main crop"
          />
          <input
            type="number"
            min="0"
            value={form.sizeHectares}
            onChange={(e) => setForm({ ...form, sizeHectares: e.target.value })}
            placeholder="Size (ha)"
          />
          <select
            className="sm:col-span-2"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option value="active">Active</option>
            <option value="fallow">Fallow</option>
          </select>
          <div className="flex gap-2 sm:col-span-3">
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : editingId ? "Save changes" : "Add farm"}
            </button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
