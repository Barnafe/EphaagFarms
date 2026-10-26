import fs from "node:fs";
import path from "node:path";
import { pool } from "../db/pool.js";
import { MATERIALS_DIR } from "../middleware/upload.js";
import { sendFileRef, discardFileRef } from "../utils/fileRefs.js";

// ---------------------------------------------------------------------
// Corps training content (admin side) — lessons + one quiz per course.
// Only courses with audience = 'corps' carry lessons/quiz questions; the
// general (farmer "Seminar") courses keep their single-material model.
// Everything here is admin-only (see routes/rtc.js). The corps-member
// side (viewing lessons, taking the quiz, progress) arrives in a later
// phase, behind the payment gate.
// ---------------------------------------------------------------------

const LESSON_KINDS = ["video", "document", "live"];
const MAX_OPTIONS = 6;

function isHttpUrl(value) {
  try {
    const u = new URL(String(value).trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function removeStoredFile(fileName) {
  if (!fileName) return;
  discardFileRef(fileName, MATERIALS_DIR);
}

function mapLesson(l) {
  return {
    id: l.id,
    courseId: l.course_id,
    position: l.position,
    title: l.title,
    kind: l.kind,
    url: l.url,
    hasFile: !!l.file_name,
    fileName: l.original_name,
    scheduledAt: l.scheduled_at,
    notes: l.notes,
  };
}

function mapQuestion(q, options) {
  return {
    id: q.id,
    courseId: q.course_id,
    position: q.position,
    prompt: q.prompt,
    explanation: q.explanation,
    options: options
      .filter((o) => o.question_id === q.id)
      .sort((a, b) => a.position - b.position)
      .map((o) => ({ id: o.id, text: o.text, isCorrect: o.is_correct })),
  };
}

// Looks up a course and makes sure it is a corps course. Sends the error
// response itself and returns null when it isn't usable.
async function requireCorpsCourse(db, id, res) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    res.status(404).json({ error: "Course not found" });
    return null;
  }
  const { rows } = await db.query(`SELECT id, audience, approved FROM courses WHERE id = $1`, [id]);
  const course = rows[0];
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return null;
  }
  if (course.audience !== "corps") {
    res.status(400).json({ error: "Lessons and quizzes belong to Corps courses only" });
    return null;
  }
  return course;
}

async function renumber(db, table, courseId) {
  await db.query(
    `UPDATE ${table} t SET position = r.rn
     FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY position, created_at, id) AS rn
           FROM ${table} WHERE course_id = $1) r
     WHERE t.id = r.id`,
    [courseId]
  );
}

