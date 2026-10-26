// Run:  node --test backend/test/corperLearning.test.mjs   (no database needed)
import test from "node:test";
import assert from "node:assert/strict";
import {
  percentOf, shuffled, liveHasStarted, quizLock, courseStatus, isCourseEarned,
  summariseProgress, validateAnswers, publicQuiz,
} from "../src/utils/corperLearning.js";

let n = 0;
const uid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

function makeQuiz(count = 4, optionsEach = 4, correctIdx = 0) {
  return Array.from({ length: count }, (_, i) => {
    const id = uid();
    return {
      id, prompt: `Question ${i + 1}`, explanation: `Because ${i + 1}`,
      options: Array.from({ length: optionsEach }, (_, k) => ({ id: uid(), text: `Q${i + 1} option ${k + 1}`, isCorrect: k === correctIdx })),
    };
  });
}
const answersFor = (quiz, pick) => quiz.map((q, i) => ({ questionId: q.id, optionId: q.options[pick(q, i)].id }));
const right = (q) => q.options.findIndex((o) => o.isCorrect);
const wrong = (q) => (right(q) + 1) % q.options.length;

// ---- percentage math -------------------------------------------------
test("percent: 5 courses, each adds 20%", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map((c) => percentOf(c, 5)), [0, 20, 40, 60, 80, 100]);
});
test("percent: 1, 2 and 3 courses", () => {
  assert.deepEqual([0, 1].map((c) => percentOf(c, 1)), [0, 100]);
  assert.deepEqual([0, 1, 2].map((c) => percentOf(c, 2)), [0, 50, 100]);
  assert.deepEqual([0, 1, 2, 3].map((c) => percentOf(c, 3)), [0, 33, 67, 100]);
});
test("percent: never NaN, negative or above 100", () => {
  assert.equal(percentOf(0, 0), 0);
  assert.equal(percentOf(3, 0), 0);
  assert.equal(percentOf(7, 5), 100);
  assert.equal(percentOf(-1, 5), 0);
  assert.equal(percentOf(undefined, 5), 0);
});
test("percent drops when a course is added (5 done of 5 -> 5 of 6)", () => {
  assert.equal(percentOf(5, 5), 100);
  assert.equal(percentOf(5, 6), 83);
});

// ---- course status / earning ----------------------------------------
test("course earned only when ALL lessons done AND quiz submitted at least once", () => {
  assert.equal(isCourseEarned({ lessonCount: 4, lessonsDone: 4, attempts: 1 }), true);
  assert.equal(isCourseEarned({ lessonCount: 4, lessonsDone: 4, attempts: 0 }), false);
  assert.equal(isCourseEarned({ lessonCount: 4, lessonsDone: 3, attempts: 2 }), false);
});
test("status labels", () => {
  assert.equal(courseStatus({ lessonsDone: 0, attempts: 0, completedAt: null }), "not_started");
  assert.equal(courseStatus({ lessonsDone: 2, attempts: 0, completedAt: null }), "in_progress");
  assert.equal(courseStatus({ lessonsDone: 4, attempts: 1, completedAt: "2026-10-21" }), "completed");
});

// ---- lessons before quiz --------------------------------------------
test("quiz locked until every lesson is done", () => {
  const l = quizLock({ lessonCount: 4, lessonsDone: 2 });
  assert.equal(l.locked, true);
  assert.match(l.reason, /2 lessons left/);
  assert.equal(quizLock({ lessonCount: 4, lessonsDone: 3 }).reason, "Finish all lessons first — 1 lesson left.");
  assert.equal(quizLock({ lessonCount: 4, lessonsDone: 4 }).locked, false);
});

// ---- live session time rule -----------------------------------------
test("live session cannot be completed before it starts", () => {
  const now = new Date("2026-10-21T10:00:00Z");
  assert.equal(liveHasStarted("2026-10-21T10:00:01Z", now), false);
  assert.equal(liveHasStarted("2026-10-21T10:00:00Z", now), true);
  assert.equal(liveHasStarted("2026-10-20T10:00:00Z", now), true);
  assert.equal(liveHasStarted(null, now), true); // no schedule to judge by
});

