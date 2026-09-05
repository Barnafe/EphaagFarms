import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, GraduationCap, BookOpen, Handshake, User } from "lucide-react";
import { apiFetch, apiUpload, apiDownload } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import DashboardShell from "../../components/DashboardShell.jsx";
import ActingAsBanner from "../../components/ActingAsBanner.jsx";
import AccountProfileCard from "../../components/AccountProfileCard.jsx";

// TRC — Training, Research & Consultancy. Restored 2026-09-05 to its
// full three-part scope after a 2026-09-02 round had narrowed the whole
// department to training-courses-only under the name "Seminal". That
// narrowing was only ever meant for the farmer-facing tab inside
// Farmer's Room (which keeps a "Seminar" label and stays courses-only
// on purpose) — this admin department is the real thing, with all
// three functions.

const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "training", label: "Training", icon: GraduationCap },
  { key: "research", label: "Research", icon: BookOpen },
  { key: "consultancy", label: "Consultancy", icon: Handshake },
  { key: "profile", label: "Profile", icon: User },
];

export default function TrcDepartment() {
  const { session } = useAuth();
  const user = session?.user;

  const [tab, setTab] = useState("dashboard");
  const [error, setError] = useState(null);

  // Training
  const [courses, setCourses] = useState([]);
  const [submittingCourse, setSubmittingCourse] = useState(false);
  const [courseTitle, setCourseTitle] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [onlineLink, setOnlineLink] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [material, setMaterial] = useState(null);

  // Research
  const [research, setResearch] = useState([]);
  const [submittingResearch, setSubmittingResearch] = useState(false);
  const [researchTitle, setResearchTitle] = useState("");
  const [researchSummary, setResearchSummary] = useState("");

  // Consultancy
  const [offerings, setOfferings] = useState([]);
  const [requests, setRequests] = useState([]);
  const [submittingOffering, setSubmittingOffering] = useState(false);
  const [offeringTitle, setOfferingTitle] = useState("");
  const [offeringDescription, setOfferingDescription] = useState("");

  const loadCourses = useCallback(async () => {
    try {
      const { courses: c } = await apiFetch("/rtc/admin/courses");
      setCourses(c);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadResearch = useCallback(async () => {
    try {
      const { research: r } = await apiFetch("/rtc/admin/research");
      setResearch(r);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadConsultancy = useCallback(async () => {
    try {
      const [{ offerings: o }, { requests: r }] = await Promise.all([
        apiFetch("/rtc/admin/consultancy/offerings"),
        apiFetch("/rtc/admin/consultancy/requests"),
      ]);
      setOfferings(o);
      setRequests(r);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (tab === "training") loadCourses();
    if (tab === "research") loadResearch();
    if (tab === "consultancy") loadConsultancy();
  }, [tab, loadCourses, loadResearch, loadConsultancy]);

  async function handleSubmitCourse(e) {
    e.preventDefault();
    if (!courseTitle) return;
    setSubmittingCourse(true);
    try {
      const formData = new FormData();
      formData.append("title", courseTitle);
      if (courseDescription) formData.append("description", courseDescription);
      if (onlineLink) formData.append("onlineLink", onlineLink);
      if (scheduledAt) formData.append("scheduledAt", scheduledAt);
      if (material) formData.append("material", material);

      await apiUpload("/rtc/admin/courses", formData);
      setCourseTitle("");
      setCourseDescription("");
      setOnlineLink("");
      setScheduledAt("");
      setMaterial(null);
      await loadCourses();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingCourse(false);
    }
  }

  async function handleApproveCourse(id) {
    try {
      await apiFetch(`/rtc/admin/courses/${id}/approve`, { method: "POST" });
      await loadCourses();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDownloadMaterial(id, title) {
    try {
      await apiDownload(`/rtc/courses/${id}/material`, title);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSubmitResearch(e) {
    e.preventDefault();
    if (!researchTitle) return;
    setSubmittingResearch(true);
    try {
      await apiFetch("/rtc/admin/research", {
        method: "POST",
        body: { title: researchTitle, summary: researchSummary || undefined },
      });
      setResearchTitle("");
      setResearchSummary("");
      await loadResearch();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingResearch(false);
    }
  }

  async function handleDeleteResearch(id) {
    try {
      await apiFetch(`/rtc/admin/research/${id}`, { method: "DELETE" });
      await loadResearch();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSubmitOffering(e) {
    e.preventDefault();
    if (!offeringTitle) return;
    setSubmittingOffering(true);
    try {
      await apiFetch("/rtc/admin/consultancy/offerings", {
        method: "POST",
        body: { title: offeringTitle, description: offeringDescription || undefined },
      });
      setOfferingTitle("");
      setOfferingDescription("");
      await loadConsultancy();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingOffering(false);
    }
  }

  async function handleDeleteOffering(id) {
    try {
      await apiFetch(`/rtc/admin/consultancy/offerings/${id}`, { method: "DELETE" });
      await loadConsultancy();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleUpdateRequestStatus(id, status) {
    try {
      await apiFetch(`/rtc/admin/consultancy/requests/${id}/status`, {
        method: "POST",
        body: { status },
      });
      await loadConsultancy();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!user) return null;

  return (
    <DashboardShell items={items} activeKey={tab} onSelect={setTab}>
      <ActingAsBanner />

      {error && (
        <div className="card mb-4 border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {tab === "dashboard" && (
        <div className="max-w-4xl space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-canopy-300">Admin department</p>
            <h1 className="text-xl font-medium text-white">TRC — Training, Research & Consultancy</h1>
            <p className="mt-1 text-sm text-canopy-100">
              Free to members. Use the sidebar to open Training, Research, or Consultancy.
            </p>
          </div>
        </div>
      )}

      {tab === "training" && (
        <div className="max-w-4xl space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-canopy-300">TRC — Training</p>
            <h1 className="text-xl font-medium text-white">Training courses</h1>
            <p className="mt-1 text-sm text-canopy-100">
              Upload, attach materials, and approve — this is also exactly what appears in a farmer's
              "Seminar" tab once approved.
            </p>
          </div>

          <div className="card">
            <p className="text-sm text-ink-600">Upload a training course</p>
            <form onSubmit={handleSubmitCourse} className="field mt-3 space-y-2">
              <input value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} placeholder="Course title" />
              <textarea
                rows={2}
                value={courseDescription}
                onChange={(e) => setCourseDescription(e.target.value)}
                placeholder="Description"
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  value={onlineLink}
                  onChange={(e) => setOnlineLink(e.target.value)}
                  placeholder="Online hosting link (optional)"
                />
                <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-ink-600">Materials (optional — PDF, Word, PowerPoint, or image)</label>
                <input type="file" onChange={(e) => setMaterial(e.target.files?.[0] || null)} />
              </div>
              <button className="btn-primary" type="submit" disabled={submittingCourse}>
                {submittingCourse ? "Uploading…" : "Upload course"}
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
                          onClick={() => handleDownloadMaterial(c.id, c.title)}
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
                      <button type="button" className="btn-primary shrink-0" onClick={() => handleApproveCourse(c.id)}>
                        Approve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "research" && (
        <div className="max-w-4xl space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-canopy-300">TRC — Research</p>
            <h1 className="text-xl font-medium text-white">Research write-ups</h1>
            <p className="mt-1 text-sm text-canopy-100">Company-authored, published immediately — no approval gate.</p>
          </div>

          <div className="card">
            <p className="text-sm text-ink-600">Publish a research item</p>
            <form onSubmit={handleSubmitResearch} className="field mt-3 space-y-2">
              <input value={researchTitle} onChange={(e) => setResearchTitle(e.target.value)} placeholder="Title" />
              <textarea
                rows={3}
                value={researchSummary}
                onChange={(e) => setResearchSummary(e.target.value)}
                placeholder="Summary"
              />
              <button className="btn-primary" type="submit" disabled={submittingResearch}>
                {submittingResearch ? "Publishing…" : "Publish"}
              </button>
            </form>
          </div>

          <div className="card">
            <p className="text-sm text-ink-600">Published research</p>
            {research.length === 0 && <p className="mt-2 text-sm text-ink-600">Nothing published yet.</p>}
            <div className="mt-3 space-y-2">
              {research.map((r) => (
                <div key={r.id} className="rounded-card border border-soil-200 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink-900">{r.title}</p>
                      {r.summary && <p className="text-sm text-ink-600">{r.summary}</p>}
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-red-700 underline"
                      onClick={() => handleDeleteResearch(r.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "consultancy" && (
        <div className="max-w-4xl space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-canopy-300">TRC — Consultancy</p>
            <h1 className="text-xl font-medium text-white">Consultancy offerings & requests</h1>
            <p className="mt-1 text-sm text-canopy-100">
              Publish what members can book, then track incoming requests through to completion.
            </p>
          </div>

          <div className="card">
            <p className="text-sm text-ink-600">Publish an offering</p>
            <form onSubmit={handleSubmitOffering} className="field mt-3 space-y-2">
              <input value={offeringTitle} onChange={(e) => setOfferingTitle(e.target.value)} placeholder="Title" />
              <textarea
                rows={2}
                value={offeringDescription}
                onChange={(e) => setOfferingDescription(e.target.value)}
                placeholder="Description"
              />
              <button className="btn-primary" type="submit" disabled={submittingOffering}>
                {submittingOffering ? "Publishing…" : "Publish offering"}
              </button>
            </form>
          </div>

          <div className="card">
            <p className="text-sm text-ink-600">Offerings</p>
            {offerings.length === 0 && <p className="mt-2 text-sm text-ink-600">Nothing published yet.</p>}
            <div className="mt-3 space-y-2">
              {offerings.map((o) => (
                <div key={o.id} className="rounded-card border border-soil-200 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink-900">{o.title}</p>
                      {o.description && <p className="text-sm text-ink-600">{o.description}</p>}
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-xs text-red-700 underline"
                      onClick={() => handleDeleteOffering(o.id)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <p className="text-sm text-ink-600">Requests</p>
            {requests.length === 0 && <p className="mt-2 text-sm text-ink-600">No requests yet.</p>}
            <div className="mt-3 space-y-2">
              {requests.map((r) => (
                <div key={r.id} className="rounded-card border border-soil-200 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink-900">
                        {r.userName} — {r.offeringTitle}
                      </p>
                      {r.message && <p className="text-sm text-ink-600">{r.message}</p>}
                      <p className="mt-1 text-xs text-ink-600">Status: {r.status}</p>
                    </div>
                    {r.status !== "completed" && (
                      <div className="flex shrink-0 gap-2">
                        {r.status === "pending" && (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => handleUpdateRequestStatus(r.id, "scheduled")}
                          >
                            Mark scheduled
                          </button>
                        )}
                        {r.status === "scheduled" && (
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={() => handleUpdateRequestStatus(r.id, "completed")}
                          >
                            Mark completed
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "profile" && (
        <div className="max-w-3xl">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wide text-canopy-300">TRC</p>
            <h1 className="text-xl font-medium text-white">Profile</h1>
          </div>
          <AccountProfileCard user={user} extraFields={[{ label: "Role", value: "TRC HOD" }]} />
        </div>
      )}
    </DashboardShell>
  );
}
