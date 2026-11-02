import path from "node:path";
import { pool } from "../db/pool.js";
import fs from "node:fs";
import { MATERIALS_DIR } from "../middleware/upload.js";
import { corpsCourseReadiness } from "./trainingContentController.js";
import { approvalImpact } from "./corperProgressAdminController.js";
import { sendFileRef, discardFileRef } from "../utils/fileRefs.js";
import { loadSeminarItems, markCourseComplete } from "./seminarContentController.js";

// ---------------------------------------------------------------------
// TRC, Training, Research & Consultancy (admin department).
//
// 2026-09-05 RESTORED: a 2026-09-02 round had renamed this whole
// department to "Seminal" and narrowed it to training-courses-only
// system-wide. Per explicit correction, that narrowing was only ever
// meant for ONE place, the farmer's own Farmer's Room tab, which is
// used as their personal course/online-class list and is fine staying
// labeled "Seminar" there. Everywhere else in the system (this admin
// department, the homepage card, the public marketing page, HOD
// appointments, department dropdowns) TRC is restored to its full
// three-part scope: Training, Research, and Consultancy, this is one
// of EPHAAG's core offerings, not a farmer-only feature.
//
// Training = the existing course upload/approve/materials/online-link
// flow below (unchanged code, just no longer the department's ONLY
// function). Research and Consultancy admin functions are added back
// here, reading/writing the `research`/`consultancy_offerings`/
// `consultancy_requests` tables, which were never dropped even during
// the narrowing.
// ---------------------------------------------------------------------

// --- Dashboard (2026-09-05 spec) --------------------------------------
export async function dashboardSummary(req, res) {
  const [{ rows: courseCounts }, { rows: researchCount }, { rows: consultReqCounts }, { rows: corpsPay }] = await Promise.all([
    pool.query(`SELECT audience, approved, COUNT(*)::int AS count FROM courses GROUP BY audience, approved`),
    pool.query(`SELECT COUNT(*)::int AS count FROM research`),
    pool.query(`SELECT status, COUNT(*)::int AS count FROM consultancy_requests GROUP BY status`),
    pool.query(`SELECT status, COUNT(*)::int AS count FROM corper_payments GROUP BY status`),
  ]);

  const countOf = (audience, approved) =>
    courseCounts.find((r) => r.audience === audience && r.approved === approved)?.count || 0;
  const pendingConsultancy = consultReqCounts.find((r) => r.status === "pending")?.count || 0;

  res.json({
    // General (farmer "Seminar") courses, same meaning as before.
    approvedCourses: countOf("general", true),
    draftCourses: countOf("general", false),
    // NYSC AGROALLIED SAED training courses.
    corpsApprovedCourses: countOf("corps", true),
    corpsDraftCourses: countOf("corps", false),
    // NYSC AGROALLIED SAED access-fee payments (phase 3).
    corpsPaymentsPending: corpsPay.find((r) => r.status === "pending")?.count || 0,
    corpsPaidMembers: corpsPay.find((r) => r.status === "paid")?.count || 0,
    publishedResearch: researchCount[0].count,
    pendingConsultancyRequests: pendingConsultancy,
  });
}

function mapCourseForAdmin(c) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    audience: c.audience,
    approved: c.approved,
    approvedAt: c.approved_at,
    hasMaterials: !!c.materials_url,
    onlineLink: c.online_link,
    scheduledAt: c.scheduled_at,
    createdAt: c.created_at,
    // Only meaningful for NYSC AGROALLIED SAED courses (general courses have none).
    lessonCount: c.lesson_count ?? 0,
    questionCount: c.question_count ?? 0,
  };
}

const COURSE_AUDIENCES = ["general", "corps"];

export async function adminListCourses(req, res) {
  const { audience } = req.query;
  if (audience && audience !== "all" && !COURSE_AUDIENCES.includes(audience)) {
    return res.status(400).json({ error: "audience must be general, corps or all" });
  }
  const filter = audience && audience !== "all" ? audience : null;
  const { rows } = await pool.query(
    `SELECT c.*,
            (SELECT COUNT(*)::int FROM course_lessons l WHERE l.course_id = c.id) AS lesson_count,
            (SELECT COUNT(*)::int FROM course_quiz_questions q WHERE q.course_id = c.id) AS question_count
     FROM courses c
     WHERE ($1::text IS NULL OR c.audience = $1)
     ORDER BY c.created_at DESC`,
    [filter]
  );
  res.json({ courses: rows.map(mapCourseForAdmin) });
}

