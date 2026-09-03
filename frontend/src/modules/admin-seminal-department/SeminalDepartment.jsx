import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiUpload, apiDownload } from "../../api/client.js";
import AdminDashboardShell from "../../components/AdminDashboardShell.jsx";

export default function SeminalDepartment() {
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [onlineLink, setOnlineLink] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [material, setMaterial] = useState(null);

  const load = useCallback(async () => {
    try {
      const { courses: c } = await apiFetch("/rtc/admin/courses");
      setCourses(c);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("title", title);
      if (description) formData.append("description", description);
      if (onlineLink) formData.append("onlineLink", onlineLink);
      if (scheduledAt) formData.append("scheduledAt", scheduledAt);
      if (material) formData.append("material", material);

      await apiUpload("/rtc/admin/courses", formData);
      setTitle("");
      setDescription("");
      setOnlineLink("");
      setScheduledAt("");
      setMaterial(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove(id) {
    try {
      await apiFetch(`/rtc/admin/courses/${id}/approve`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDownload(id, title) {
    try {
      await apiDownload(`/rtc/courses/${id}/material`, title);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AdminDashboardShell>
      <div className="max-w-4xl space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-canopy-300">Admin department</p>
          <h1 className="text-xl font-medium text-white">Seminal</h1>
          <p className="mt-1 text-sm text-canopy-100">
            Upload the next training course, attach materials and an online hosting link, then approve it —
            once approved, farmers see it and can attend, view materials, and mark it complete.
          </p>
        </div>

        {error && (
          <div className="card border-red-200 bg-red-50">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="card">
          <p className="text-sm text-ink-600">Upload a training course</p>
          <form onSubmit={handleSubmit} className="field mt-3 space-y-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course title" />
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={onlineLink}
                onChange={(e) => setOnlineLink(e.target.value)}
                placeholder="Online hosting link (optional)"
              />
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-ink-600">Materials (optional — PDF, Word, PowerPoint, or image)</label>
              <input type="file" onChange={(e) => setMaterial(e.target.files?.[0] || null)} />
            </div>
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Uploading…" : "Upload course"}
            </button>
          </form>
        </div>

        <div className="card">
          <p className="text-sm text-ink-600">All courses</p>
          {courses.length === 0 && <p className="mt-2 text-sm text-ink-600">Nothing uploaded yet.</p>}
          <div className="mt-3 space-y-2">
            {courses.map((c) => (
              <div key={c.id} className="rounded-card border border-soil-200 px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink-900">{c.title}</p>
                    {c.description && <p className="text-sm text-ink-600">{c.description}</p>}
                    {c.scheduledAt && (
                      <p className="mt-1 text-xs text-ink-600">
                        Scheduled {new Date(c.scheduledAt).toLocaleString()}
                      </p>
                    )}
                    {c.onlineLink && <p className="text-xs text-ink-600">Hosted at {c.onlineLink}</p>}
                    {c.hasMaterials && (
                      <button
                        type="button"
                        className="mt-1 text-xs text-canopy-800 underline"
                        onClick={() => handleDownload(c.id, c.title)}
                      >
                        Download materials
                      </button>
                    )}
                  </div>
                  {c.approved ? (
                    <span className="rounded-full bg-canopy-50 px-3 py-1 text-xs font-medium text-canopy-800">
                      Approved
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary shrink-0"
                      onClick={() => handleApprove(c.id)}
                    >
                      Approve
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminDashboardShell>
  );
}
