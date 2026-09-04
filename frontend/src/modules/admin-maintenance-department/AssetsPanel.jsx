import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const statusStyles = {
  good: "bg-canopy-50 text-canopy-800",
  due: "bg-harvest-100 text-harvest-800",
  in_repair: "bg-clay-100 text-clay-700",
  retired: "bg-soil-100 text-ink-600",
};

const emptyForm = { name: "", assetType: "", location: "", serialNumber: "", department: "", notes: "" };

export default function AssetsPanel() {
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const { assets } = await apiFetch("/maintenance/assets");
      setAssets(assets);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  }

  function startEdit(a) {
    setForm({
      name: a.name,
      assetType: a.asset_type,
      location: a.location || "",
      serialNumber: a.serial_number || "",
      department: a.department || "",
      notes: a.notes || "",
    });
    setEditingId(a.id);
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.assetType.trim()) return;
    setBusy(true);
    try {
      if (editingId) await apiFetch(`/maintenance/assets/${editingId}`, { method: "PATCH", body: form });
      else await apiFetch("/maintenance/assets", { method: "POST", body: form });
      setShowForm(false);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogService(id) {
    try {
      await apiFetch(`/maintenance/assets/${id}/log-service`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">Assets & equipment the department maintains</p>
        <button className="btn-outline" type="button" onClick={startCreate}>
          + Add asset
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-3 space-y-2">
        {assets.length === 0 && <p className="text-sm text-ink-600">No assets recorded yet.</p>}
        {assets.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
            <div>
              <p className="font-medium text-ink-900">{a.name}</p>
              <p className="text-xs text-ink-600">
                {a.asset_type} · {a.location || "No location set"} · Last serviced {a.last_serviced || "never"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-1 text-xs ${statusStyles[a.status] || statusStyles.good}`}>
                {a.status.replace("_", " ")}
              </span>
              <button className="text-xs text-ink-600 underline" type="button" onClick={() => startEdit(a)}>
                Edit
              </button>
              <button className="btn-outline" type="button" onClick={() => handleLogService(a.id)}>
                Log service
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Asset name" required />
          <input value={form.assetType} onChange={(e) => setForm({ ...form, assetType: e.target.value })} placeholder="Type, e.g. Generator" required />
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location" />
          <input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} placeholder="Serial number" />
          <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Owning department" />
          <input
            className="sm:col-span-3"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notes"
          />
          <div className="flex gap-2 sm:col-span-3">
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "Saving…" : editingId ? "Save changes" : "Add asset"}
            </button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