// ---- grading ---------------------------------------------------------
test("grading: all right = 100", () => {
  const quiz = makeQuiz(5);
  const r = validateAnswers(quiz, answersFor(quiz, right));
  assert.equal(r.graded.score, 100);
  assert.equal(r.graded.correctCount, 5);
});
test("grading: all wrong = 0", () => {
  const quiz = makeQuiz(5);
  const r = validateAnswers(quiz, answersFor(quiz, wrong));
  assert.equal(r.graded.score, 0);
  assert.ok(r.graded.items.every((i) => !i.isCorrect));
});
test("grading: partial (3 of 4 = 75, 1 of 3 = 33)", () => {
  const q4 = makeQuiz(4);
  assert.equal(validateAnswers(q4, answersFor(q4, (q, i) => (i === 0 ? wrong(q) : right(q)))).graded.score, 75);
  const q3 = makeQuiz(3);
  assert.equal(validateAnswers(q3, answersFor(q3, (q, i) => (i === 0 ? right(q) : wrong(q)))).graded.score, 33);
});
test("grading keeps the order the member saw and copies text + explanation", () => {
  const quiz = makeQuiz(3);
  const reversed = answersFor(quiz, right).reverse();
  const r = validateAnswers(quiz, reversed);
  assert.deepEqual(r.graded.items.map((i) => i.prompt), ["Question 3", "Question 2", "Question 1"]);
  assert.equal(r.graded.items[0].explanation, "Because 3");
  assert.equal(r.graded.items[0].correctText, "Q3 option 1");
});

// ---- malformed / hostile submissions --------------------------------
test("rejects malformed submissions", () => {
  const quiz = makeQuiz(3);
  const full = answersFor(quiz, right);
  const code = (answers) => validateAnswers(quiz, answers).error?.code;
  assert.equal(code(undefined), "INVALID_SUBMISSION");
  assert.equal(code("nope"), "INVALID_SUBMISSION");
  assert.equal(code([]), "INVALID_SUBMISSION");
  assert.equal(code([null]), "INVALID_SUBMISSION");
  assert.equal(code([{ questionId: 5, optionId: 6 }]), "INVALID_SUBMISSION");
  assert.equal(code([{ questionId: "x", optionId: "y" }]), "INVALID_SUBMISSION");
  assert.equal(code(full.slice(0, 2)), "INCOMPLETE");
  assert.equal(code([...full, full[0]]), "DUPLICATE_ANSWER");
  assert.equal(code(Array(500).fill(full[0])), "INVALID_SUBMISSION");
});
test("rejects questions and options from another course / question", () => {
  const quiz = makeQuiz(3);
  const other = makeQuiz(3);
  const full = answersFor(quiz, right);
  // a question that isn't in this course
  assert.equal(validateAnswers(quiz, [full[0], full[1], { questionId: other[0].id, optionId: other[0].options[0].id }]).error.code, "UNKNOWN_QUESTION");
  // right question, option from a different question
  assert.equal(validateAnswers(quiz, [full[0], full[1], { questionId: quiz[2].id, optionId: quiz[0].options[0].id }]).error.code, "UNKNOWN_OPTION");
  // option from another course entirely
  assert.equal(validateAnswers(quiz, [full[0], full[1], { questionId: quiz[2].id, optionId: other[2].options[0].id }]).error.code, "UNKNOWN_OPTION");
});
test("a course with no questions can't be graded", () => {
  assert.equal(validateAnswers([], [{ questionId: uid(), optionId: uid() }]).error.code, "NO_QUIZ");
});
test("question edited after the member loaded the quiz -> option no longer belongs", () => {
  const quiz = makeQuiz(2);
  const stale = answersFor(quiz, right);
  const edited = quiz.map((q, i) => (i === 0 ? { ...q, options: q.options.map((o) => ({ ...o, id: uid() })) } : q));
  assert.equal(validateAnswers(edited, stale).error.code, "UNKNOWN_OPTION");
});