// Runs fn(client) inside a transaction holding a row lock on the course,
// so two admins editing the same course's order/positions can't interleave.
async function withCourseLock(courseId, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM courses WHERE id = $1 FOR UPDATE`, [courseId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------
// GET /rtc/admin/courses/:id/content — everything the editor needs.
// ---------------------------------------------------------------------
export async function adminGetCourseContent(req, res) {
  const course = await requireCorpsCourse(pool, req.params.id, res);
  if (!course) return;
  const [{ rows: lessons }, { rows: questions }, { rows: options }, { rows: courseRows }] = await Promise.all([
    pool.query(`SELECT * FROM course_lessons WHERE course_id = $1 ORDER BY position, created_at`, [course.id]),
    pool.query(`SELECT * FROM course_quiz_questions WHERE course_id = $1 ORDER BY position, created_at`, [course.id]),
    pool.query(
      `SELECT o.* FROM course_quiz_options o
       JOIN course_quiz_questions q ON q.id = o.question_id WHERE q.course_id = $1`,
      [course.id]
    ),
    pool.query(`SELECT id, title, description, approved FROM courses WHERE id = $1`, [course.id]),
  ]);
  res.json({
    course: courseRows[0],
    lessons: lessons.map(mapLesson),
    questions: questions.map((q) => mapQuestion(q, options)),
  });
}

// ---------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------
function parseLesson(body, file, existing) {
  const title = String(body.title ?? existing?.title ?? "").trim();
  const kind = String(body.kind ?? existing?.kind ?? "").trim();
  if (!title) return { error: "Lesson title is required" };
  if (title.length > 200) return { error: "Lesson title is too long (max 200 characters)" };
  if (!LESSON_KINDS.includes(kind)) return { error: "Lesson type must be video, document or live" };

  const notesRaw = body.notes !== undefined ? String(body.notes).trim() : existing?.notes ?? "";
  if (notesRaw.length > 2000) return { error: "Notes are too long (max 2000 characters)" };

  const out = { title, kind, notes: notesRaw || null, url: null, scheduledAt: null };

  if (kind === "video" || kind === "live") {
    const url = String(body.url ?? (existing?.kind === kind ? existing?.url : "") ?? "").trim();
    if (!url) return { error: kind === "video" ? "A video link is required" : "A live session link is required" };
    if (!isHttpUrl(url)) return { error: "The link must start with http:// or https://" };
    out.url = url;
  }

  if (kind === "live") {
    const raw = body.scheduledAt ?? (existing?.kind === "live" ? existing?.scheduled_at?.toISOString?.() : "") ?? "";
    if (!String(raw).trim()) return { error: "A date and time is required for a live session" };
    if (Number.isNaN(Date.parse(String(raw)))) return { error: "The live session date is not valid" };
    out.scheduledAt = String(raw);
  }

  if (kind === "document") {
    const hasExistingFile = existing?.kind === "document" && existing?.file_name;
    if (!file && !hasExistingFile) return { error: "Upload a document (PDF, Word, PowerPoint or image)" };
  }

  return { values: out };
}

export async function adminAddLesson(req, res) {
  const course = await requireCorpsCourse(pool, req.params.id, res);
  if (!course) {
    removeStoredFile(req.file?.filename);
    return;
  }
  const { values, error } = parseLesson(req.body || {}, req.file, null);
  if (error) {
    removeStoredFile(req.file?.filename);
    return res.status(400).json({ error });
  }
  if (values.kind !== "document" && req.file) removeStoredFile(req.file.filename);
  const file = values.kind === "document" ? req.file : null;

  try {
    const lesson = await withCourseLock(course.id, async (db) => {
      const { rows: pos } = await db.query(
        `SELECT COALESCE(MAX(position), 0) + 1 AS next FROM course_lessons WHERE course_id = $1`,
        [course.id]
      );
      const { rows } = await db.query(
        `INSERT INTO course_lessons (course_id, position, title, kind, url, file_name, original_name, scheduled_at, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [course.id, pos[0].next, values.title, values.kind, values.url, file?.filename ?? null,
         file ? file.originalname : null, values.scheduledAt, values.notes]
      );
      return rows[0];
    });
    res.status(201).json({ lesson: mapLesson(lesson) });
  } catch (err) {
    removeStoredFile(file?.filename);
    throw err;
  }
}

export async function adminUpdateLesson(req, res) {
  const course = await requireCorpsCourse(pool, req.params.id, res);
  if (!course) {
    removeStoredFile(req.file?.filename);
    return;
  }
  const { rows: found } = await pool.query(`SELECT * FROM course_lessons WHERE id = $1 AND course_id = $2`, [
    req.params.lessonId,
    course.id,
  ]).catch(() => ({ rows: [] }));
  const existing = found[0];
  if (!existing) {
    removeStoredFile(req.file?.filename);
    return res.status(404).json({ error: "Lesson not found" });
  }
  const { values, error } = parseLesson(req.body || {}, req.file, existing);
  if (error) {
    removeStoredFile(req.file?.filename);
    return res.status(400).json({ error });
  }

  let fileName = existing.file_name;
  let originalName = existing.original_name;
  if (values.kind === "document") {
    if (req.file) {
      fileName = req.file.filename;
      originalName = req.file.originalname;
    }
  } else {
    fileName = null;
    originalName = null;
    removeStoredFile(req.file?.filename);
  }

  const { rows } = await pool.query(
    `UPDATE course_lessons SET title=$1, kind=$2, url=$3, file_name=$4, original_name=$5, scheduled_at=$6, notes=$7
     WHERE id=$8 RETURNING *`,
    [values.title, values.kind, values.url, fileName, originalName, values.scheduledAt, values.notes, existing.id]
  );
  if (existing.file_name && existing.file_name !== fileName) removeStoredFile(existing.file_name);
  res.json({ lesson: mapLesson(rows[0]) });
}

