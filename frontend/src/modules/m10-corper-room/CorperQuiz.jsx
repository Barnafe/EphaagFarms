import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { apiFetch } from "../../api/client.js";

const newToken = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// Quiz: one question at a time (phone friendly). Questions arrive without the
// answers and are graded on the server; Submit stays disabled until every
// question is answered. The result then shows the correct answers and
// explanations, and Retake loads a freshly shuffled quiz.
export default function CorperQuiz({ courseId, onBack, onError }) {
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({}); // questionId -> optionId
  const [index, setIndex] = useState(0);
  const [token, setToken] = useState(newToken);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setQuiz(null);
    setAnswers({});
    setIndex(0);
    setResult(null);
    setError(null);
    setToken(newToken());
    try {
      setQuiz(await apiFetch(`/corpers/courses/${courseId}/quiz`));
    } catch (err) {
      onError?.(err);
      setError(err.message);
    }
  }, [courseId, onError]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (submitting || !quiz) return;
    setSubmitting(true);
    setError(null);
    try {
      // Sent in the order the member saw the questions, so the review matches.
      const body = {
        clientToken: token,
        answers: quiz.questions.map((q) => ({ questionId: q.id, optionId: answers[q.id] })),
      };
      setResult(await apiFetch(`/corpers/courses/${courseId}/quiz/attempts`, { method: "POST", body }));
    } catch (err) {
      if (err.code === "PAYMENT_REQUIRED") onError?.(err);
      setError(
        ["UNKNOWN_QUESTION", "UNKNOWN_OPTION", "INCOMPLETE"].includes(err.code)
          ? "This quiz was updated while you were answering. Reload it and try again."
          : err.message
      );
    } finally {
      setSubmitting(false);
    }
  }

  const back = (
    <button type="button" onClick={onBack} className="inline-flex h-11 items-center gap-1 text-sm font-medium text-[#2c6b2f]"><ArrowLeft size={16} aria-hidden="true" /> Back to course</button>
  );

  if (result) {
    const { attempt, review, course, overall, courseJustCompleted } = result;
    return (
      <div className="space-y-4">
        {back}
        <section className="rounded-card border border-soil-200 bg-white p-5 text-center" data-testid="quiz-result">
          <p className="text-sm text-ink-800">Your score</p>
          <p className="font-display text-5xl font-semibold text-ink-900" data-testid="quiz-score">{attempt.score}%</p>
          <p className="mt-1 text-sm text-ink-800">{attempt.correctCount} of {attempt.total} correct · attempt {attempt.attemptNo}</p>
          {course && course.bestScore !== null && <p className="mt-1 text-xs text-ink-600">Best score on this course: {course.bestScore}%</p>}
          {courseJustCompleted && (
            <p role="status" className="mt-3 rounded-card border border-[#2c6b2f] bg-[#e9f1e6] p-3 text-sm font-medium text-[#1f4f22]" data-testid="course-just-completed">
              Course complete! Your training progress is now {overall.percent}%.
            </p>
          )}
          {!courseJustCompleted && course?.completed && <p className="mt-3 text-xs text-ink-600">This course is already complete. Retaking only improves your score.</p>}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={load} className="h-11 rounded-card bg-[#2c6b2f] px-5 text-sm font-semibold text-white">Retake quiz</button>
            <button type="button" onClick={onBack} className="h-11 rounded-card border border-[#2c6b2f] px-5 text-sm font-medium text-[#2c6b2f]">Back to course</button>
          </div>
        </section>
        <section className="space-y-3" aria-label="Review">
          <h2 className="font-display text-lg font-semibold text-ink-900">Review</h2>
          <ul className="space-y-3">
            {review.map((r) => (
              <li key={r.position} className="rounded-card border border-soil-200 bg-white p-4" data-testid="review-item">
                <p className="text-sm font-semibold text-ink-900">{r.position}. {r.prompt}</p>
                <p className={`mt-2 flex items-start gap-1 text-sm ${r.isCorrect ? "text-[#1f4f22]" : "text-red-700"}`}>
                  {r.isCorrect ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" aria-label="Correct" /> : <XCircle size={16} className="mt-0.5 shrink-0" aria-label="Wrong" />}
                  <span>Your answer: {r.chosenText}</span>
                </p>
                {!r.isCorrect && <p className="mt-1 text-sm text-ink-900">Correct answer: <strong>{r.correctText}</strong></p>}
                {r.explanation && <p className="mt-2 rounded-card bg-soil-100 p-2 text-xs text-ink-800">{r.explanation}</p>}
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="space-y-4">
        {back}
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <p className="text-sm text-ink-800">Loading quiz...</p>}
      </div>
    );
  }

  const total = quiz.questions.length;
  const q = quiz.questions[index];
  const answered = quiz.questions.filter((x) => answers[x.id]).length;
  const allAnswered = answered === total;

  return (
    <div className="space-y-4">
      {back}
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900">{quiz.course.title} quiz</h1>
        <p className="mt-1 text-xs text-ink-600">Question {index + 1} of {total} · {answered} answered</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e9f1e6]" aria-hidden="true"><div className="h-full bg-[#2c6b2f]" style={{ width: `${(answered / total) * 100}%` }} /></div>
      </div>

      <fieldset className="rounded-card border border-soil-200 bg-white p-4" data-testid="quiz-question">
        <legend className="px-1 text-base font-semibold text-ink-900">{q.prompt}</legend>
        <div className="mt-2 space-y-2">
          {q.options.map((o) => {
            const checked = answers[q.id] === o.id;
            return (
              <label key={o.id} className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-card border p-3 text-sm ${checked ? "border-[#2c6b2f] bg-[#e9f1e6]" : "border-soil-200"}`}>
                <input type="radio" name={`q-${q.id}`} className="mt-1" checked={checked} onChange={() => setAnswers({ ...answers, [q.id]: o.id })} />
                <span className="text-ink-900">{o.text}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {error && <p role="alert" className="text-sm text-red-700">{error} {error.includes("Reload") && <button type="button" onClick={load} className="underline">Reload quiz</button>}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)} className="h-11 rounded-card border border-soil-200 px-4 text-sm text-ink-900 disabled:opacity-40">Previous</button>
        {index < total - 1 ? (
          <button type="button" onClick={() => setIndex(index + 1)} className="h-11 rounded-card border border-[#2c6b2f] px-5 text-sm font-medium text-[#2c6b2f]">Next</button>
        ) : (
          <span className="text-xs text-ink-600">{allAnswered ? "All answered" : `${total - answered} left to answer`}</span>
        )}
        <button type="button" onClick={submit} disabled={!allAnswered || submitting} className="h-11 rounded-card bg-[#2c6b2f] px-5 text-sm font-semibold text-white disabled:opacity-50" data-testid="submit-quiz">
          {submitting ? "Submitting…" : "Submit quiz"}
        </button>
      </div>
      {!allAnswered && <p className="text-xs text-ink-600">Submit unlocks when every question is answered.</p>}
    </div>
  );
}
