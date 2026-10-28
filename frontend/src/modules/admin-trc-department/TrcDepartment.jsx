import { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, GraduationCap, BookOpen, Handshake, FileCheck2, User, Users } from "lucide-react";
import { apiFetch, apiUpload, apiDownload } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { departmentRoleLabel } from "../../utils/departmentRole.js";
import DashboardShell from "../../components/DashboardShell.jsx";
import ActingAsBanner from "../../components/ActingAsBanner.jsx";
import AccountProfileCard from "../../components/AccountProfileCard.jsx";
import DeptDashboardCards from "../../components/DeptDashboardCards.jsx";
import DepartmentRequestsPanel from "../../components/DepartmentRequestsPanel.jsx";
import SectionStack from "../../components/SectionStack.jsx";
import CorpsCourseEditor from "./CorpsCourseEditor.jsx";
import CorpsPayments from "./CorpsPayments.jsx";
import CorpsProgress from "./CorpsProgress.jsx";
import CorpsBatches from "./CorpsBatches.jsx";
import CorpsMembers from "./CorpsMembers.jsx";

import useUrlState from "../../hooks/useUrlState.js";
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
  { key: "corps", label: "Corps", icon: Users, description: "NYSC corps member access-fee payments, the fee itself, and member progress." },
  { key: "research", label: "Research", icon: BookOpen },
  { key: "consultancy", label: "Consultancy", icon: Handshake },
  {
    key: "approvals",
    label: "Approval requests",
    icon: FileCheck2,
    description: "The general cross-department request/approval workflow (distinct from the consultancy booking requests under Consultancy).",
  },
  { key: "profile", label: "Profile", icon: User },
];