export async function adminDeleteLesson(req, res) {
  const course = await requireCorpsCourse(pool, req.params.id, res);
  if (!course) return;
  const removed = await withCourseLock(course.id, async (db) => {
    const { rows } = await db.query(
      `DELETE FROM course_lessons WHERE id = $1 AND course_id = $2 RETURNING file_name`,
      [req.params.lessonId, course.id]
    ).catch(() => ({ rows: [] }));
    if (rows[0]) await renumber(db, "course_lessons", course.id);
    return rows[0];
  });
  if (!removed) return res.status(404).json({ error: "Lesson not found" });
  removeStoredFile(removed.file_name);
  res.json({ deleted: true });
}

export async function adminMoveLesson(req, res) {
  const { direction } = req.body || {};
  if (!["up", "down"].includes(direction)) {
    return res.status(400).json({ error: "direction must be up or down" });
  }
  const course = await requireCorpsCourse(pool, req.params.id, res);
  if (!course) return;
  const moved = await withCourseLock(course.id, async (db) => {
    await renumber(db, "course_lessons", course.id);
    const { rows } = await db.query(`SELECT id, position FROM course_lessons WHERE course_id = $1 ORDER BY position`, [
      course.id,
    ]);
    const idx = rows.findIndex((r) => r.id === req.params.lessonId);
    if (idx === -1) return null;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx >= 0 && swapIdx < rows.length) {
      await db.query(`UPDATE course_lessons SET position = $1 WHERE id = $2`, [rows[swapIdx].position, rows[idx].id]);
      await db.query(`UPDATE course_lessons SET position = $1 WHERE id = $2`, [rows[idx].position, rows[swapIdx].id]);
    }
    return true;
  });
  if (!moved) return res.status(404).json({ error: "Lesson not found" });
  const { rows } = await pool.query(`SELECT * FROM course_lessons WHERE course_id = $1 ORDER BY position`, [course.id]);
  res.json({ lessons: rows.map(mapLesson) });
}

// Admin preview of an uploaded lesson document (corps-member access comes
// with the learning phase, behind the payment gate).
export async function adminDownloadLessonFile(req, res) {
  const { rows } = await pool
    .query(`SELECT file_name, original_name FROM course_lessons WHERE id = $1`, [req.params.lessonId])
    .catch(() => ({ rows: [] }));
  const lesson = rows[0];
  if (!lesson?.file_name) return res.status(404).json({ error: "No document on this lesson" });
  await sendFileRef(res, lesson.file_name, { legacyDir: MATERIALS_DIR, download: true, filename: lesson.original_name });
}

// ---------------------------------------------------------------------
// Quiz questions — multiple choice, exactly one correct option.
// ---------------------------------------------------------------------
function parseQuestion(body) {
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) return { error: "The question text is required" };
  if (prompt.length > 1000) return { error: "The question is too long (max 1000 characters)" };
  const explanation = body.explanation ? String(body.explanation).trim() : "";
  if (explanation.length > 1000) return { error: "The explanation is too long (max 1000 characters)" };

  const rawOptions = Array.isArray(body.options) ? body.options : null;
  if (!rawOptions || rawOptions.length < 2) return { error: "Give at least 2 answer options" };
  if (rawOptions.length > MAX_OPTIONS) return { error: `At most ${MAX_OPTIONS} answer options are allowed` };

  const options = [];
  for (const o of rawOptions) {
    const text = String(o?.text ?? "").trim();
    if (!text) return { error: "Every answer option needs text" };
    if (text.length > 500) return { error: "An answer option is too long (max 500 characters)" };
    options.push({ text, isCorrect: o?.isCorrect === true });
  }
  const correct = options.filter((o) => o.isCorrect).length;
  if (correct !== 1) return { error: "Mark exactly one option as the correct answer" };

  return { values: { prompt, explanation: explanation || null, options } };
}

