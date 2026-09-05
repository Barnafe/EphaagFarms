import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { apiFetch, apiUpload, API_ORIGIN } from "../../api/client.js";

const statusStyles = {
  submitted: "bg-harvest-100 text-harvest-800",
  under_review: "bg-harvest-100 text-harvest-800",
  approved: "bg-canopy-50 text-canopy-800",
  rejected: "bg-red-100 text-red-700",
  converted: "bg-soil-100 text-ink-600",
};

const statusMessage = {
  submitted: "Sent to Admin's Requests inbox — awaiting review",
  under_review: "Sent to Admin's Requests inbox — awaiting review",
  approved: "Approved by admin",
  rejected: "Rejected by admin",
  converted: "Approved — work order created",
};

const emptyForm = { title: "", description: "", location: "", priority: "medium", assetId: "" };

// Step 1 of the workflow: report a fault. Approving/rejecting the report
// no longer happens here — every submission is mirrored into Admin's
// generic Requests inbox (see maintenanceController.createRequest) for a
// different admin to open, review the photo, and decide. This panel is
// now report + read-only status tracking.
export default function RequestsPanel() {
  const [requests, setRequests] = useState([]);
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef(null);

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

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function resetForm() {
    setForm(emptyForm);
    setPhoto(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleConvert(id) {
    try {
      await apiFetch(`/maintenance/requests/${id}/convert`, { method: "POST", body: {} });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("title", form.title);
      if (form.description) body.append("description", form.description);
      if (form.location) body.append("location", form.location);
      body.append("priority", form.priority);
      if (form.assetId) body.append("assetId", form.assetId);
      if (photo) body.append("photo", photo);
      await apiUpload("/maintenance/requests", body);
      resetForm();
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
        <p className="text-sm text-ink-600">Problems reported — routed to Admin's Requests inbox for review</p>
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
          <input className="sm:col-span-2" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location" />

          <div className="sm:col-span-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoChange}
              className="hidden"
              id="maintenance-request-photo"
            />
            <label
              htmlFor="maintenance-request-photo"
              className="btn-outline inline-flex cursor-pointer items-center gap-2"
            >
              <Camera size={16} />
              {photo ? "Retake / change proof photo" : "Upload proof"}
            </label>
            {photoPreview && (
              <img src={photoPreview} alt="Proof preview" className="mt-2 h-28 w-28 rounded-card border border-soil-200 object-cover" />
            )}
          </div>

          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button>
            <button className="btn-outline" type="button" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {requests.length === 0 && <p className="text-sm text-ink-600">No requests yet.</p>}
        {requests.map((r) => (
          <div key={r.id} className="rounded-card border border-soil-200 px-3 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex gap-3">
                {r.photo_url && (
                  <img
                    src={`${API_ORIGIN}/uploads/photos/${r.photo_url}`}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-card border border-soil-200 object-cover"
                  />
                )}
                <div>
                  <p className="font-medium text-ink-900">{r.title}</p>
                  <p className="text-xs text-ink-600">
                    {r.reference} · {r.asset_name || "No asset"} · {r.priority} · reported by {r.reported_by_name || "—"}
                  </p>
                  {r.description && <p className="mt-1 text-sm text-ink-700">{r.description}</p>}
                  <p className="mt-1 text-xs text-ink-600">{statusMessage[r.status]}</p>
                  {r.review_note && <p className="mt-1 text-xs text-ink-600">Note: {r.review_note}</p>}
                  {r.status === "approved" && (
                    <button className="btn-primary mt-2" type="button" onClick={() => handleConvert(r.id)}>
                      Create work order
                    </button>
                  )}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${statusStyles[r.status]}`}>{r.status.replace("_", " ")}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
