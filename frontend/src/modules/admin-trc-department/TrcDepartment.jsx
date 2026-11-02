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
import SeminarContentEditor from "./SeminarContentEditor.jsx";
import CorpsPayments from "./CorpsPayments.jsx";
import CorpsProgress from "./CorpsProgress.jsx";
import CorpsBatches from "./CorpsBatches.jsx";
import CorpsMembers from "./CorpsMembers.jsx";
import ConsultancyRequests from "./ConsultancyRequests.jsx";

import useUrlState from "../../hooks/useUrlState.js";
// TRC: Training, Research & Consultancy. Restored 2026-09-05 to its
// full three-part scope after a 2026-09-02 round had narrowed the whole
// department to training-courses-only under the name "Seminal". That
// narrowing was only ever meant for the farmer-facing tab inside
// Farmer's Room (which keeps a "Seminar" label and stays courses-only
// on purpose), this admin department is the real thing, with all
// three functions.

const items = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "training", label: "Training", icon: GraduationCap },
  { key: "corps", label: "NYSC AGROALLIED SAED", icon: Users, description: "NYSC AGROALLIED SAED member access-fee payments, the fee itself, and member progress." },
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
  // "corps" (NYSC AGROALLIED SAED members). The admin picks one when creating a course.
  const [courseAudience, setCourseAudience] = useState("general");
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [editingCourse, setEditingCourse] = useState(null);

  // Research
  const [research, setResearch] = useState([]);
  const [submittingResearch, setSubmittingResearch] = useState(false);
  const [researchTitle, setResearchTitle] = useState("");
  const [researchSummary, setResearchSummary] = useState("");
  const [researchFile, setResearchFile] = useState(null);
  const [researchFileKey, setResearchFileKey] = useState(0); // changing it empties the file picker after a save
  const [consultCounts, setConsultCounts] = useState({});

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
      const [{ offerings: o }, { requests: r, counts }] = await Promise.all([
        apiFetch("/rtc/admin/consultancy/offerings"),
        apiFetch("/consultancy/admin/requests"),
      ]);
      setOfferings(o);
      setRequests(r);
      setConsultCounts(counts || {});
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
      // A NYSC AGROALLIED SAED course is empty until lessons + a quiz are added, so go
      // straight to its editor.
      // A seminar topic is empty until videos or slides are added, so open its editor too.
      if (created) setEditingCourse(created);
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
    if (!researchFile) { setError("Attach the research as a PDF file."); return; }
    setSubmittingResearch(true);
    try {
      const fd = new FormData();
      fd.append("title", researchTitle);
      if (researchSummary) fd.append("summary", researchSummary);
      fd.append("file", researchFile);
      await apiUpload("/rtc/admin/research", fd);
      setResearchTitle("");
      setResearchSummary("");
      setResearchFile(null);
      setResearchFileKey((k) => k + 1);
      setError(null);
      await loadResearch();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingResearch(false);
    }
  }

  async function handleDownloadResearch(r) {
    try {
      await apiDownload(`/rtc/admin/research/${r.id}/file`, r.fileName || `${r.title}.pdf`);
    } catch (err) {
      setError(err.message);
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
            <h1 className="text-xl font-medium text-white">TRC: Training, Research & Consultancy</h1>
            <p className="mt-1 text-sm text-canopy-100">
              Open Training, Research or Consultancy from the sidebar.</p>
          </div>
          <DeptDashboardCards
            endpoint="/rtc/admin/dashboard"
            onNavigate={setTab}
            buildCards={(d) => [
              { label: "Approved courses", value: d.approvedCourses, hint: "General (farmers)", nav: "training" },
              { label: "Draft courses", value: d.draftCourses, hint: "General, awaiting approval", nav: "training" },
              { label: "NYSC AGROALLIED SAED courses live", value: d.corpsApprovedCourses, hint: "NYSC AGROALLIED SAED members", nav: "training" },
              { label: "NYSC AGROALLIED SAED drafts", value: d.corpsDraftCourses, hint: "Awaiting lessons, quiz or approval", nav: "training" },
              { label: "NYSC AGROALLIED SAED payments to confirm", value: d.corpsPaymentsPending, hint: "Access fees awaiting confirmation", nav: "corps" },
              { label: "NYSC AGROALLIED SAED members paid", value: d.corpsPaidMembers, hint: "Training unlocked", nav: "corps" },
              { label: "Research items", value: d.publishedResearch, nav: "research" },
              {
                label: "Pending consultancy requests",
                value: d.pendingConsultancyRequests,
                nav: "consultancy",
              },
            ]}
          />
        </div>
      )}

      {tab === "training" && editingCourse && editingCourse.audience !== "corps" && (
        <SeminarContentEditor
          course={editingCourse}
          onBack={() => {
            setEditingCourse(null);
            loadCourses();
          }}
          onChanged={loadCourses}
        />
      )}

      {tab === "training" && editingCourse && editingCourse.audience === "corps" && (
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
            <p className="text-xs uppercase tracking-wide text-canopy-300">TRC: Training</p>
            <h1 className="text-xl font-medium text-white">Training courses</h1>
            <p className="mt-1 text-sm text-canopy-100">
              Choose who a course is for. <strong>General</strong> courses are free for farmers and appear in
              their "Seminar" tab once approved. <strong>NYSC AGROALLIED SAED</strong> courses are NYSC AGROALLIED SAED member training,
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
                    {[["general", "General (farmers)"], ["corps", "NYSC AGROALLIED SAED (members)"]].map(([value, label]) => (
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
                    <p className="text-xs text-ink-600">Add videos and slides after creating it, then approve it.</p>
                  ) : (
                    <p className="text-xs text-ink-600">
                      Add lessons and a quiz after creating a course, then approve it.</p>
                  )}
                  <button className="btn-primary" type="submit" disabled={submittingCourse}>
                    {submittingCourse ? "Saving…" : courseAudience === "corps" ? "Create NYSC AGROALLIED SAED course" : "Upload course"}
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
                    {[["all", "All"], ["general", "General"], ["corps", "NYSC AGROALLIED SAED"]].map(([value, label]) => (
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
                              {c.audience === "corps" ? "NYSC AGROALLIED SAED" : "General"}
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
                          {c.audience === "corps" ? (
                            <button type="button" className="text-xs text-canopy-800 underline" onClick={() => setEditingCourse(c)}>
                              Manage lessons &amp; quiz
                            </button>
                          ) : (
                            <button type="button" className="text-xs text-canopy-800 underline" onClick={() => setEditingCourse(c)}>
                              Videos &amp; slides
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
          <div className="flex flex-wrap gap-2 text-sm" role="tablist" aria-label="NYSC AGROALLIED SAED sections">
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
            <p className="text-xs uppercase tracking-wide text-canopy-300">TRC: Research</p>
            <h1 className="text-xl font-medium text-white">Research write-ups</h1>
            <p className="mt-1 text-sm text-canopy-100">Internal to EPHAAG: only staff can read or download these. Members and the public cannot see them.</p>
          </div>

          <SectionStack
            label="Research section"
            sections={[
              {
                key: "publish",
                label: "Add a research item",
                node: (
              <div className="card">
                <p className="text-sm text-ink-600">Add a research item</p>
                <form onSubmit={handleSubmitResearch} className="field mt-3 space-y-2">
                  <input value={researchTitle} onChange={(e) => setResearchTitle(e.target.value)} placeholder="Title" />
                  <textarea
                    rows={3}
                    value={researchSummary}
                    onChange={(e) => setResearchSummary(e.target.value)}
                    placeholder="Summary"
                  />
                  <label htmlFor="research-pdf" className="text-sm text-ink-600">The research as a PDF</label>
                  <input key={researchFileKey} id="research-pdf" type="file" accept="application/pdf,.pdf" onChange={(e) => setResearchFile(e.target.files?.[0] || null)} />
                  <button className="btn-primary" type="submit" disabled={submittingResearch}>
                    {submittingResearch ? "Saving…" : "Save research"}
                  </button>
                </form>
              </div>
                ),
              },
              {
                key: "published",
                label: "Research library",
                node: (
              <div className="card">
                <p className="text-sm text-ink-600">Research library (staff only)</p>
                {research.length === 0 && <p className="mt-2 text-sm text-ink-600">Nothing added yet.</p>}
                <div className="mt-3 space-y-2">
                  {research.map((r) => (
                    <div key={r.id} className="rounded-card border border-soil-200 px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-ink-900">{r.title}</p>
                          {r.summary && <p className="text-sm text-ink-600">{r.summary}</p>}
                        </div>
                        <div className="flex shrink-0 gap-3">
                          {r.hasFile && (
                            <button type="button" className="text-xs text-canopy-800 underline" onClick={() => handleDownloadResearch(r)}>
                              Download PDF
                            </button>
                          )}
                          <button type="button" className="text-xs text-red-700 underline" onClick={() => handleDeleteResearch(r.id)}>
                            Remove
                          </button>
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

      {tab === "consultancy" && (
        <div className="max-w-4xl space-y-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-canopy-300">TRC: Consultancy</p>
            <h1 className="text-xl font-medium text-white">Consultancy services & requests</h1>
            <p className="mt-1 text-sm text-canopy-100">
              Anyone can book, with or without an account. Approve a request with its fee and payment terms; once it is paid, set the session date, time and place.
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
                node: <ConsultancyRequests requests={requests} counts={consultCounts} reload={loadConsultancy} setError={setError} />,
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
