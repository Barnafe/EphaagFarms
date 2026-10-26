// ---------------------------------------------------------------------
// Corps learning rules (phase 4) — PURE functions only, no database.
// Everything that decides a number or a verdict lives here so it can be
// tested on its own, and so the member dashboard, the admin screens and
// (later) the certificate and NYSC export all call the very same code:
//
//   percentOf()         dashboard % = courses completed / live corps courses
//   summariseProgress() one member's course list + totals from SQL rows
//   validateAnswers()   checks a quiz submission and grades it
//   quizLock()          lessons-before-quiz rule
//   liveHasStarted()    a live session can only be marked done once started
//
// Business rules (founder, 2026-10-21):
//   * A course is complete when EVERY lesson is marked done AND the quiz has
//     been submitted at least once. Once earned, completion is permanent.
//   * Quiz score is out of 100, belongs to that course alone, and never
//     changes the dashboard percentage.
//   * An unpaid or refunded member's progress does not count (it is kept,
//     and counts again if they pay again).
// ---------------------------------------------------------------------

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Founder's decisions for phase 4 — kept as named switches so the rule is
// visible in one place.
export const RULES = {
  lessonsBeforeQuiz: true, // every lesson must be done before the quiz opens
  liveCompleteOnlyAfterStart: true, // "Mark complete" on a live session waits for its start time
  shuffleQuiz: true, // shuffle question order and option order on every attempt
};

// Dashboard percentage. Whole numbers; 0 when there are no live courses
// (never NaN / Infinity) and never above 100.
export function percentOf(completed, total) {
  const c = Number(completed);
  const t = Number(total);
  if (!Number.isFinite(c) || !Number.isFinite(t) || t <= 0 || c <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((c / t) * 100)));
}

