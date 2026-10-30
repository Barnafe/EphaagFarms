import fs from "node:fs";
import path from "node:path";
import { pool } from "../db/pool.js";
import { issueCertificateIfEligible } from "./corperCertificateController.js";
import { MATERIALS_DIR } from "../middleware/upload.js";
import { loadAccess } from "./corperPaymentController.js";
import { sendFileRef } from "../utils/fileRefs.js";
import {
  UUID_RE,
  summariseProgress,
  quizLock,
  liveHasStarted,
  isCourseEarned,
  validateAnswers,
  publicQuiz,
} from "../utils/corperLearning.js";

// ---------------------------------------------------------------------
// NYSC AGROALLIED SAED member learning (phase 4). Every route here sits behind
// requireCorperPaid (routes/corpers.js), so an unpaid or refunded member
// gets 402 PAYMENT_REQUIRED before any of this runs. What a member did is
// always stored; it only COUNTS while the access fee is paid (see
// summariseProgress in utils/corperLearning.js).
// ---------------------------------------------------------------------

function httpError(message, status = 400, clientCode = undefined, details = undefined) {
  return Object.assign(new Error(message), { status, clientCode, details });
}

function assertUuid(id, what = "Not found") {
  if (!UUID_RE.test(String(id))) throw httpError(what, 404);
}

// ---------------------------------------------------------------------
// The one progress query. One row per currently-live NYSC AGROALLIED SAED course for each
// requested member, with that member's counters joined in. The member
// screens, the admin Corps progress view and (later) the certificate and
// NYSC AGROALLIED SAED export all read progress through this + summariseProgress(), so
// they cannot disagree.
//
// "Live" = audience 'corps' AND approved. Lessons the member completed
// count only while that lesson still exists (a deleted lesson stops being
// part of the course; the completion itself is permanent in
// corper_course_progress.completed_at).
// ---------------------------------------------------------------------
export async function loadProgressRows(userIds, runner = pool) {
  const { rows } = await runner.query(
    `SELECT u.user_id, c.id AS course_id, c.title, c.description,
            (SELECT COUNT(*)::int FROM course_lessons l WHERE l.course_id = c.id) AS lesson_count,
            (SELECT COUNT(*)::int FROM course_quiz_questions q WHERE q.course_id = c.id) AS question_count,
            (SELECT COUNT(*)::int FROM corper_lesson_progress lp
               JOIN course_lessons l ON l.id = lp.lesson_id
              WHERE lp.user_id = u.user_id AND l.course_id = c.id) AS lessons_done,
            cp.attempts, cp.best_score, cp.last_score, cp.completed_at
     FROM unnest($1::uuid[]) AS u(user_id)
     CROSS JOIN courses c
     LEFT JOIN corper_course_progress cp ON cp.user_id = u.user_id AND cp.course_id = c.id
     WHERE c.audience = 'corps' AND c.approved = TRUE
     ORDER BY u.user_id, c.approved_at NULLS LAST, c.created_at, c.id`,
    [userIds]
  );
  return rows;
}

// One member's full progress summary (paid flag included).
export async function loadMemberProgress(userId, runner = pool) {
  const [rows, access] = await Promise.all([loadProgressRows([userId], runner), loadAccess(userId, runner)]);
  return summariseProgress(rows, access.paid);
}

// Finishing the last live course creates the (hidden) certificate. A
// certificate hiccup must never break the learning response.
async function maybeIssueCertificate(userId) {
  try {
    await issueCertificateIfEligible(userId);
  } catch (err) {
    console.error("[certificate] could not issue for", userId, err.message);
  }
}

const overallOf = (s) => ({ total: s.total, completed: s.completed, percent: s.percent });

