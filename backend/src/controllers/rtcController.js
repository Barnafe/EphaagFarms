import path from "node:path";
import { pool } from "../db/pool.js";
import { MATERIALS_DIR } from "../middleware/upload.js";

// ---------------------------------------------------------------------
// TRC — Training, Research & Consultancy (admin department).
//
// 2026-09-05 RESTORED: a 2026-09-02 round had renamed this whole
// department to "Seminal" and narrowed it to training-courses-only
// system-wide. Per explicit correction, that narrowing was only ever
// meant for ONE place — the farmer's own Farmer's Room tab, which is
// used as their personal course/online-class list and is fine staying
// labeled "Seminar" there. Everywhere else in the system (this admin
// department, the homepage card, the public marketing page, HOD
// appointments, department dropdowns) TRC is restored to its full
// three-part scope: Training, Research, and Consultancy — this is one
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
  const [{ rows: courseCounts }, { rows: researchCount }, { rows: consultReqCounts }] = await Promise.all([
    pool.query(`SELECT approved, COUNT(*)::int AS count FROM courses GROUP BY approved`),
    pool.query(`SELECT COUNT(*)::int AS count FROM research`),
    pool.query(`SELECT status, COUNT(*)::int AS count FROM consultancy_requests GROUP BY status`),
  ]);

  const approvedCourses = courseCounts.find((r) => r.approved === true)?.count || 0;
  const draftCourses = courseCounts.find((r) => r.approved === false)?.count || 0;
  const pendingConsultancy = consultReqCounts.find((r) => r.status === "pending")?.count || 0;

  res.json({
    approvedCourses,
    draftCourses,
    publishedResearch: researchCount[0].count,
    pendingConsultancyRequests: pendingConsultancy,
  });
}

function mapCourseForAdmin(c) {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    approved: c.approved,
    approvedAt: c.approved_at,
    hasMaterials: !!c.materials_url,
    onlineLink: c.online_link,
    scheduledAt: c.scheduled_at,
    createdAt: c.created_at,
  };
}

export async function adminListCourses(req, res) {
  const { rows } = await pool.query(`SELECT * FROM courses ORDER BY created_at DESC`);
  res.json({ courses: rows.map(mapCourseForAdmin) });
}

