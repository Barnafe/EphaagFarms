import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Circle, ExternalLink, FileDown, Lock, Video, Radio } from "lucide-react";
import { apiFetch, apiDownload } from "../../api/client.js";

const when = (d) => (d ? new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }) : "");
const KIND = { video: { label: "Video", Icon: Video }, document: { label: "Document", Icon: FileDown }, live: { label: "Live session", Icon: Radio } };

// One course: its lessons (Open / Download / Join + Mark complete) and the
// quiz, which stays locked until every lesson is done. "Mark complete" is an
// honour system — videos and live sessions happen on other sites.
export default function CorperCourse({ courseId, onBack, onQuiz, onError }) {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [lastResult, setLastResult] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch(`/corpers/courses/${courseId}`));
    } catch (err) {
      onError?.(err);
      setMessage(err.message);
    }
  }, [courseId, onError]);

  useEffect(() => {
    load();
  }, [load]);

  async function markDone(lesson) {
    setBusyId(lesson.id);
    setMessage(null);
    try {
      const r = await apiFetch(`/corpers/courses/${courseId}/lessons/${lesson.id}/complete`, { method: "POST", body: {} });
      if (r.courseJustCompleted) setMessage("Course complete — well done!");
      await load();
    } catch (err) {
      if (err.code === "PAYMENT_REQUIRED") onError?.(err);
      setMessage(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function download(lesson) {
    setMessage(null);
    try {
      await apiDownload(`/corpers/courses/${courseId}/lessons/${lesson.id}/file`, lesson.fileName || lesson.title);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function viewLastResult() {
    setMessage(null);
    try {
      const list = await apiFetch(`/corpers/courses/${courseId}/quiz/attempts`);
      if (!list.attempts.length) return;
      setLastResult(await apiFetch(`/corpers/courses/${courseId}/quiz/attempts/${list.attempts[0].id}`));
    } catch (err) {
      setMessage(err.message);
    }
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={onBack} className="inline-flex h-11 items-center gap-1 text-sm font-medium text-[#2c6b2f]"><ArrowLeft size={16} aria-hidden="true" /> My Training</button>
        <p className="text-sm text-ink-800">{message || "Loading..."}</p>
      </div>
    );
  }

  const { course, lessons, progress, quiz } = data;
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex h-11 items-center gap-1 text-sm font-medium text-[#2c6b2f]"><ArrowLeft size={16} aria-hidden="true" /> My Training</button>
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">{course.title}</h1>
        {course.description && <p className="mt-1 text-sm text-ink-800">{course.description}</p>}
        <p className="mt-2 text-xs text-ink-600">{progress.lessonsDone} of {progress.lessonCount} lessons done</p>
      </div>

      {progress.completed && (
        <p role="status" className="rounded-card border border-[#2c6b2f] bg-[#e9f1e6] p-3 text-sm font-medium text-[#1f4f22]" data-testid="course-complete">
          <CheckCircle2 className="mr-1 inline" size={16} aria-hidden="true" /> You have completed this course. It counts toward your progress.
        </p>
      )}
      {message && <p role="status" className="rounded-card border border-[#dba532] bg-[#fbf1dd] p-3 text-sm text-ink-900">{message}</p>}

      <ol className="space-y-3">
        {lessons.map((l, i) => {
          const { label, Icon } = KIND[l.kind] || KIND.video;
          return (
            <li key={l.id} className="rounded-card border border-soil-200 bg-white p-4" data-testid="lesson-row">
              <div className="flex items-start gap-3">
                {l.completed ? <CheckCircle2 className="mt-0.5 shrink-0 text-[#2c6b2f]" size={20} aria-label="Done" /> : <Circle className="mt-0.5 shrink-0 text-[#a68a55]" size={20} aria-label="Not done" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">{i + 1}. {l.title}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-600"><Icon size={14} aria-hidden="true" /> {label}{l.kind === "live" && l.scheduledAt ? ` · ${when(l.scheduledAt)}` : ""}</p>
                  {l.notes && <p className="mt-2 text-sm text-ink-800">{l.notes}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {l.kind === "video" && l.url && (
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-1 rounded-card border border-[#2c6b2f] px-4 text-sm font-medium text-[#2c6b2f]">Open <ExternalLink size={14} aria-hidden="true" /></a>
                    )}
                    {l.kind === "live" && l.url && (
                      <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-1 rounded-card border border-[#2c6b2f] px-4 text-sm font-medium text-[#2c6b2f]">Join <ExternalLink size={14} aria-hidden="true" /></a>
                    )}
                    {l.kind === "document" && l.hasFile && (
                      <button type="button" onClick={() => download(l)} className="inline-flex h-11 items-center gap-1 rounded-card border border-[#2c6b2f] px-4 text-sm font-medium text-[#2c6b2f]">Download <FileDown size={14} aria-hidden="true" /></button>
                    )}
                    {!l.completed && (
                      <button
                        type="button"
                        disabled={busyId === l.id || !l.canComplete}
                        onClick={() => markDone(l)}
                        className="h-11 rounded-card bg-[#2c6b2f] px-4 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {busyId === l.id ? "Saving…" : "Mark complete"}
                      </button>
                    )}
                    {l.completed && <span className="text-xs font-medium text-[#2c6b2f]">Done</span>}
                  </div>
                  {!l.completed && !l.canComplete && <p className="mt-2 text-xs text-ink-600">You can mark this live session complete once it starts ({when(l.availableAt)}).</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <section className="rounded-card border border-soil-200 bg-white p-4" data-testid="quiz-card">
        <h2 className="font-display text-lg font-semibold text-ink-900">Course quiz</h2>
        <p className="mt-1 text-sm text-ink-800">{quiz.questionCount} multiple-choice question{quiz.questionCount === 1 ? "" : "s"}. You can retake it as many times as you like.</p>
        {quiz.attempts > 0 && (
          <p className="mt-1 text-xs text-ink-600">Attempts: {quiz.attempts} · Best score: {quiz.bestScore}% · Last score: {quiz.lastScore}%</p>
        )}
        {quiz.locked ? (
          <p className="mt-3 flex items-center gap-2 rounded-card bg-soil-100 p-3 text-sm text-ink-800" data-testid="quiz-locked"><Lock size={16} aria-hidden="true" /> {quiz.lockedReason}</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onQuiz} className="h-11 rounded-card bg-[#2c6b2f] px-5 text-sm font-semibold text-white">{quiz.attempts > 0 ? "Retake quiz" : "Take quiz"}</button>
            {quiz.attempts > 0 && <button type="button" onClick={viewLastResult} className="h-11 rounded-card border border-[#2c6b2f] px-4 text-sm font-medium text-[#2c6b2f]">View last result</button>}
          </div>
        )}
      </section>

      {lastResult && (
        <section className="rounded-card border border-soil-200 bg-white p-4" data-testid="last-result">
          <h2 className="font-display text-lg font-semibold text-ink-900">Attempt {lastResult.attempt.attemptNo}: {lastResult.attempt.score}% ({lastResult.attempt.correctCount} of {lastResult.attempt.total} correct)</h2>
          <ul className="mt-3 space-y-3">
            {lastResult.review.map((r) => (
              <li key={r.position} className="text-sm">
                <p className="font-medium text-ink-900">{r.position}. {r.prompt}</p>
                <p className={r.isCorrect ? "text-[#1f4f22]" : "text-red-700"}>Your answer: {r.chosenText} {r.isCorrect ? "✓" : "✗"}</p>
                {!r.isCorrect && <p className="text-ink-800">Correct answer: {r.correctText}</p>}
                {r.explanation && <p className="text-xs text-ink-600">{r.explanation}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
