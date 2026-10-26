import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiUpload, apiDownload } from "../../api/client.js";

// Admin editor for ONE corps (NYSC) course: ordered lessons (video link,
// uploaded document, or live session) plus the course's multiple-choice
// quiz. A corps course can only be approved once it has at least one
// lesson and one quiz question (enforced by the server too).

const KIND_LABEL = { video: "Video", document: "Document", live: "Live session" };
const emptyLesson = () => ({ id: null, title: "", kind: "video", url: "", scheduledAt: "", notes: "", file: null, existingFileName: null });
const emptyQuestion = () => ({
  id: null,
  prompt: "",
  explanation: "",
  options: [{ text: "", isCorrect: false }, { text: "", isCorrect: false }],
});

// ISO timestamp -> value for <input type="datetime-local"> (local time).
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CorpsCourseEditor({ course, onBack, onChanged }) {
  const base = `/rtc/admin/courses/${course.id}`;
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [lessonDraft, setLessonDraft] = useState(null);
  const [questionDraft, setQuestionDraft] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setContent(await apiFetch(`${base}/content`));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
      onChanged?.();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ---- lessons -------------------------------------------------------
  function startEditLesson(l) {
    setLessonDraft({
      id: l.id,
      title: l.title,
      kind: l.kind,
      url: l.url || "",
      scheduledAt: toLocalInput(l.scheduledAt),
      notes: l.notes || "",
      file: null,
      existingFileName: l.hasFile ? l.fileName : null,
    });
  }

  async function saveLesson(e) {
    e.preventDefault();
    const d = lessonDraft;
    const fd = new FormData();
    fd.append("title", d.title);
    fd.append("kind", d.kind);
    fd.append("notes", d.notes);
    if (d.kind !== "document") fd.append("url", d.url);
    if (d.kind === "live") fd.append("scheduledAt", d.scheduledAt);
    if (d.kind === "document" && d.file) fd.append("material", d.file);
    const ok = await run(() =>
      d.id ? apiUpload(`${base}/lessons/${d.id}`, fd, { method: "PUT" }) : apiUpload(`${base}/lessons`, fd)
    );
    if (ok) setLessonDraft(null);
  }

  const removeLesson = (l) => {
    if (!window.confirm(`Delete the lesson "${l.title}"?`)) return;
    run(() => apiFetch(`${base}/lessons/${l.id}`, { method: "DELETE" }));
  };

  const moveLesson = (l, direction) =>
    run(() => apiFetch(`${base}/lessons/${l.id}/move`, { method: "POST", body: { direction } }));

  // ---- quiz ----------------------------------------------------------
  function startEditQuestion(q) {
    setQuestionDraft({
      id: q.id,
      prompt: q.prompt,
      explanation: q.explanation || "",
      options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })),
    });
  }

  const setOption = (i, patch) =>
    setQuestionDraft((d) => ({ ...d, options: d.options.map((o, idx) => (idx === i ? { ...o, ...patch } : o)) }));
  const chooseCorrect = (i) =>
    setQuestionDraft((d) => ({ ...d, options: d.options.map((o, idx) => ({ ...o, isCorrect: idx === i })) }));

  async function saveQuestion(e) {
    e.preventDefault();
    const d = questionDraft;
    const body = { prompt: d.prompt, explanation: d.explanation, options: d.options };
    const ok = await run(() =>
      d.id
        ? apiFetch(`${base}/questions/${d.id}`, { method: "PUT", body })
        : apiFetch(`${base}/questions`, { method: "POST", body })
    );
    if (ok) setQuestionDraft(null);
  }

  const removeQuestion = (q) => {
    if (!window.confirm("Delete this quiz question?")) return;
    run(() => apiFetch(`${base}/questions/${q.id}`, { method: "DELETE" }));
  };

  async function approve() {
    await run(() => apiFetch(`${base}/approve`, { method: "POST" }));
  }

  if (!content) {
    return (
      <div className="max-w-4xl space-y-4">
        <button type="button" className="text-sm text-canopy-100 underline" onClick={onBack}>Back to courses</button>
        {error ? <p className="text-sm text-red-300" role="alert">{error}</p> : <p className="text-sm text-canopy-100">Loading…</p>}
      </div>
    );
  }

  const { lessons, questions } = content;
  const approved = content.course.approved;
  const missing = [];
  if (lessons.length < 1) missing.push("at least one lesson");
  if (questions.length < 1) missing.push("at least one quiz question");

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <button type="button" className="text-sm text-canopy-100 underline" onClick={onBack}>Back to courses</button>
        <p className="mt-3 text-xs uppercase tracking-wide text-canopy-300">Corps course</p>
        <h1 className="text-xl font-medium text-white">{content.course.title}</h1>
        {content.course.description && <p className="mt-1 text-sm text-canopy-100">{content.course.description}</p>}
      </div>

      {error && (
        <div className="card border-red-200 bg-red-50" role="alert">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-600" data-testid="readiness">
          {approved
            ? "Approved — live for corps members."
            : missing.length
              ? `Not ready to approve yet: add ${missing.join(" and ")}.`
              : "Ready to approve."}
        </p>
        {!approved && (
          <button type="button" className="btn-primary" disabled={busy || missing.length > 0} onClick={approve}>
            Approve course
          </button>
        )}
      </div>

      {/* ---------------- Lessons ---------------- */}
      <section className="card" aria-labelledby="lessons-h">
        <div className="flex items-center justify-between gap-2">
          <h2 id="lessons-h" className="text-sm font-medium text-ink-900">Lessons ({lessons.length})</h2>
          {!lessonDraft && (
            <button type="button" className="btn-primary" onClick={() => setLessonDraft(emptyLesson())}>Add lesson</button>
          )}
        </div>

        {lessons.length === 0 && !lessonDraft && <p className="mt-2 text-sm text-ink-600">No lessons yet.</p>}

        <ol className="mt-3 space-y-2">
          {lessons.map((l, i) => (
            <li key={l.id} className="rounded-card border border-soil-200 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">
                    {l.position}. {l.title}{" "}
                    <span className="ml-1 rounded-full bg-canopy-50 px-2 py-0.5 text-xs font-medium text-canopy-800">{KIND_LABEL[l.kind]}</span>
                  </p>
                  {l.url && <p className="break-all text-xs text-ink-600">{l.url}</p>}
                  {l.scheduledAt && <p className="text-xs text-ink-600">Scheduled {new Date(l.scheduledAt).toLocaleString()}</p>}
                  {l.hasFile && (
                    <button type="button" className="text-xs text-canopy-800 underline" onClick={() => apiDownload(`/rtc/admin/lessons/${l.id}/file`, l.fileName || l.title).catch((e) => setError(e.message))}>
                      Download {l.fileName || "document"}
                    </button>
                  )}
                  {l.notes && <p className="mt-1 text-sm text-ink-600">{l.notes}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2 text-xs">
                  <button type="button" aria-label={`Move ${l.title} up`} disabled={busy || i === 0} onClick={() => moveLesson(l, "up")} className="underline disabled:opacity-40">Up</button>
                  <button type="button" aria-label={`Move ${l.title} down`} disabled={busy || i === lessons.length - 1} onClick={() => moveLesson(l, "down")} className="underline disabled:opacity-40">Down</button>
                  <button type="button" aria-label={`Edit ${l.title}`} onClick={() => startEditLesson(l)} className="underline">Edit</button>
                  <button type="button" aria-label={`Delete ${l.title}`} onClick={() => removeLesson(l)} className="text-red-700 underline">Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ol>

        {lessonDraft && (
          <form onSubmit={saveLesson} className="field mt-4 space-y-2 rounded-card border border-soil-200 p-3" aria-label={lessonDraft.id ? "Edit lesson" : "New lesson"}>
            <div>
              <label htmlFor="lesson-title">Lesson title</label>
              <input id="lesson-title" value={lessonDraft.title} onChange={(e) => setLessonDraft({ ...lessonDraft, title: e.target.value })} />
            </div>
            <div>
              <label htmlFor="lesson-kind">Lesson type</label>
              <select id="lesson-kind" value={lessonDraft.kind} onChange={(e) => setLessonDraft({ ...lessonDraft, kind: e.target.value })}>
                <option value="video">Video (link)</option>
                <option value="document">Document (PDF, Word, PowerPoint or image)</option>
                <option value="live">Live session</option>
              </select>
            </div>
            {lessonDraft.kind !== "document" && (
              <div>
                <label htmlFor="lesson-url">{lessonDraft.kind === "video" ? "Video link" : "Meeting link"}</label>
                <input id="lesson-url" value={lessonDraft.url} onChange={(e) => setLessonDraft({ ...lessonDraft, url: e.target.value })} placeholder="https://" />
              </div>
            )}
            {lessonDraft.kind === "live" && (
              <div>
                <label htmlFor="lesson-when">Date and time</label>
                <input id="lesson-when" type="datetime-local" value={lessonDraft.scheduledAt} onChange={(e) => setLessonDraft({ ...lessonDraft, scheduledAt: e.target.value })} />
              </div>
            )}
            {lessonDraft.kind === "document" && (
              <div>
                <label htmlFor="lesson-file">Document</label>
                <input id="lesson-file" type="file" onChange={(e) => setLessonDraft({ ...lessonDraft, file: e.target.files?.[0] || null })} />
                {lessonDraft.existingFileName && (
                  <p className="mt-1 text-xs text-ink-600">Current file: {lessonDraft.existingFileName} (leave empty to keep it)</p>
                )}
              </div>
            )}
            <div>
              <label htmlFor="lesson-notes">Notes (optional)</label>
              <textarea id="lesson-notes" rows={2} value={lessonDraft.notes} onChange={(e) => setLessonDraft({ ...lessonDraft, notes: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button className="btn-primary" type="submit" disabled={busy}>{lessonDraft.id ? "Save lesson" : "Add lesson"}</button>
              <button type="button" className="btn-outline" onClick={() => setLessonDraft(null)}>Cancel</button>
            </div>
          </form>
        )}
      </section>

      {/* ---------------- Quiz ---------------- */}
      <section className="card" aria-labelledby="quiz-h">
        <div className="flex items-center justify-between gap-2">
          <h2 id="quiz-h" className="text-sm font-medium text-ink-900">Quiz questions ({questions.length})</h2>
          {!questionDraft && (
            <button type="button" className="btn-primary" onClick={() => setQuestionDraft(emptyQuestion())}>Add question</button>
          )}
        </div>
        <p className="mt-1 text-xs text-ink-600">Multiple choice — exactly one correct answer per question.</p>

        {questions.length === 0 && !questionDraft && <p className="mt-2 text-sm text-ink-600">No questions yet.</p>}

        <ol className="mt-3 space-y-2">
          {questions.map((q) => (
            <li key={q.id} className="rounded-card border border-soil-200 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">{q.position}. {q.prompt}</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-ink-600">
                    {q.options.map((o) => (
                      <li key={o.id}>{o.isCorrect ? "✓ " : "• "}{o.text}{o.isCorrect && <span className="sr-only"> (correct answer)</span>}</li>
                    ))}
                  </ul>
                  {q.explanation && <p className="mt-1 text-xs text-ink-600">Explanation: {q.explanation}</p>}
                </div>
                <div className="flex shrink-0 gap-2 text-xs">
                  <button type="button" aria-label={`Edit question ${q.position}`} onClick={() => startEditQuestion(q)} className="underline">Edit</button>
                  <button type="button" aria-label={`Delete question ${q.position}`} onClick={() => removeQuestion(q)} className="text-red-700 underline">Delete</button>
                </div>
              </div>
            </li>
          ))}
        </ol>

        {questionDraft && (
          <form onSubmit={saveQuestion} className="field mt-4 space-y-2 rounded-card border border-soil-200 p-3" aria-label={questionDraft.id ? "Edit question" : "New question"}>
            <div>
              <label htmlFor="q-prompt">Question</label>
              <textarea id="q-prompt" rows={2} value={questionDraft.prompt} onChange={(e) => setQuestionDraft({ ...questionDraft, prompt: e.target.value })} />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-xs text-ink-600">Answer options — select the correct one</legend>
              {questionDraft.options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input type="radio" name="correct" className="!w-auto" aria-label={`Option ${i + 1} is correct`} checked={o.isCorrect} onChange={() => chooseCorrect(i)} />
                  <input aria-label={`Option ${i + 1} text`} value={o.text} onChange={(e) => setOption(i, { text: e.target.value })} placeholder={`Option ${i + 1}`} />
                  {questionDraft.options.length > 2 && (
                    <button type="button" className="shrink-0 text-xs text-red-700 underline" aria-label={`Remove option ${i + 1}`}
                      onClick={() => setQuestionDraft((d) => ({ ...d, options: d.options.filter((_, idx) => idx !== i) }))}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {questionDraft.options.length < 6 && (
                <button type="button" className="text-xs underline" onClick={() => setQuestionDraft((d) => ({ ...d, options: [...d.options, { text: "", isCorrect: false }] }))}>
                  Add another option
                </button>
              )}
            </fieldset>
            <div>
              <label htmlFor="q-expl">Explanation shown after answering (optional)</label>
              <textarea id="q-expl" rows={2} value={questionDraft.explanation} onChange={(e) => setQuestionDraft({ ...questionDraft, explanation: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button className="btn-primary" type="submit" disabled={busy}>{questionDraft.id ? "Save question" : "Add question"}</button>
              <button type="button" className="btn-outline" onClick={() => setQuestionDraft(null)}>Cancel</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