// Fisher-Yates. Returns a NEW array; `rng` is injectable for tests.
export function shuffled(items, rng = Math.random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A live session can only be marked complete once it has started. A live
// lesson with no scheduled time can't be judged, so it is allowed.
export function liveHasStarted(scheduledAt, now = new Date()) {
  if (!RULES.liveCompleteOnlyAfterStart) return true;
  if (!scheduledAt) return true;
  const t = new Date(scheduledAt).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() >= t;
}

// The quiz opens only when every lesson is done.
export function quizLock({ lessonCount, lessonsDone }) {
  if (!RULES.lessonsBeforeQuiz) return { locked: false, reason: null };
  const remaining = Math.max(0, Number(lessonCount) - Number(lessonsDone));
  if (remaining > 0) {
    return {
      locked: true,
      remaining,
      reason: `Finish all lessons first — ${remaining} lesson${remaining === 1 ? "" : "s"} left.`,
    };
  }
  return { locked: false, remaining: 0, reason: null };
}

export function courseStatus({ lessonsDone, attempts, completedAt }) {
  if (completedAt) return "completed";
  if (Number(lessonsDone) > 0 || Number(attempts) > 0) return "in_progress";
  return "not_started";
}

// Has this member earned the course? (all lessons done + quiz submitted
// at least once). The caller stores completed_at the first time this is
// true and never clears it.
export function isCourseEarned({ lessonCount, lessonsDone, attempts }) {
  return Number(lessonsDone) >= Number(lessonCount) && Number(attempts) >= 1;
}

// ---------------------------------------------------------------------
// One member's progress. `rows` come from loadProgressRows() (one row per
// currently-live corps course, with this member's counters joined in).
// `paid` is whether the access fee is paid right now.
// ---------------------------------------------------------------------
export function summariseProgress(rows, paid) {
  const courses = rows.map((r) => {
    const lessonCount = Number(r.lesson_count) || 0;
    const lessonsDone = Math.min(Number(r.lessons_done) || 0, lessonCount);
    const attempts = Number(r.attempts) || 0;
    const completedAt = r.completed_at || null;
    const lock = quizLock({ lessonCount, lessonsDone });
    return {
      id: r.course_id,
      title: r.title,
      description: r.description,
      lessonCount,
      lessonsDone,
      questionCount: Number(r.question_count) || 0,
      attempts,
      bestScore: r.best_score === null || r.best_score === undefined ? null : Number(r.best_score),
      lastScore: r.last_score === null || r.last_score === undefined ? null : Number(r.last_score),
      completed: !!completedAt,
      completedAt,
      status: courseStatus({ lessonsDone, attempts, completedAt }),
      quizLocked: lock.locked,
      quizLockedReason: lock.reason,
    };
  });

  const total = courses.length;
  const recordedCompleted = courses.filter((c) => c.completed).length;
  // Unpaid / refunded: what they did is kept but does not count.
  const completed = paid ? recordedCompleted : 0;
  const percent = percentOf(completed, total);

  const next = paid
    ? courses.find((c) => c.status === "in_progress") || courses.find((c) => c.status === "not_started") || null
    : null;

  return { paid: !!paid, total, completed, recordedCompleted, percent, courses, next };
}

// ---------------------------------------------------------------------
// Quiz submission: validate, then grade. `questions` is the course's
// CURRENT quiz as loaded from the database:
//   [{ id, prompt, explanation, options: [{ id, text, isCorrect }] }]
// `answers` is req.body.answers: [{ questionId, optionId }] in the order
// the member saw the questions (kept for the review).
//
// Returns { error: { message, code } } or { graded: {...} }. The server
// does all the grading — the browser never sees which option is correct
// until after submitting.
// ---------------------------------------------------------------------
export function validateAnswers(questions, answers) {
  const fail = (message, code) => ({ error: { message, code } });

  if (!Array.isArray(questions) || questions.length === 0) {
    return fail("This course has no quiz questions", "NO_QUIZ");
  }
  if (!Array.isArray(answers) || answers.length === 0) {
    return fail("Send your answers as a list of { questionId, optionId }", "INVALID_SUBMISSION");
  }
  if (answers.length > questions.length * 2 + 20) {
    return fail("Too many answers were sent", "INVALID_SUBMISSION");
  }

  const byQuestion = new Map(questions.map((q) => [q.id, q]));
  const seen = new Set();
  const items = [];

  for (const a of answers) {
    if (!a || typeof a !== "object" || typeof a.questionId !== "string" || typeof a.optionId !== "string") {
      return fail("Each answer needs a questionId and an optionId", "INVALID_SUBMISSION");
    }
    const qid = a.questionId.trim().toLowerCase();
    const oid = a.optionId.trim().toLowerCase();
    if (!UUID_RE.test(qid) || !UUID_RE.test(oid)) {
      return fail("Each answer needs a valid questionId and optionId", "INVALID_SUBMISSION");
    }
    if (seen.has(qid)) return fail("A question was answered twice", "DUPLICATE_ANSWER");
    seen.add(qid);

    const q = byQuestion.get(qid);
    if (!q) {
      return fail("One of the questions is not part of this course's quiz — reload the quiz and try again", "UNKNOWN_QUESTION");
    }
    const chosen = q.options.find((o) => o.id === oid);
    if (!chosen) {
      return fail("One of the chosen answers does not belong to its question — reload the quiz and try again", "UNKNOWN_OPTION");
    }
    const correct = q.options.find((o) => o.isCorrect);
    items.push({
      questionId: q.id,
      prompt: q.prompt,
      explanation: q.explanation || null,
      chosenOptionId: chosen.id,
      chosenText: chosen.text,
      correctOptionId: correct ? correct.id : null,
      correctText: correct ? correct.text : "",
      isCorrect: !!chosen.isCorrect,
    });
  }

  if (seen.size !== questions.length) {
    const left = questions.length - seen.size;
    return fail(`Answer every question before submitting (${left} left)`, "INCOMPLETE");
  }

  const correctCount = items.filter((i) => i.isCorrect).length;
  const total = questions.length;
  const score = Math.round((correctCount / total) * 100);
  return { graded: { score, correctCount, total, items } };
}

// What a member may see of a quiz BEFORE submitting: prompt and option
// text only. Never is_correct, never the explanation (it often gives the
// answer away). Question and option order is shuffled per request.
export function publicQuiz(questions, rng = Math.random) {
  const qs = RULES.shuffleQuiz ? shuffled(questions, rng) : questions;
  return qs.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    options: (RULES.shuffleQuiz ? shuffled(q.options, rng) : q.options).map((o) => ({ id: o.id, text: o.text })),
  }));
}