// A live NYSC AGROALLIED SAED course by id, or 404. Draft/unapproved courses are invisible
// to members exactly as before.
async function loadLiveCourse(courseId, runner = pool) {
  assertUuid(courseId, "Course not found");
  const { rows } = await runner.query(
    `SELECT id, title, description FROM courses WHERE id = $1 AND audience = 'corps' AND approved = TRUE`,
    [courseId]
  );
  if (!rows[0]) throw httpError("Course not found", 404);
  return rows[0];
}

async function withTx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Makes sure the member's (user, course) progress row exists and locks it
// for the rest of the transaction. Everything that changes a member's
// progress for a course goes through this, so two tabs (or a double click)
// queue up instead of racing.
async function lockCourseProgress(client, userId, courseId) {
  await client.query(
    `INSERT INTO corper_course_progress (user_id, course_id) VALUES ($1, $2) ON CONFLICT (user_id, course_id) DO NOTHING`,
    [userId, courseId]
  );
  const { rows } = await client.query(
    `SELECT * FROM corper_course_progress WHERE user_id = $1 AND course_id = $2 FOR UPDATE`,
    [userId, courseId]
  );
  return rows[0];
}

async function countLessons(client, userId, courseId) {
  const { rows } = await client.query(
    `SELECT (SELECT COUNT(*)::int FROM course_lessons WHERE course_id = $2) AS lesson_count,
            (SELECT COUNT(*)::int FROM corper_lesson_progress lp
               JOIN course_lessons l ON l.id = lp.lesson_id
              WHERE lp.user_id = $1 AND l.course_id = $2) AS lessons_done`,
    [userId, courseId]
  );
  return rows[0];
}

// Stamps completed_at the first time the course is earned. Never cleared.
// Returns true only on the call that actually earned it.
async function stampCompletionIfEarned(client, userId, courseId) {
  const { rows } = await client.query(
    `SELECT attempts, completed_at FROM corper_course_progress WHERE user_id = $1 AND course_id = $2`,
    [userId, courseId]
  );
  const cp = rows[0];
  if (!cp || cp.completed_at) return false;
  const counts = await countLessons(client, userId, courseId);
  if (!isCourseEarned({ lessonCount: counts.lesson_count, lessonsDone: counts.lessons_done, attempts: cp.attempts })) {
    return false;
  }
  const { rowCount } = await client.query(
    `UPDATE corper_course_progress SET completed_at = now(), updated_at = now()
     WHERE user_id = $1 AND course_id = $2 AND completed_at IS NULL`,
    [userId, courseId]
  );
  return rowCount > 0;
}

// ---------------------------------------------------------------------
// GET /api/corpers/courses — my course list with status + overall %.
// ---------------------------------------------------------------------
export async function listMyCourses(req, res) {
  const s = await loadMemberProgress(req.user.id);
  res.json({ courses: s.courses, overall: overallOf(s), next: s.next });
}

// GET /api/corpers/progress — the dashboard's progress card.
export async function getMyProgress(req, res) {
  const s = await loadMemberProgress(req.user.id);
  res.json({ ...overallOf(s), next: s.next, courses: s.courses });
}

