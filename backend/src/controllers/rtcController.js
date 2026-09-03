import path from "node:path";
import { pool } from "../db/pool.js";
import { MATERIALS_DIR } from "../middleware/upload.js";

// ---------------------------------------------------------------------
// "Seminal" (2026-09-02) — was "RTC" (Research, Training & Consultancy).
// Renamed and narrowed to training courses only: the company uploads a
// course (optionally with materials + an online hosting link + a
// scheduled date), an admin approves it, and only then does it appear to
// farmers, who can view materials, attend online, and mark it complete.
// Research and Consultancy are retired — their DB tables and any old
// requests still exist (never dropped) but nothing here routes to them
// anymore.
// ---------------------------------------------------------------------

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