export async function adminCreateCourse(req, res) {
  const { title, description, onlineLink, scheduledAt } = req.body;
  const audience = req.body.audience || "general";
  const discardUpload = () => {
    if (req.file) discardFileRef(req.file.filename, MATERIALS_DIR);
  };

  if (!title || !String(title).trim()) {
    discardUpload();
    return res.status(400).json({ error: "title is required" });
  }
  if (!COURSE_AUDIENCES.includes(audience)) {
    discardUpload();
    return res.status(400).json({ error: "audience must be general or corps" });
  }

  // NYSC AGROALLIED SAED courses are built from lessons + a quiz (added after creation),
  // so the single material / hosting link / schedule of the general
  // "Seminar" model don't apply to them.
  if (audience === "corps") discardUpload();
  const materialsFilename = audience === "general" && req.file ? req.file.filename : null;

  const { rows } = await pool.query(
    `INSERT INTO courses (title, description, created_by, materials_url, online_link, scheduled_at, audience)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      String(title).trim(),
      description || null,
      req.user.id,
      materialsFilename,
      audience === "general" ? onlineLink || null : null,
      audience === "general" ? scheduledAt || null : null,
      audience,
    ]
  );
  res.status(201).json({ course: mapCourseForAdmin(rows[0]) });
}

// A course is created as a draft (approved = FALSE) and stays invisible
// to members until an admin explicitly approves it, this is the
// "upload and approve" step the department is built around. Any admin
// can approve, including the one who uploaded it (kept simple, same MVP
// pattern as this department's other single-admin actions). A corps
// course additionally has to be takeable first: at least one lesson and
// at least one quiz question.
export async function adminApproveCourse(req, res) {
  const { id } = req.params;
  const { rows: found } = await pool.query(`SELECT id, audience, approved FROM courses WHERE id = $1`, [id]).catch(() => ({ rows: [] }));
  if (!found[0]) return res.status(404).json({ error: "Course not found" });
  if (found[0].audience === "corps") {
    const problem = await corpsCourseReadiness(found[0].id);
    if (problem) return res.status(400).json({ error: problem });

    // Going live adds a course to everyone's total, so members who already
    // have progress see their percentage drop. Make the admin confirm that
    // first (the server enforces it, not just the screen).
    if (!found[0].approved && req.body?.confirmImpact !== true) {
      const impact = await approvalImpact();
      if (impact.membersWithProgress > 0) {
        return res.status(409).json({
          error: `${impact.membersWithProgress} NYSC AGROALLIED SAED member${impact.membersWithProgress === 1 ? " has" : "s have"} already completed courses. Approving this one adds it to their total, so their percentage will drop${impact.membersAtHundred > 0 ? ` (${impact.membersAtHundred} currently at 100% will drop below it)` : ""}.`,
          code: "APPROVAL_IMPACT",
          details: impact,
        });
      }
    }
  }
  const { rows } = await pool.query(
    `UPDATE courses SET approved = TRUE, approved_by = $1, approved_at = COALESCE(approved_at, now())
     WHERE id = $2
     RETURNING *,
       (SELECT COUNT(*)::int FROM course_lessons l WHERE l.course_id = courses.id) AS lesson_count,
       (SELECT COUNT(*)::int FROM course_quiz_questions q WHERE q.course_id = courses.id) AS question_count`,
    [req.user.id, id]
  );
  res.json({ course: mapCourseForAdmin(rows[0]) });
}

// ---------------------------------------------------------------------
// Member (farmer), browse approved courses, mark them complete. Always
// free, per the business model, no payment/gating here.
// ---------------------------------------------------------------------

export async function myCourses(req, res) {
  const { rows } = await pool.query(
    `SELECT c.*, COALESCE(cp.completed, FALSE) AS completed
     FROM courses c
     LEFT JOIN course_progress cp ON cp.course_id = c.id AND cp.user_id = $1
     WHERE c.approved = TRUE AND c.audience = 'general'
     ORDER BY c.created_at DESC`,
    [req.user.id]
  );
  const itemsBy = await loadSeminarItems(req.user.id, rows.map((c) => c.id));
  res.json({
    courses: rows.map((c) => {
      const items = itemsBy.get(c.id) || [];
      const done = items.filter((i) => i.completed).length;
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        hasMaterials: !!c.materials_url,
        onlineLink: c.online_link,
        scheduledAt: c.scheduled_at,
        items,
        completedItems: done,
        totalItems: items.length,
        // A topic with videos or slides is complete when every item is done.
        completed: items.length ? done === items.length : c.completed,
      };
    }),
  });
}

export async function completeCourse(req, res) {
  const { id } = req.params;

  const { rows: courseRows } = await pool.query(
    `SELECT id FROM courses WHERE id = $1 AND approved = TRUE AND audience = 'general'`,
    [id]
  );
  if (!courseRows[0]) return res.status(404).json({ error: "Course not found" });

  await markCourseComplete(req.user.id, id);

  res.json({ completed: true });
}

// Downloading a course's materials, open to any authenticated user
// (admin or farmer), but a farmer can only reach an approved course's
// materials; admins can preview a pending course's materials too, since
// that's exactly what they need before approving it.
export async function downloadMaterial(req, res) {
  const { id } = req.params;
  const { rows } = await pool
    .query(`SELECT materials_url, approved, audience FROM courses WHERE id = $1`, [id])
    .catch(() => ({ rows: [] }));
  const course = rows[0];
  if (!course || !course.materials_url) return res.status(404).json({ error: "No materials on this course" });
  // NYSC AGROALLIED SAED courses keep their documents on lessons (not here), and farmers
  // must never reach anything about them.
  if (course.audience !== "general" && req.user.role_type !== "admin") {
    return res.status(404).json({ error: "No materials on this course" });
  }
  if (!course.approved && req.user.role_type !== "admin") {
    return res.status(404).json({ error: "No materials on this course" });
  }
  await sendFileRef(res, course.materials_url, { legacyDir: MATERIALS_DIR });
}

// ---------------------------------------------------------------------
// Research, admin publishes short research write-ups/summaries. Simple
// list/create/delete, no approval gate (unlike courses) since this is
// company-authored content, not something farmers submit.
// ---------------------------------------------------------------------

function mapResearch(r) {
  return { id: r.id, title: r.title, summary: r.summary, fileName: r.file_name, hasFile: !!r.file_url, createdAt: r.created_at };
}

export async function adminListResearch(req, res) {
  const { rows } = await pool.query(`SELECT * FROM research ORDER BY created_at DESC`);
  res.json({ research: rows.map(mapResearch) });
}

// Research is EPHAAG's own and internal: staff add a title, a summary and a PDF, and only staff can read or
// download it. There is deliberately no member or public route for it.
export async function adminCreateResearch(req, res) {
  const title = String(req.body?.title || "").trim();
  const summary = String(req.body?.summary || "").trim();
  const discard = () => { if (req.file) discardFileRef(req.file.filename, MATERIALS_DIR); };
  if (!title) { discard(); return res.status(400).json({ error: "title is required" }); }
  if (title.length > 200) { discard(); return res.status(400).json({ error: "The title is too long (200 characters at most)." }); }
  if (!req.file) return res.status(400).json({ error: "Attach the research as a PDF file." });
  const { rows } = await pool.query(
    `INSERT INTO research (title, summary, file_url, file_name, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [title, summary || null, req.file.filename, req.file.originalname || "research.pdf", req.user.id]
  );
  res.status(201).json({ research: mapResearch(rows[0]) });
}

export async function adminDownloadResearch(req, res) {
  const { rows } = await pool.query(`SELECT file_url, file_name, title FROM research WHERE id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Research item not found" });
  if (!rows[0].file_url) return res.status(404).json({ error: "This item has no PDF" });
  const name = rows[0].file_name || `${rows[0].title}.pdf`;
  await sendFileRef(res, rows[0].file_url, { legacyDir: MATERIALS_DIR, download: true, filename: name });
}

export async function adminDeleteResearch(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(`DELETE FROM research WHERE id = $1 RETURNING file_url`, [id]);
  if (!rows[0]) return res.status(404).json({ error: "Research item not found" });
  discardFileRef(rows[0].file_url, MATERIALS_DIR);
  res.json({ deleted: true });
}

// ---------------------------------------------------------------------
// Consultancy, admin publishes offerings (what a member can book), and
// members submit requests against a published offering for a one-on-one
// session. Admin tracks requests through pending -> scheduled -> completed.
// ---------------------------------------------------------------------

function mapOffering(o) {
  return { id: o.id, title: o.title, description: o.description, createdAt: o.created_at };
}

export async function adminListConsultancyOfferings(req, res) {
  const { rows } = await pool.query(`SELECT * FROM consultancy_offerings ORDER BY created_at DESC`);
  res.json({ offerings: rows.map(mapOffering) });
}

export async function adminCreateConsultancyOffering(req, res) {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });
  const { rows } = await pool.query(
    `INSERT INTO consultancy_offerings (title, description) VALUES ($1, $2) RETURNING *`,
    [title, description || null]
  );
  res.status(201).json({ offering: mapOffering(rows[0]) });
}

export async function adminDeleteConsultancyOffering(req, res) {
  const { id } = req.params;
  const { rowCount } = await pool.query(`DELETE FROM consultancy_offerings WHERE id = $1`, [id]);
  if (!rowCount) return res.status(404).json({ error: "Offering not found" });
  res.json({ deleted: true });
}