// ---------------------------------------------------------------------
// GET /api/corpers/courses/:id — lessons (with links / document flag) and
// the quiz status for one course.
// ---------------------------------------------------------------------
export async function getCourse(req, res) {
  const course = await loadLiveCourse(req.params.id);
  const userId = req.user.id;
  const [{ rows: lessons }, { rows: done }, { rows: nowRows }, summary] = await Promise.all([
    pool.query(`SELECT * FROM course_lessons WHERE course_id = $1 ORDER BY position, created_at`, [course.id]),
    pool.query(`SELECT lesson_id, completed_at FROM corper_lesson_progress WHERE user_id = $1 AND course_id = $2`, [
      userId,
      course.id,
    ]),
    pool.query(`SELECT now() AS now`),
    loadMemberProgress(userId),
  ]);
  const dbNow = nowRows[0].now;
  const doneAt = new Map(done.map((d) => [d.lesson_id, d.completed_at]));
  const mine = summary.courses.find((c) => c.id === course.id);
  if (!mine) throw httpError("Course not found", 404);

  res.json({
    course: { id: course.id, title: course.title, description: course.description },
    lessons: lessons.map((l) => {
      const completedAt = doneAt.get(l.id) || null;
      const started = l.kind !== "live" || liveHasStarted(l.scheduled_at, dbNow);
      return {
        id: l.id,
        position: l.position,
        title: l.title,
        kind: l.kind,
        url: l.kind === "document" ? null : l.url,
        hasFile: l.kind === "document" && !!l.file_name,
        fileName: l.original_name,
        scheduledAt: l.scheduled_at,
        notes: l.notes,
        completed: !!completedAt,
        completedAt,
        canComplete: started,
        availableAt: started ? null : l.scheduled_at,
      };
    }),
    progress: mine,
    quiz: {
      questionCount: mine.questionCount,
      locked: mine.quizLocked,
      lockedReason: mine.quizLockedReason,
      attempts: mine.attempts,
      bestScore: mine.bestScore,
      lastScore: mine.lastScore,
    },
    overall: overallOf(summary),
  });
}

// ---------------------------------------------------------------------
// POST /api/corpers/courses/:id/lessons/:lessonId/complete
// "Mark complete" is an honour system (videos and live sessions happen on
// other sites). A live session waits for its scheduled start.
// ---------------------------------------------------------------------
export async function completeLesson(req, res) {
  const course = await loadLiveCourse(req.params.id);
  assertUuid(req.params.lessonId, "Lesson not found");
  const userId = req.user.id;

  const { rows } = await pool.query(
    `SELECT l.id, l.title, l.kind, l.scheduled_at, now() AS db_now FROM course_lessons l WHERE l.id = $1 AND l.course_id = $2`,
    [req.params.lessonId, course.id]
  );
  const lesson = rows[0];
  if (!lesson) throw httpError("Lesson not found", 404);
  if (lesson.kind === "live" && !liveHasStarted(lesson.scheduled_at, lesson.db_now)) {
    throw httpError("This live session hasn't started yet — you can mark it complete once it begins.", 400, "LIVE_NOT_STARTED", {
      scheduledAt: lesson.scheduled_at,
    });
  }

  const justCompletedCourse = await withTx(async (client) => {
    await lockCourseProgress(client, userId, course.id);
    await client.query(
      `INSERT INTO corper_lesson_progress (user_id, course_id, lesson_id, lesson_title)
       VALUES ($1, $2, $3, $4) ON CONFLICT (user_id, lesson_id) DO NOTHING`,
      [userId, course.id, lesson.id, lesson.title]
    );
    return stampCompletionIfEarned(client, userId, course.id);
  });

  if (justCompletedCourse) await maybeIssueCertificate(userId);
  const summary = await loadMemberProgress(userId);
  res.json({
    lessonId: lesson.id,
    completed: true,
    course: summary.courses.find((c) => c.id === course.id) || null,
    overall: overallOf(summary),
    courseJustCompleted: justCompletedCourse,
  });
}

// ---------------------------------------------------------------------
// GET /api/corpers/courses/:id/lessons/:lessonId/file — the lesson's
// document. Behind the payment gate; the file itself is never served from
// a public /uploads path.
// ---------------------------------------------------------------------
export async function downloadLessonFile(req, res) {
  const course = await loadLiveCourse(req.params.id);
  assertUuid(req.params.lessonId, "Lesson not found");
  const { rows } = await pool.query(
    `SELECT kind, file_name, original_name FROM course_lessons WHERE id = $1 AND course_id = $2`,
    [req.params.lessonId, course.id]
  );
  const lesson = rows[0];
  if (!lesson || lesson.kind !== "document" || !lesson.file_name) {
    throw httpError("No document on this lesson", 404);
  }
  await sendFileRef(res, lesson.file_name, { legacyDir: MATERIALS_DIR, download: true, filename: lesson.original_name });
}

