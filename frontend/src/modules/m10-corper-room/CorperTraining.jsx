import { useCallback, useEffect, useState } from "react";
import { BookOpen, CheckCircle2 } from "lucide-react";
import { apiFetch } from "../../api/client.js";
import LockedPanel from "./LockedPanel.jsx";
import ProgressRing from "./ProgressRing.jsx";
import CorperCourse from "./CorperCourse.jsx";
import CorperQuiz from "./CorperQuiz.jsx";

const STATUS = {
  not_started: { label: "Not started", tone: "bg-soil-100 text-ink-800" },
  in_progress: { label: "In progress", tone: "bg-[#fbf1dd] text-[#7a5a10]" },
  completed: { label: "Completed", tone: "bg-[#e9f1e6] text-[#1f4f22]" },
};

function detail(c) {
  if (c.status === "completed") return `All ${c.lessonCount} lesson${c.lessonCount === 1 ? "" : "s"} done${c.bestScore !== null ? ` · best quiz score ${c.bestScore}%` : ""}`;
  if (c.status === "not_started") return `${c.lessonCount} lesson${c.lessonCount === 1 ? "" : "s"} · ${c.questionCount} quiz question${c.questionCount === 1 ? "" : "s"}`;
  if (c.lessonsDone < c.lessonCount) return `${c.lessonsDone} of ${c.lessonCount} lessons done`;
  return "All lessons done — take the quiz to finish";
}

// My Training: course list -> course page -> quiz -> result. Unpaid members
// never reach any of it (the server answers 402 on every call, and a
// refund mid-session simply shows the locked panel again).
export default function CorperTraining({ paid, onGoPayments, onCourses, initialCourseId = null }) {
  // view: { name: "list" } | { name: "course", id } | { name: "quiz", id }
  const [view, setView] = useState(initialCourseId ? { name: "course", id: initialCourseId } : { name: "list" });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [lockedNow, setLockedNow] = useState(false);

  const handleError = useCallback((err) => {
    if (err?.code === "PAYMENT_REQUIRED") setLockedNow(true);
    else setError(err?.message || "Something went wrong");
  }, []);

  useEffect(() => {
    if (!paid || view.name !== "list") return;
    let alive = true;
    apiFetch("/corpers/courses")
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
        onCourses?.(d.overall.total);
      })
      .catch((err) => alive && handleError(err));
    return () => {
      alive = false;
    };
  }, [paid, view.name, onCourses, handleError]);

  if (!paid || lockedNow) {
    return (
      <div className="space-y-4">
        <LockedPanel title="My Training" body="Your courses are locked until your one-time access fee is paid. Nothing here counts toward your progress before then." />
        <div className="text-center">
          <button type="button" onClick={onGoPayments} className="h-11 rounded-card bg-[#2c6b2f] px-6 text-sm font-semibold text-white">Go to Payments</button>
        </div>
      </div>
    );
  }

  if (view.name === "course") {
    return <CorperCourse courseId={view.id} onBack={() => setView({ name: "list" })} onQuiz={() => setView({ name: "quiz", id: view.id })} onError={handleError} />;
  }
  if (view.name === "quiz") {
    return <CorperQuiz courseId={view.id} onBack={() => setView({ name: "course", id: view.id })} onError={handleError} />;
  }

  const courses = data?.courses;
  const overall = data?.overall;
  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-ink-900">My Training</h1>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!courses && !error && <p className="text-sm text-ink-800">Loading...</p>}
      {courses && courses.length === 0 && (
        <p className="rounded-card border border-dashed border-soil-200 bg-white p-6 text-sm text-ink-800">No courses have been published yet. They will appear here as soon as they are approved.</p>
      )}
      {courses && courses.length > 0 && (
        <>
          <div className="flex items-center gap-4 rounded-card border border-soil-200 bg-white p-4">
            <ProgressRing percent={overall.percent} />
            <div>
              <p className="text-sm font-semibold text-ink-900" data-testid="overall-summary">{overall.completed} of {overall.total} course{overall.total === 1 ? "" : "s"} completed</p>
              <p className="mt-1 text-xs text-ink-600">A course is complete when every lesson is marked done and you have submitted its quiz. Your quiz score doesn't change this percentage.</p>
            </div>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {courses.map((c) => (
              <li key={c.id} className="rounded-card border border-soil-200 bg-white p-4" data-testid="course-card">
                <div className="flex items-start gap-3">
                  {c.status === "completed" ? (
                    <CheckCircle2 className="mt-1 shrink-0 text-[#2c6b2f]" size={20} aria-hidden="true" />
                  ) : (
                    <BookOpen className="mt-1 shrink-0 text-[#2c6b2f]" size={20} aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-base font-semibold text-ink-900">{c.title}</h2>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[c.status].tone}`} data-testid="course-status">{STATUS[c.status].label}</span>
                    </div>
                    {c.description && <p className="mt-1 text-sm text-ink-800">{c.description}</p>}
                    <p className="mt-2 text-xs text-ink-600">{detail(c)}</p>
                    <button
                      type="button"
                      onClick={() => setView({ name: "course", id: c.id })}
                      className="mt-3 h-11 rounded-card border border-[#2c6b2f] px-4 text-sm font-medium text-[#2c6b2f]"
                    >
                      {c.status === "completed" ? "Review course" : c.status === "not_started" ? "Start course" : "Continue"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
