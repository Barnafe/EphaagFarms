import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const resultStyles = {
  pass: "bg-canopy-50 text-canopy-800",
  fail: "bg-red-100 text-red-700",
  needs_attention: "bg-harvest-100 text-harvest-800",
};

const emptyForm = { assetId: "", inspectionType: "routine", result: "pass", notes: "" };

export default function InspectionsPanel() {
  const [inspections, setInspections] = useState([]);
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [{ inspections }, { assets }] = await Promise.all([
        apiFetch("/maintenance/inspections"),
        apiFetch("/maintenance/assets"),
      ]);
      setInspections(inspections);
      setAssets(assets);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.assetId) return;
    setBusy(true);
    try {
      await apiFetch("/maintenance/inspections", { method: "POST", body: form });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">Routine, safety, and post-repair checks (work-order inspections are logged from the order itself)</p>
        <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>+ Log routine inspection</button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-4">
          <select value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} required>
            <option value="">Select asset…</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select value={form.inspectionType} onChange={(e) => setForm({ ...form, inspectionType: e.target.value })}>
            <option value="routine">Routine</option>
            <option value="safety">Safety</option>
          </select>
          <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })}>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="needs_attention">Needs attention</option>
          </select>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" />
          <div className="flex gap-2 sm:col-span-4">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Log inspection"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {inspections.length === 0 && <p className="text-sm text-ink-600">No inspections logged yet.</p>}
        {inspections.map((i) => (
          <div key={i.id} className="flex items-center justify-between rounded-card border border-soil-200 px-3 py-2">
            <div>
              <p className="font-medium text-ink-900">{i.asset_name || "—"}</p>
              <p className="text-xs text-ink-600">
                {i.inspection_type.replace("_", " ")} · {i.inspected_by_name || "—"} · {new Date(i.inspected_at).toLocaleDateString()}
                {i.work_order_reference ? ` · ${i.work_order_reference}` : ""}
              </p>
              {i.notes && <p className="mt-1 text-sm text-ink-700">{i.notes}</p>}
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${resultStyles[i.result]}`}>{i.result.replace("_", " ")}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