// ---------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------
async function loadQuizQuestions(runner, courseId) {
  const [{ rows: qs }, { rows: opts }] = await Promise.all([
    runner.query(`SELECT id, prompt, explanation FROM course_quiz_questions WHERE course_id = $1 ORDER BY position, created_at`, [
      courseId,
    ]),
    runner.query(
      `SELECT o.id, o.question_id, o.text, o.is_correct
       FROM course_quiz_options o JOIN course_quiz_questions q ON q.id = o.question_id
       WHERE q.course_id = $1 ORDER BY o.position`,
      [courseId]
    ),
  ]);
  return qs.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    explanation: q.explanation,
    options: opts
      .filter((o) => o.question_id === q.id)
      .map((o) => ({ id: o.id, text: o.text, isCorrect: o.is_correct })),
  }));
}

function mapReview(answerRows) {
  return answerRows
    .slice()
    .sort((a, b) => a.display_position - b.display_position)
    .map((a) => ({
      position: a.display_position,
      prompt: a.prompt,
      chosenText: a.chosen_text,
      correctText: a.correct_text,
      isCorrect: a.is_correct,
      explanation: a.explanation,
    }));
}

function mapAttempt(a) {
  return {
    id: a.id,
    attemptNo: a.attempt_no,
    score: a.score,
    correctCount: a.correct_count,
    total: a.total_questions,
    submittedAt: a.submitted_at,
  };
}

// GET /api/corpers/courses/:id/quiz — questions WITHOUT the answers (and
// without explanations, which usually give the answer away). Order of the
// questions and of each question's options is shuffled on every request.
export async function getQuiz(req, res) {
  const course = await loadLiveCourse(req.params.id);
  const userId = req.user.id;
  const [counts, questions, { rows: cp }] = await Promise.all([
    countLessons(pool, userId, course.id),
    loadQuizQuestions(pool, course.id),
    pool.query(`SELECT attempts, best_score FROM corper_course_progress WHERE user_id = $1 AND course_id = $2`, [
      userId,
      course.id,
    ]),
  ]);
  const lock = quizLock({ lessonCount: counts.lesson_count, lessonsDone: counts.lessons_done });
  if (lock.locked) throw httpError(lock.reason, 403, "QUIZ_LOCKED", { remaining: lock.remaining });
  if (!questions.length) throw httpError("This course has no quiz questions yet", 404, "NO_QUIZ");

  res.json({
    course: { id: course.id, title: course.title },
    questions: publicQuiz(questions),
    attempts: cp[0]?.attempts || 0,
    bestScore: cp[0]?.best_score ?? null,
  });
}