async function insertOptions(db, questionId, options) {
  for (let i = 0; i < options.length; i += 1) {
    await db.query(
      `INSERT INTO course_quiz_options (question_id, position, text, is_correct) VALUES ($1,$2,$3,$4)`,
      [questionId, i + 1, options[i].text, options[i].isCorrect]
    );
  }
}

async function loadQuestion(db, questionId) {
  const { rows: q } = await db.query(`SELECT * FROM course_quiz_questions WHERE id = $1`, [questionId]);
  const { rows: o } = await db.query(`SELECT * FROM course_quiz_options WHERE question_id = $1`, [questionId]);
  return q[0] ? mapQuestion(q[0], o) : null;
}

export async function adminAddQuestion(req, res) {
  const course = await requireCorpsCourse(pool, req.params.id, res);
  if (!course) return;
  const { values, error } = parseQuestion(req.body || {});
  if (error) return res.status(400).json({ error });
  const question = await withCourseLock(course.id, async (db) => {
    const { rows: pos } = await db.query(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next FROM course_quiz_questions WHERE course_id = $1`,
      [course.id]
    );
    const { rows } = await db.query(
      `INSERT INTO course_quiz_questions (course_id, position, prompt, explanation) VALUES ($1,$2,$3,$4) RETURNING id`,
      [course.id, pos[0].next, values.prompt, values.explanation]
    );
    await insertOptions(db, rows[0].id, values.options);
    return loadQuestion(db, rows[0].id);
  });
  res.status(201).json({ question });
}

export async function adminUpdateQuestion(req, res) {
  const course = await requireCorpsCourse(pool, req.params.id, res);
  if (!course) return;
  const { values, error } = parseQuestion(req.body || {});
  if (error) return res.status(400).json({ error });
  const question = await withCourseLock(course.id, async (db) => {
    const { rows } = await db
      .query(`UPDATE course_quiz_questions SET prompt=$1, explanation=$2 WHERE id=$3 AND course_id=$4 RETURNING id`, [
        values.prompt,
        values.explanation,
        req.params.questionId,
        course.id,
      ])
      .catch(() => ({ rows: [] }));
    if (!rows[0]) return null;
    await db.query(`DELETE FROM course_quiz_options WHERE question_id = $1`, [rows[0].id]);
    await insertOptions(db, rows[0].id, values.options);
    return loadQuestion(db, rows[0].id);
  });
  if (!question) return res.status(404).json({ error: "Question not found" });
  res.json({ question });
}

export async function adminDeleteQuestion(req, res) {
  const course = await requireCorpsCourse(pool, req.params.id, res);
  if (!course) return;
  const removed = await withCourseLock(course.id, async (db) => {
    const { rows } = await db
      .query(`DELETE FROM course_quiz_questions WHERE id = $1 AND course_id = $2 RETURNING id`, [
        req.params.questionId,
        course.id,
      ])
      .catch(() => ({ rows: [] }));
    if (rows[0]) await renumber(db, "course_quiz_questions", course.id);
    return rows[0];
  });
  if (!removed) return res.status(404).json({ error: "Question not found" });
  res.json({ deleted: true });
}

// A corps course may only go live once it can actually be taken: at least
// one lesson and at least one quiz question. Used by adminApproveCourse.
export async function corpsCourseReadiness(courseId) {
  const { rows } = await pool.query(
    `SELECT (SELECT COUNT(*)::int FROM course_lessons WHERE course_id = $1) AS lessons,
            (SELECT COUNT(*)::int FROM course_quiz_questions WHERE course_id = $1) AS questions`,
    [courseId]
  );
  const { lessons, questions } = rows[0];
  if (lessons < 1) return "Add at least one lesson before approving this course";
  if (questions < 1) return "Add at least one quiz question before approving this course";
  return null;
}