export default function TrcDepartment() {
  const { session } = useAuth();
  const user = session?.user;

  const [tab, setTab] = useUrlState("tab", "dashboard");
  const [corpsView, setCorpsView] = useUrlState("corps", "payments");
  const [error, setError] = useState(null);

  // Training
  const [courses, setCourses] = useState([]);
  const [submittingCourse, setSubmittingCourse] = useState(false);
  const [courseTitle, setCourseTitle] = useState("");
  const [courseDescription, setCourseDescription] = useState("");
  const [onlineLink, setOnlineLink] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [material, setMaterial] = useState(null);
  // Training has two audiences: "general" (farmers' free Seminar tab) and
  // "corps" (NYSC corps members). The admin picks one when creating a course.
  const [courseAudience, setCourseAudience] = useState("general");
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [editingCourse, setEditingCourse] = useState(null);

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
      formData.append("audience", courseAudience);
      if (courseDescription) formData.append("description", courseDescription);
      if (onlineLink) formData.append("onlineLink", onlineLink);
      if (scheduledAt) formData.append("scheduledAt", scheduledAt);
      if (material) formData.append("material", material);

      const { course: created } = await apiUpload("/rtc/admin/courses", formData);
      setCourseTitle("");
      setCourseDescription("");
      setOnlineLink("");
      setScheduledAt("");
      setMaterial(null);
      await loadCourses();
      // A corps course is empty until lessons + a quiz are added, so go
      // straight to its editor.
      if (created?.audience === "corps") setEditingCourse(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingCourse(false);
    }
  }

  async function handleApproveCourse(id) {
    try {
      try {
        await apiFetch(`/rtc/admin/courses/${id}/approve`, { method: "POST" });
      } catch (err) {
        // Going live adds to every member's total, so anyone with progress
        // sees their percentage drop. The server asks us to confirm first.
        if (err.code !== "APPROVAL_IMPACT") throw err;
        const ok = window.confirm(`${err.message}\n\nApprove this course anyway?`);
        if (!ok) return;
        await apiFetch(`/rtc/admin/courses/${id}/approve`, { method: "POST", body: { confirmImpact: true } });
      }
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
    <DashboardShell items={items} activeKey={tab} onSelect={setTab} exitTo="/admin">
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
              Farmer courses are free; corps members pay a one-time access fee (see Corps). Use the sidebar to open Training, Research, or Consultancy.
            </p>
          </div>
          <DeptDashboardCards
            endpoint="/rtc/admin/dashboard"
            onNavigate={setTab}
            buildCards={(d) => [
              { label: "Approved courses", value: d.approvedCourses, hint: "General (farmers)", nav: "training" },
              { label: "Draft courses", value: d.draftCourses, hint: "General — awaiting approval", nav: "training" },
              { label: "Corps courses live", value: d.corpsApprovedCourses, hint: "NYSC corps members", nav: "training" },
              { label: "Corps drafts", value: d.corpsDraftCourses, hint: "Awaiting lessons, quiz or approval", nav: "training" },
              { label: "Corps payments to confirm", value: d.corpsPaymentsPending, hint: "Access fees awaiting confirmation", nav: "corps" },
              { label: "Corps members paid", value: d.corpsPaidMembers, hint: "Training unlocked", nav: "corps" },
              { label: "Published research", value: d.publishedResearch, nav: "research" },
              {
                label: "Pending consultancy requests",
                value: d.pendingConsultancyRequests,
                nav: "consultancy",
              },
            ]}
          />
        </div>
      )}

      {tab === "training" && editingCourse && (
        <CorpsCourseEditor
          course={editingCourse}
          onBack={() => {
            setEditingCourse(null);
            loadCourses();
          }}
          onChanged={loadCourses}
        />
      )}

      {tab === "training" && !editingCourse && (
        <div className="max-w-4xl space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-canopy-300">TRC — Training</p>
            <h1 className="text-xl font-medium text-white">Training courses</h1>
            <p className="mt-1 text-sm text-canopy-100">
              Choose who a course is for. <strong>General</strong> courses are free for farmers and appear in
              their "Seminar" tab once approved. <strong>Corps</strong> courses are NYSC corps member training,
              built from lessons and a quiz, and never appear to farmers.
            </p>
          </div>

          <SectionStack
            label="Training section"
            sections={[
              {
                key: "upload",
                label: "Upload a training course",
                node: (
              <div className="card">
                <p className="text-sm text-ink-600">Upload a training course</p>
                <form onSubmit={handleSubmitCourse} className="field mt-3 space-y-2">
                  <div role="group" aria-label="Course audience" className="flex gap-2">
                    {[["general", "General (farmers)"], ["corps", "Corps (NYSC corps members)"]].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={courseAudience === value}
                        onClick={() => setCourseAudience(value)}
                        className={`rounded-card border px-3 py-2 text-sm ${courseAudience === value ? "border-canopy-600 bg-canopy-600 text-white" : "border-soil-200 text-ink-900"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <input value={courseTitle} onChange={(e) => setCourseTitle(e.target.value)} placeholder="Course title" />
                  <textarea
                    rows={2}
                    value={courseDescription}
                    onChange={(e) => setCourseDescription(e.target.value)}
                    placeholder="Description"
                  />
                  {courseAudience === "general" ? (
                    <>
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
                    </>
                  ) : (
                    <p className="text-xs text-ink-600">
                      After creating a corps course you add its lessons (video, document or live session) and its quiz,
                      then approve it.
                    </p>
                  )}
                  <button className="btn-primary" type="submit" disabled={submittingCourse}>
                    {submittingCourse ? "Saving…" : courseAudience === "corps" ? "Create corps course" : "Upload course"}
                  </button>
                </form>
              </div>
                ),
              },
              {
                key: "all",
                label: "All courses",
                node: (
              <div className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-ink-600">All courses</p>
                  <div role="group" aria-label="Filter courses" className="flex gap-2 text-xs">
                    {[["all", "All"], ["general", "General"], ["corps", "Corps"]].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={audienceFilter === value}
                        onClick={() => setAudienceFilter(value)}
                        className={`rounded-full border px-3 py-1 ${audienceFilter === value ? "border-canopy-600 bg-canopy-600 text-white" : "border-soil-200 text-ink-900"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {courses.filter((c) => audienceFilter === "all" || c.audience === audienceFilter).length === 0 && (
                  <p className="mt-2 text-sm text-ink-600">Nothing uploaded yet.</p>
                )}
                <div className="mt-3 space-y-2">
                  {courses.filter((c) => audienceFilter === "all" || c.audience === audienceFilter).map((c) => (
                    <div key={c.id} className="rounded-card border border-soil-200 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-ink-900">
                            {c.title}{" "}
                            <span className="ml-1 rounded-full bg-canopy-50 px-2 py-0.5 text-xs font-medium text-canopy-800">
                              {c.audience === "corps" ? "Corps" : "General"}
                            </span>
                          </p>
                          {c.description && <p className="text-sm text-ink-600">{c.description}</p>}
                          {c.audience === "corps" && (
                            <p className="mt-1 text-xs text-ink-600">
                              {c.lessonCount} {c.lessonCount === 1 ? "lesson" : "lessons"} · {c.questionCount} quiz{" "}
                              {c.questionCount === 1 ? "question" : "questions"}
                            </p>
                          )}
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
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          {c.audience === "corps" && (
                            <button type="button" className="text-xs text-canopy-800 underline" onClick={() => setEditingCourse(c)}>
                              Manage lessons &amp; quiz
                            </button>
                          )}
                          {c.approved ? (
                            <span className="rounded-full bg-canopy-50 px-3 py-1 text-xs font-medium text-canopy-800">
                              Approved
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn-primary"
                              disabled={c.audience === "corps" && (c.lessonCount < 1 || c.questionCount < 1)}
                              title={c.audience === "corps" && (c.lessonCount < 1 || c.questionCount < 1) ? "Add a lesson and a quiz question first" : undefined}
                              onClick={() => handleApproveCourse(c.id)}
                            >
                              Approve
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
                ),
              },
            ]}
          />
        </div>
      )}

      {tab === "corps" && (
        <div className="max-w-6xl space-y-6">
          <div className="flex flex-wrap gap-2 text-sm" role="tablist" aria-label="Corps sections">
            {[["payments", "Payments"], ["progress", "Progress"], ["batches", "Batches"], ["members", "Members"]].map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={corpsView === key} onClick={() => setCorpsView(key)}
                className={`rounded-card border px-3 py-2 ${corpsView === key ? "border-canopy-600 bg-canopy-600 text-white" : "border-soil-200 text-ink-900 bg-white"}`}>
                {label}
              </button>
            ))}
          </div>
          {corpsView === "payments" ? <CorpsPayments /> : corpsView === "progress" ? <CorpsProgress /> : corpsView === "batches" ? <CorpsBatches /> : <CorpsMembers />}
        </div>
      )}

      {tab === "research" && (
        <div className="max-w-4xl space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-canopy-300">TRC — Research</p>
            <h1 className="text-xl font-medium text-white">Research write-ups</h1>
            <p className="mt-1 text-sm text-canopy-100">Company-authored, published immediately — no approval gate.</p>
          </div>

          <SectionStack
            label="Research section"
            sections={[
              {
                key: "publish",
                label: "Publish a research item",
                node: (
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
                ),
              },
              {
                key: "published",
                label: "Published research",
                node: (
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
                ),
              },
            ]}
          />
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

          <SectionStack
            label="Consultancy section"
            sections={[
              {
                key: "publish",
                label: "Publish an offering",
                node: (
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
                ),
              },
              {
                key: "offerings",
                label: "Offerings",
                node: (
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
                ),
              },
              {
                key: "requests",
                label: "Requests",
                node: (
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
                ),
              },
            ]}
          />
        </div>
      )}

      {tab === "approvals" && <DepartmentRequestsPanel department="TRC" />}

      {tab === "profile" && (
        <div className="max-w-3xl">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-wide text-canopy-300">TRC</p>
            <h1 className="text-xl font-medium text-white">Profile</h1>
          </div>
          <AccountProfileCard user={user} extraFields={[{ label: "Role", value: departmentRoleLabel(user, "TRC") }]} />
        </div>
      )}
    </DashboardShell>
  );
}