// POST /api/corpers/courses/:id/quiz/attempts
// body: { answers: [{ questionId, optionId }], clientToken? }
// Graded entirely here. clientToken makes a double-clicked Submit (or the
// same quiz sent from two tabs) record ONE attempt, not two.
export async function submitQuiz(req, res) {
  const course = await loadLiveCourse(req.params.id);
  const userId = req.user.id;
  const body = req.body || {};
  let clientToken = null;
  if (body.clientToken !== undefined && body.clientToken !== null) {
    clientToken = String(body.clientToken).trim();
    if (!clientToken || clientToken.length > 64) {
      throw httpError("clientToken must be 1-64 characters", 400, "INVALID_SUBMISSION");
    }
  }

  const outcome = await withTx(async (client) => {
    const cp = await lockCourseProgress(client, userId, course.id);

    // Same submission arriving twice: hand back the attempt already saved.
    if (clientToken) {
      const { rows } = await client.query(
        `SELECT * FROM corper_quiz_attempts WHERE user_id = $1 AND course_id = $2 AND client_token = $3`,
        [userId, course.id, clientToken]
      );
      if (rows[0]) {
        const { rows: answers } = await client.query(`SELECT * FROM corper_quiz_answers WHERE attempt_id = $1`, [rows[0].id]);
        return { attempt: rows[0], review: mapReview(answers), duplicate: true, justCompleted: false };
      }
    }

    const counts = await countLessons(client, userId, course.id);
    const lock = quizLock({ lessonCount: counts.lesson_count, lessonsDone: counts.lessons_done });
    if (lock.locked) throw httpError(lock.reason, 403, "QUIZ_LOCKED", { remaining: lock.remaining });

    const questions = await loadQuizQuestions(client, course.id);
    const result = validateAnswers(questions, body.answers);
    if (result.error) throw httpError(result.error.message, 400, result.error.code);
    const { score, correctCount, total, items } = result.graded;

    const attemptNo = (cp.attempts || 0) + 1;
    const { rows: inserted } = await client.query(
      `INSERT INTO corper_quiz_attempts (user_id, course_id, attempt_no, score, correct_count, total_questions, client_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [userId, course.id, attemptNo, score, correctCount, total, clientToken]
    );
    const attempt = inserted[0];

    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      await client.query(
        `INSERT INTO corper_quiz_answers
           (attempt_id, display_position, question_id, prompt, explanation, chosen_option_id, chosen_text, correct_text, is_correct)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [attempt.id, i + 1, it.questionId, it.prompt, it.explanation, it.chosenOptionId, it.chosenText, it.correctText, it.isCorrect]
      );
    }

    await client.query(
      `UPDATE corper_course_progress
       SET attempts = $3,
           best_score = GREATEST(COALESCE(best_score, 0), $4),
           last_score = $4,
           updated_at = now()
       WHERE user_id = $1 AND course_id = $2`,
      [userId, course.id, attemptNo, score]
    );
    const justCompleted = await stampCompletionIfEarned(client, userId, course.id);

    const review = items.map((it, i) => ({
      position: i + 1,
      prompt: it.prompt,
      chosenText: it.chosenText,
      correctText: it.correctText,
      isCorrect: it.isCorrect,
      explanation: it.explanation,
    }));
    return { attempt, review, duplicate: false, justCompleted };
  });

  if (outcome.justCompleted) await maybeIssueCertificate(userId);
  const summary = await loadMemberProgress(userId);
  const mine = summary.courses.find((c) => c.id === course.id) || null;
  res.status(outcome.duplicate ? 200 : 201).json({
    attempt: mapAttempt(outcome.attempt),
    review: outcome.review,
    duplicate: outcome.duplicate,
    course: mine,
    overall: overallOf(summary),
    courseJustCompleted: outcome.justCompleted,
  });
}

// GET /api/corpers/courses/:id/quiz/attempts — my attempts, newest first.
export async function listAttempts(req, res) {
  const course = await loadLiveCourse(req.params.id);
  const { rows } = await pool.query(
    `SELECT * FROM corper_quiz_attempts WHERE user_id = $1 AND course_id = $2 ORDER BY attempt_no DESC LIMIT 100`,
    [req.user.id, course.id]
  );
  res.json({ attempts: rows.map(mapAttempt) });
}

// GET /api/corpers/courses/:id/quiz/attempts/:attemptId — one of MY
// attempts with its per-question review. Another member's id is simply
// "not found".
export async function getAttempt(req, res) {
  const course = await loadLiveCourse(req.params.id);
  assertUuid(req.params.attemptId, "Attempt not found");
  const { rows } = await pool.query(
    `SELECT * FROM corper_quiz_attempts WHERE id = $1 AND user_id = $2 AND course_id = $3`,
    [req.params.attemptId, req.user.id, course.id]
  );
  if (!rows[0]) throw httpError("Attempt not found", 404);
  const { rows: answers } = await pool.query(`SELECT * FROM corper_quiz_answers WHERE attempt_id = $1`, [rows[0].id]);
  res.json({ attempt: mapAttempt(rows[0]), review: mapReview(answers) });
}