// ---- no answer leakage ----------------------------------------------
test("publicQuiz never exposes correct answers or explanations", () => {
  const quiz = makeQuiz(6);
  const json = JSON.stringify(publicQuiz(quiz));
  assert.ok(!/isCorrect|is_correct|correct|explanation|Because/i.test(json), json.slice(0, 200));
  for (const q of publicQuiz(quiz)) assert.deepEqual(Object.keys(q).sort(), ["id", "options", "prompt"]);
});
test("publicQuiz keeps every question and option, just reordered", () => {
  const quiz = makeQuiz(6);
  const pub = publicQuiz(quiz);
  assert.deepEqual(pub.map((q) => q.id).sort(), quiz.map((q) => q.id).sort());
  for (const q of pub) {
    const orig = quiz.find((x) => x.id === q.id);
    assert.deepEqual(q.options.map((o) => o.id).sort(), orig.options.map((o) => o.id).sort());
  }
});
test("shuffle is a permutation and actually reorders", () => {
  const a = Array.from({ length: 30 }, (_, i) => i);
  const s = shuffled(a);
  assert.deepEqual([...s].sort((x, y) => x - y), a);
  assert.notDeepEqual(s, a);
  assert.deepEqual(a, Array.from({ length: 30 }, (_, i) => i)); // input untouched
});

// ---- progress summary (the one function every screen uses) ----------
const row = (o = {}) => ({
  course_id: uid(), title: "C", description: null, lesson_count: 4, question_count: 5,
  lessons_done: 0, attempts: 0, best_score: null, last_score: null, completed_at: null, ...o,
});
test("summary: 2 of 5 courses complete = 40%, quiz score irrelevant", () => {
  const rows = [row({ completed_at: "x", best_score: 10, lessons_done: 4, attempts: 1 }), row({ completed_at: "x", best_score: 100, lessons_done: 4, attempts: 3 }), row(), row(), row()];
  const s = summariseProgress(rows, true);
  assert.equal(s.percent, 40);
  assert.equal(s.completed, 2);
  assert.equal(s.total, 5);
});
test("summary: unpaid / refunded counts as 0% but the record is kept", () => {
  const rows = [row({ completed_at: "x", lessons_done: 4, attempts: 1 }), row()];
  const unpaid = summariseProgress(rows, false);
  assert.equal(unpaid.percent, 0);
  assert.equal(unpaid.completed, 0);
  assert.equal(unpaid.recordedCompleted, 1);
  assert.equal(unpaid.next, null);
  // pays again -> old progress comes back
  assert.equal(summariseProgress(rows, true).percent, 50);
});
test("summary: next = in-progress course first, else first not-started", () => {
  const a = row({ completed_at: "x", lessons_done: 4, attempts: 1 });
  const b = row();
  const c = row({ lessons_done: 2 });
  assert.equal(summariseProgress([a, b, c], true).next.id, c.course_id);
  assert.equal(summariseProgress([a, b], true).next.id, b.course_id);
  assert.equal(summariseProgress([a], true).next, null);
});
test("summary: lessons_done never exceeds lesson_count (a lesson was deleted)", () => {
  const s = summariseProgress([row({ lesson_count: 3, lessons_done: 5 })], true);
  assert.equal(s.courses[0].lessonsDone, 3);
  assert.equal(s.courses[0].quizLocked, false);
});
test("summary: a completed course stays completed after lessons are added", () => {
  const s = summariseProgress([row({ completed_at: "x", lesson_count: 6, lessons_done: 4, attempts: 1 })], true);
  assert.equal(s.courses[0].completed, true);
  assert.equal(s.percent, 100);
});
test("summary: no live courses = 0%, not NaN", () => {
  const s = summariseProgress([], true);
  assert.equal(s.percent, 0);
  assert.equal(s.total, 0);
});
test("summary: all 5 completed = 100%", () => {
  const rows = Array.from({ length: 5 }, () => row({ completed_at: "x", lessons_done: 4, attempts: 1 }));
  assert.equal(summariseProgress(rows, true).percent, 100);
});