export async function adminCreateCourse(req, res) {
  const { title, description, onlineLink, scheduledAt } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });

  const materialsFilename = req.file ? req.file.filename : null;

  const { rows } = await pool.query(
    `INSERT INTO courses (title, description, created_by, materials_url, online_link, scheduled_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [title, description || null, req.user.id, materialsFilename, onlineLink || null, scheduledAt || null]
  );
  res.status(201).json({ course: mapCourseForAdmin(rows[0]) });
}

// A course is created as a draft (approved = FALSE) and stays invisible
// to farmers until an admin explicitly approves it — this is the
// "upload and approve" step the department is built around. Any admin
// can approve, including the one who uploaded it (kept simple, same MVP
// pattern as this department's other single-admin actions).
export async function adminApproveCourse(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(
    `UPDATE courses SET approved = TRUE, approved_by = $1, approved_at = now()
     WHERE id = $2 RETURNING *`,
    [req.user.id, id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Course not found" });
  res.json({ course: mapCourseForAdmin(rows[0]) });
}

// ---------------------------------------------------------------------
// Member (farmer) — browse approved courses, mark them complete. Always
// free, per the business model — no payment/gating here.
// ---------------------------------------------------------------------

export async function myCourses(req, res) {
  const { rows } = await pool.query(
    `SELECT c.*, COALESCE(cp.completed, FALSE) AS completed
     FROM courses c
     LEFT JOIN course_progress cp ON cp.course_id = c.id AND cp.user_id = $1
     WHERE c.approved = TRUE
     ORDER BY c.created_at DESC`,
    [req.user.id]
  );
  res.json({
    courses: rows.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      hasMaterials: !!c.materials_url,
      onlineLink: c.online_link,
      scheduledAt: c.scheduled_at,
      completed: c.completed,
    })),
  });
}

export async function completeCourse(req, res) {
  const { id } = req.params;

  const { rows: courseRows } = await pool.query(
    `SELECT id FROM courses WHERE id = $1 AND approved = TRUE`,
    [id]
  );
  if (!courseRows[0]) return res.status(404).json({ error: "Course not found" });

  await pool.query(
    `INSERT INTO course_progress (course_id, user_id, completed)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (course_id, user_id) DO UPDATE SET completed = TRUE`,
    [id, req.user.id]
  );

  // Recompute the farmer's running course completion percentage —
  // completed courses out of every currently-approved course, same
  // "ratio over available content" idea as attendance_pct is a ratio
  // over seminars actually held.
  await pool.query(
    `UPDATE farmer_profiles SET course_pct = (
       CASE WHEN (SELECT COUNT(*) FROM courses WHERE approved = TRUE) = 0 THEN 0
       ELSE ROUND(100.0 * (
         SELECT COUNT(*) FROM course_progress cp
         JOIN courses c ON c.id = cp.course_id
         WHERE cp.user_id = $1 AND cp.completed AND c.approved = TRUE
       ) / (SELECT COUNT(*) FROM courses WHERE approved = TRUE), 2)
       END
     ) WHERE user_id = $1`,
    [req.user.id]
  );

  res.json({ completed: true });
}

// Downloading a course's materials — open to any authenticated user
// (admin or farmer), but a farmer can only reach an approved course's
// materials; admins can preview a pending course's materials too, since
// that's exactly what they need before approving it.
export async function downloadMaterial(req, res) {
  const { id } = req.params;
  const { rows } = await pool.query(`SELECT materials_url, approved FROM courses WHERE id = $1`, [id]);
  const course = rows[0];
  if (!course || !course.materials_url) return res.status(404).json({ error: "No materials on this course" });
  if (!course.approved && req.user.role_type !== "admin") {
    return res.status(404).json({ error: "No materials on this course" });
  }
  res.sendFile(path.join(MATERIALS_DIR, course.materials_url));
}

// ---------------------------------------------------------------------
// Research — admin publishes short research write-ups/summaries. Simple
// list/create/delete, no approval gate (unlike courses) since this is
// company-authored content, not something farmers submit.
// ---------------------------------------------------------------------

function mapResearch(r) {
  return { id: r.id, title: r.title, summary: r.summary, createdAt: r.created_at };
}

export async function adminListResearch(req, res) {
  const { rows } = await pool.query(`SELECT * FROM research ORDER BY created_at DESC`);
  res.json({ research: rows.map(mapResearch) });
}

export async function adminCreateResearch(req, res) {
  const { title, summary } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });
  const { rows } = await pool.query(
    `INSERT INTO research (title, summary) VALUES ($1, $2) RETURNING *`,
    [title, summary || null]
  );
  res.status(201).json({ research: mapResearch(rows[0]) });
}

export async function adminDeleteResearch(req, res) {
  const { id } = req.params;
  const { rowCount } = await pool.query(`DELETE FROM research WHERE id = $1`, [id]);
  if (!rowCount) return res.status(404).json({ error: "Research item not found" });
  res.json({ deleted: true });
}

// Member-facing: any farmer can browse published research (no approval
// gate — see note above).
export async function listResearch(req, res) {
  const { rows } = await pool.query(`SELECT * FROM research ORDER BY created_at DESC`);
  res.json({ research: rows.map(mapResearch) });
}

// ---------------------------------------------------------------------
// Consultancy — admin publishes offerings (what a member can book), and
// members submit requests against a published offering for a one-on-one
// session. Admin tracks requests through pending -> scheduled -> completed.
// ---------------------------------------------------------------------

function mapOffering(o) {
  return { id: o.id, title: o.title, description: o.description, createdAt: o.created_at };
}

function mapRequest(r) {
  return {
    id: r.id,
    offeringId: r.offering_id,
    offeringTitle: r.offering_title,
    userId: r.user_id,
    userName: r.user_name,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
  };
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

export async function adminListConsultancyRequests(req, res) {
  const { rows } = await pool.query(
    `SELECT cr.*, co.title AS offering_title, u.name AS user_name
     FROM consultancy_requests cr
     JOIN consultancy_offerings co ON co.id = cr.offering_id
     JOIN users u ON u.id = cr.user_id
     ORDER BY cr.created_at DESC`
  );
  res.json({ requests: rows.map(mapRequest) });
}

export async function adminUpdateConsultancyRequestStatus(req, res) {
  const { id } = req.params;
  const { status } = req.body;
  if (!["pending", "scheduled", "completed"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const { rows } = await pool.query(
    `UPDATE consultancy_requests SET status = $1 WHERE id = $2 RETURNING *`,
    [status, id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Request not found" });
  res.json({ request: mapRequest(rows[0]) });
}

// Member-facing
export async function listConsultancyOfferings(req, res) {
  const { rows } = await pool.query(`SELECT * FROM consultancy_offerings ORDER BY created_at DESC`);
  res.json({ offerings: rows.map(mapOffering) });
}

export async function submitConsultancyRequest(req, res) {
  const { offeringId, message } = req.body;
  if (!offeringId) return res.status(400).json({ error: "offeringId is required" });
  const { rows: offeringRows } = await pool.query(`SELECT id FROM consultancy_offerings WHERE id = $1`, [offeringId]);
  if (!offeringRows[0]) return res.status(404).json({ error: "Offering not found" });
  const { rows } = await pool.query(
    `INSERT INTO consultancy_requests (offering_id, user_id, message) VALUES ($1, $2, $3) RETURNING *`,
    [offeringId, req.user.id, message || null]
  );
  res.status(201).json({ request: { id: rows[0].id, status: rows[0].status } });
}

export async function myConsultancyRequests(req, res) {
  const { rows } = await pool.query(
    `SELECT cr.*, co.title AS offering_title
     FROM consultancy_requests cr
     JOIN consultancy_offerings co ON co.id = cr.offering_id
     WHERE cr.user_id = $1
     ORDER BY cr.created_at DESC`,
    [req.user.id]
  );
  res.json({ requests: rows.map((r) => ({ id: r.id, offeringTitle: r.offering_title, message: r.message, status: r.status, createdAt: r.created_at })) });
}
