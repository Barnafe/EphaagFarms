import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";

const statusStyles = {
  submitted: "bg-harvest-100 text-harvest-800",
  under_review: "bg-harvest-100 text-harvest-800",
  approved: "bg-canopy-50 text-canopy-800",
  rejected: "bg-red-100 text-red-700",
  converted: "bg-soil-100 text-ink-600",
};

const emptyForm = { title: "", description: "", location: "", priority: "medium", assetId: "", reporterName: "", reporterDepartment: "" };

export default function RequestsPanel() {
  const [requests, setRequests] = useState([]);
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [{ requests }, { assets }] = await Promise.all([
        apiFetch("/maintenance/requests"),
        apiFetch("/maintenance/assets"),
      ]);
      setRequests(requests);
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
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      await apiFetch("/maintenance/requests", { method: "POST", body: { ...form, assetId: form.assetId || null } });
      setForm(emptyForm);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReview(id, decision) {
    const note = decision === "rejected" ? prompt("Reason for rejecting (optional):") || "" : "";
    try {
      await apiFetch(`/maintenance/requests/${id}/review`, { method: "POST", body: { decision, note } });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleConvert(id) {
    try {
      await apiFetch(`/maintenance/requests/${id}/convert`, { method: "POST", body: {} });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-600">Problems reported, awaiting supervisor review</p>
        <button className="btn-outline" type="button" onClick={() => setShowForm((v) => !v)}>
          + Report a problem
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="field mt-4 grid gap-3 rounded-card border border-soil-200 p-3 sm:grid-cols-2">
          <input className="sm:col-span-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="What's wrong?" required />
          <textarea className="sm:col-span-2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={2} />
          <select value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })}>
            <option value="">No specific asset</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location" />
          <input value={form.reporterName} onChange={(e) => setForm({ ...form, reporterName: e.target.value })} placeholder="Reported on behalf of (optional)" />
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button>
            <button className="btn-outline" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {requests.length === 0 && <p className="text-sm text-ink-600">No requests yet.</p>}
        {requests.map((r) => (
          <div key={r.id} className="rounded-card border border-soil-200 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-ink-900">{r.title}</p>
                <p className="text-xs text-ink-600">
                  {r.reference} · {r.asset_name || "No asset"} · {r.priority} · reported by {r.reporter_name || r.reported_by_name || "—"}
                </p>
                {r.description && <p className="mt-1 text-sm text-ink-700">{r.description}</p>}
                {r.review_note && <p className="mt-1 text-xs text-ink-600">Note: {r.review_note}</p>}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${statusStyles[r.status]}`}>{r.status.replace("_", " ")}</span>
            </div>
            <div className="mt-2 flex gap-2">
              {["submitted", "under_review"].includes(r.status) && (
                <>
                  <button className="btn-primary" type="button" onClick={() => handleReview(r.id, "approved")}>Approve</button>
                  <button className="btn-outline" type="button" onClick={() => handleReview(r.id, "rejected")}>Reject</button>
                </>
              )}
              {r.status === "approved" && (
                <button className="btn-primary" type="button" onClick={() => handleConvert(r.id)}>Create work order</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
