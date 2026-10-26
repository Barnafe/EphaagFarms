import { pool } from "../db/pool.js";
import { loadProgressRows } from "./corperLearningController.js";
import { summariseProgress } from "../utils/corperLearning.js";

// ---------------------------------------------------------------------
// Admin (TRC department, Corps tab) — corps member progress.
// Reads progress through the SAME loadProgressRows() + summariseProgress()
// the members' own dashboards use, so the two can never disagree.
// Spreadsheet export arrives in phase 5.
// ---------------------------------------------------------------------

const PAID_SQL = `EXISTS (SELECT 1 FROM corper_payments p WHERE p.user_id = u.id AND p.status = 'paid')`;

// GET /api/rtc/admin/corps/progress?q=&paid=all|paid|unpaid&limit=&offset=
export async function adminCorpsProgress(req, res) {
  const { q } = req.query;
  const paidFilter = ["paid", "unpaid"].includes(req.query.paid) ? req.query.paid : "all";
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const params = [];
  const clauses = [`u.role_type = 'corper'`];
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim()}%`);
    const i = params.length;
    clauses.push(`(u.name ILIKE $${i} OR u.email ILIKE $${i} OR cp.state_code ILIKE $${i})`);
  }
  if (paidFilter === "paid") clauses.push(PAID_SQL);
  if (paidFilter === "unpaid") clauses.push(`NOT ${PAID_SQL}`);
  const where = `WHERE ${clauses.join(" AND ")}`;
  const from = `FROM users u LEFT JOIN corper_profiles cp ON cp.user_id = u.id`;

  const [{ rows: members }, { rows: count }, { rows: courseStats }, { rows: totals }] = await Promise.all([
    pool.query(
      `SELECT u.id, u.name, u.email, cp.state_code, cp.service_year, cp.batch, cp.stream, ${PAID_SQL} AS paid
       ${from} ${where} ORDER BY u.name, u.id LIMIT ${limit} OFFSET ${offset}`,
      params
    ),
    pool.query(`SELECT COUNT(*)::int AS n ${from} ${where}`, params),
    // Per-course stats count PAID members only (an unpaid member's progress doesn't count).
    pool.query(
      `WITH paid AS (SELECT DISTINCT user_id FROM corper_payments WHERE status = 'paid')
       SELECT c.id, c.title,
         (SELECT COUNT(*)::int FROM course_lessons l WHERE l.course_id = c.id) AS lesson_count,
         (SELECT COUNT(*)::int FROM course_quiz_questions q WHERE q.course_id = c.id) AS question_count,
         (SELECT COUNT(DISTINCT x.user_id)::int FROM (
              SELECT lp.user_id FROM corper_lesson_progress lp JOIN course_lessons l ON l.id = lp.lesson_id WHERE l.course_id = c.id
              UNION
              SELECT cpp.user_id FROM corper_course_progress cpp WHERE cpp.course_id = c.id AND (cpp.attempts > 0 OR cpp.completed_at IS NOT NULL)
            ) x JOIN paid ON paid.user_id = x.user_id) AS started,
         (SELECT COUNT(*)::int FROM corper_course_progress cpp JOIN paid ON paid.user_id = cpp.user_id
            WHERE cpp.course_id = c.id AND cpp.completed_at IS NOT NULL) AS completed,
         (SELECT ROUND(AVG(cpp.best_score)::numeric, 1)::float8 FROM corper_course_progress cpp JOIN paid ON paid.user_id = cpp.user_id
            WHERE cpp.course_id = c.id AND cpp.best_score IS NOT NULL) AS avg_best_score
       FROM courses c WHERE c.audience = 'corps' AND c.approved = TRUE
       ORDER BY c.approved_at NULLS LAST, c.created_at, c.id`
    ),
    pool.query(
      `SELECT COUNT(*)::int AS members,
              COUNT(*) FILTER (WHERE ${PAID_SQL})::int AS paid_members
       FROM users u WHERE u.role_type = 'corper'`
    ),
  ]);

  // Same shared calculation the member's own dashboard uses.
  const ids = members.map((m) => m.id);
  const rows = ids.length ? await loadProgressRows(ids) : [];
  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
    byUser.get(r.user_id).push(r);
  }

  res.json({
    totalMembers: totals[0].members,
    paidMembers: totals[0].paid_members,
    matching: count[0].n,
    limit,
    offset,
    members: members.map((m) => {
      const s = summariseProgress(byUser.get(m.id) || [], m.paid);
      return {
        userId: m.id,
        name: m.name,
        email: m.email,
        stateCode: m.state_code || null,
        batch: m.service_year && m.batch && m.stream ? `${m.service_year} Batch ${m.batch} Stream ${m.stream}` : null,
        paid: m.paid,
        coursesCompleted: s.completed, // counted (0 when unpaid)
        coursesCompletedRecorded: s.recordedCompleted, // kept even if unpaid
        totalCourses: s.total,
        percent: s.percent,
      };
    }),
    courses: courseStats.map((c) => ({
      id: c.id,
      title: c.title,
      lessonCount: c.lesson_count,
      questionCount: c.question_count,
      started: c.started,
      completed: c.completed,
      averageBestScore: c.avg_best_score,
    })),
  });
}

// What approving a corps course would do to people who are already
// learning: the total grows, so their percentage drops. Used by
// adminApproveCourse to ask the admin to confirm first.
export async function approvalImpact() {
  const { rows } = await pool.query(
    `WITH live AS (SELECT id FROM courses WHERE audience = 'corps' AND approved = TRUE),
          paid AS (SELECT DISTINCT user_id FROM corper_payments WHERE status = 'paid'),
          done AS (
            SELECT cpp.user_id, COUNT(*)::int AS completed
            FROM corper_course_progress cpp
            JOIN live ON live.id = cpp.course_id
            JOIN paid ON paid.user_id = cpp.user_id
            WHERE cpp.completed_at IS NOT NULL
            GROUP BY cpp.user_id
          )
     SELECT (SELECT COUNT(*)::int FROM live) AS live_courses,
            (SELECT COUNT(*)::int FROM paid) AS paid_members,
            (SELECT COUNT(*)::int FROM done) AS members_with_progress,
            (SELECT COUNT(*)::int FROM done WHERE completed >= (SELECT COUNT(*) FROM live)) AS members_at_hundred`
  );
  const r = rows[0];
  return {
    liveCourses: r.live_courses,
    paidMembers: r.paid_members,
    membersWithProgress: r.members_with_progress,
    membersAtHundred: r.members_at_hundred,
  };
}
