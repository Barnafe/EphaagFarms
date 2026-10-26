import { useEffect, useState } from "react";
import { apiFetch } from "../../api/client.js";
import ProgressRing from "./ProgressRing.jsx";

const batchLabel = (p) => (p?.serviceYear && p?.batch && p?.stream ? `${p.serviceYear} Batch ${p.batch} Stream ${p.stream}` : null);

// Steps mirror the agreed flow: Register -> Pay -> Train -> Certificate.
// Register and Pay are real (phase 3); training progress is real from
// phase 4 (courses completed / live corps courses) and says "starts after
// payment" until the access fee is confirmed (nothing counts before then).
// The certificate is released when the admin marks the batch complete.
export default function CorperHome({ user, bundle, onCourses, onGo, onOpenCourse }) {
  const { profile, completion, access } = bundle;
  const paid = !!access?.paid;
  const pending = access?.status === "pending";

  // Only a paid member may ask for their progress (the server enforces it).
  const [progress, setProgress] = useState(null);
  useEffect(() => {
    if (!paid) return;
    let alive = true;
    apiFetch("/corpers/progress")
      .then((d) => {
        if (!alive) return;
        setProgress(d);
        onCourses?.(d.total);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [paid, onCourses]);

  // Step 4 — the certificate (hidden until the batch is marked complete).
  const [cert, setCert] = useState(null);
  useEffect(() => {
    let alive = true;
    apiFetch("/corpers/certificate").then((d) => alive && setCert(d)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const next = progress?.next;
  const nextNote = !next
    ? null
    : next.status === "not_started"
      ? "Not started yet"
      : next.lessonsDone < next.lessonCount
        ? `${next.lessonsDone} of ${next.lessonCount} lessons done`
        : "All lessons done — take the quiz";

  const steps = [
    { n: 1, title: "Register", note: "Done", state: "done" },
    paid
      ? { n: 2, title: "Pay for access", note: "Paid", state: "done" }
      : { n: 2, title: "Pay for access", note: pending ? "Awaiting confirmation" : "Pay your access fee", state: "next" },
    paid
      ? { n: 3, title: "Train", note: "Unlocked", state: "next" }
      : { n: 3, title: "Train", note: "Locked until paid", state: "locked" },
    cert?.status === "ready"
      ? { n: 4, title: "Certificate", note: "Ready — download it", state: "done" }
      : cert?.status === "awaiting_batch"
        ? { n: 4, title: "Certificate", note: "Awaiting batch completion", state: "next" }
        : { n: 4, title: "Certificate", note: "Locked until you finish every course", state: "locked" },
  ];
  const tone = {
    done: "border-[#2c6b2f] bg-[#e9f1e6]",
    next: "border-[#dba532] bg-[#fbf1dd]",
    locked: "border-soil-200 bg-white",
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900 md:text-3xl">Welcome, {user.name}</h1>
        <p className="mt-1 text-sm text-ink-800">
          {batchLabel(profile) ? `NYSC ${batchLabel(profile)}` : "Complete your NYSC details to get started"}
          {profile.stateOfDeployment ? ` · ${profile.stateOfDeployment}` : ""}
        </p>
      </div>

      <ol className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {steps.map((s) => (
          <li key={s.n} className={`rounded-card border p-4 ${tone[s.state]}`}>
            <p className="text-sm font-semibold text-ink-900">{s.n}. {s.title}</p>
            <p className="mt-1 text-xs text-ink-800">{s.note}</p>
          </li>
        ))}
      </ol>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-card border border-soil-200 bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-ink-900">Training progress</h2>
          {paid ? (
            <>
              {!progress ? (
                <p className="mt-3 text-sm text-ink-800">Loading your courses…</p>
              ) : (
                <div className="mt-3 flex items-center gap-4">
                  <ProgressRing percent={progress.percent} />
                  <div>
                    <p className="text-sm font-semibold text-ink-900" data-testid="home-progress-summary">
                      {progress.completed} of {progress.total} course{progress.total === 1 ? "" : "s"} completed
                    </p>
                    <p className="mt-1 text-xs text-ink-600">Quiz scores don't change this percentage.</p>
                  </div>
                </div>
              )}
              <button type="button" onClick={() => onGo("training")} className="mt-4 h-11 rounded-card border border-[#2c6b2f] px-4 text-sm font-medium text-[#2c6b2f]">
                View my training
              </button>
            </>
          ) : (
            <>
              <p className="mt-3 font-display text-2xl font-semibold text-ink-900">Starts after payment</p>
              <p className="mt-1 text-sm text-ink-800">Nothing counts toward your progress until your access fee is confirmed.</p>
              <button type="button" onClick={() => onGo("payments")} className="mt-4 h-11 rounded-card border border-[#2c6b2f] px-4 text-sm font-medium text-[#2c6b2f]">
                {pending ? "View my payment" : "Pay access fee"}
              </button>
            </>
          )}
        </section>

        {paid && progress && (
          <section className="rounded-card border border-soil-200 bg-white p-5 md:col-span-2" data-testid="continue-learning">
            <h2 className="font-display text-lg font-semibold text-ink-900">Continue learning</h2>
            {next ? (
              <>
                <p className="mt-2 text-sm font-semibold text-ink-900">{next.title}</p>
                <p className="text-xs text-ink-600">{nextNote}</p>
                <button type="button" onClick={() => onOpenCourse(next.id)} className="mt-3 h-11 rounded-card bg-[#2c6b2f] px-5 text-sm font-semibold text-white">
                  {next.status === "not_started" ? "Start course" : "Continue"}
                </button>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-800">
                {progress.total === 0 ? "No courses are published yet. They will appear here once approved." : "You have completed every course. Your certificate comes after your batch is marked complete."}
              </p>
            )}
          </section>
        )}

        <section className="rounded-card border border-soil-200 bg-white p-5">
          <h2 className="font-display text-lg font-semibold text-ink-900">Profile completeness</h2>
          <div className="mt-3 flex items-center gap-3">
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#e9f1e6]" role="progressbar" aria-valuenow={completion.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
              <div className="h-full bg-[#2c6b2f]" style={{ width: `${completion.percent}%` }} />
            </div>
            <span className="text-sm font-semibold text-ink-900">{completion.percent}%</span>
          </div>
          <p className="mt-2 text-sm text-ink-800">
            {completion.percent === 100 ? "Your profile is complete." : "A complete profile helps NYSC verify you for certification."}
          </p>
          <button type="button" onClick={() => onGo("profile")} className="mt-4 h-11 rounded-card bg-[#2c6b2f] px-4 text-sm font-semibold text-white">
            {completion.percent === 100 ? "View profile" : "Complete my profile"}
          </button>
        </section>
      </div>
    </div>
  );
}
