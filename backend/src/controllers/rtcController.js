import { pool } from "../db/pool.js";

// ---------------------------------------------------------------------
// Admin (Training, Research & Consultancy department) — publish content.
// Kept intentionally simple to match the existing admin UI: creating an
// item publishes it immediately, no separate draft/publish toggle.
// ---------------------------------------------------------------------

export async function adminListCourses(req, res) {
  const { rows } = await pool.query(`SELECT * FROM courses ORDER BY created_at DESC`);
  res.json({ courses: rows });
}

export async function adminCreateCourse(req, res) {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });
  const { rows } = await pool.query(
    `INSERT INTO courses (title, description) VALUES ($1, $2) RETURNING *`,
    [title, description || null]
  );
  res.status(201).json({ course: rows[0] });
}

export async function adminListSeminars(req, res) {
  const { rows } = await pool.query(`SELECT * FROM seminars ORDER BY event_date DESC`);
  res.json({ seminars: rows });
}

export async function adminCreateSeminar(req, res) {
  const { title, eventDate, location } = req.body;
  if (!title || !eventDate || !location) {
    return res.status(400).json({ error: "title, eventDate, and location are required" });
  }
  const { rows } = await pool.query(
    `INSERT INTO seminars (title, event_date, location) VALUES ($1, $2, $3) RETURNING *`,
    [title, eventDate, location]
  );
  res.status(201).json({ seminar: rows[0] });
}

export async function adminListResearch(req, res) {
  const { rows } = await pool.query(`SELECT * FROM research ORDER BY created_at DESC`);
  res.json({ research: rows });
}

export async function adminCreateResearch(req, res) {
  const { title, summary } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });
  const { rows } = await pool.query(
    `INSERT INTO research (title, summary) VALUES ($1, $2) RETURNING *`,
    [title, summary || null]
  );
  res.status(201).json({ research: rows[0] });
}

export async function adminListConsultancy(req, res) {
  const { rows } = await pool.query(`SELECT * FROM consultancy_offerings ORDER BY created_at DESC`);
  res.json({ offerings: rows });
}

export async function adminCreateConsultancy(req, res) {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: "title is required" });
  const { rows } = await pool.query(
    `INSERT INTO consultancy_offerings (title, description) VALUES ($1, $2) RETURNING *`,
    [title, description || null]
  );
  res.status(201).json({ offering: rows[0] });
}

// ---------------------------------------------------------------------
// Member (farmer) — browse published content, mark courses complete.
// Always free, per the business model — no payment/gating here.
// ---------------------------------------------------------------------

export async function myCourses(req, res) {
  const { rows } = await pool.query(
    `SELECT c.*, COALESCE(cp.completed, FALSE) AS completed
     FROM courses c
     LEFT JOIN course_progress cp ON cp.course_id = c.id AND cp.user_id = $1
     ORDER BY c.created_at DESC`,
    [req.user.id]
  );
  res.json({
    courses: rows.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      completed: c.completed,
    })),
  });
}

export async function completeCourse(req, res) {
  const { id } = req.params;

  const { rows: courseRows } = await pool.query(`SELECT id FROM courses WHERE id = $1`, [id]);
  if (!courseRows[0]) return res.status(404).json({ error: "Course not found" });

  await pool.query(
    `INSERT INTO course_progress (course_id, user_id, completed)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (course_id, user_id) DO UPDATE SET completed = TRUE`,
    [id, req.user.id]
  );

  // Recompute the farmer's running course completion percentage —
  // completed courses out of every currently-published course, same
  // "ratio over available content" idea as attendance_pct is a ratio
  // over seminars actually held.
  await pool.query(
    `UPDATE farmer_profiles SET course_pct = (
       CASE WHEN (SELECT COUNT(*) FROM courses) = 0 THEN 0
       ELSE ROUND(100.0 * (
         SELECT COUNT(*) FROM course_progress WHERE user_id = $1 AND completed
       ) / (SELECT COUNT(*) FROM courses), 2)
       END
     ) WHERE user_id = $1`,
    [req.user.id]
  );

  res.json({ completed: true });
}

export async function mySeminars(req, res) {
  const { rows } = await pool.query(`SELECT * FROM seminars ORDER BY event_date DESC`);
  res.json({ seminars: rows });
}

export async function myResearch(req, res) {
  const { rows } = await pool.query(`SELECT * FROM research ORDER BY created_at DESC`);
  res.json({ research: rows });
}

export async function myConsultancy(req, res) {
  const { rows } = await pool.query(
    `SELECT c.*, cr.status AS request_status
     FROM consultancy_offerings c
     LEFT JOIN consultancy_requests cr ON cr.offering_id = c.id AND cr.user_id = $1
     ORDER BY c.created_at DESC`,
    [req.user.id]
  );
  res.json({
    offerings: rows.map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      requestStatus: o.request_status || null,
    })),
  });
}

// A farmer applying for a direct one-on-one consultation against a
// published offering. One application per offering per farmer.
export async function applyForConsultancy(req, res) {
  const { id } = req.params;
  const { message } = req.body;

  const { rows: offeringRows } = await pool.query(
    `SELECT id FROM consultancy_offerings WHERE id = $1`,
    [id]
  );
  if (!offeringRows[0]) return res.status(404).json({ error: "Offering not found" });

  const { rows: existing } = await pool.query(
    `SELECT id FROM consultancy_requests WHERE offering_id = $1 AND user_id = $2`,
    [id, req.user.id]
  );
  if (existing[0]) return res.status(400).json({ error: "You've already applied for this" });

  const { rows } = await pool.query(
    `INSERT INTO consultancy_requests (offering_id, user_id, message) VALUES ($1, $2, $3) RETURNING *`,
    [id, req.user.id, message || null]
  );
  res.status(201).json({ request: rows[0] });
}

export async function adminListConsultancyRequests(req, res) {
  const { rows } = await pool.query(
    `SELECT cr.*, u.name AS farmer_name, u.phone AS farmer_phone, co.title AS offering_title
     FROM consultancy_requests cr
     JOIN users u ON u.id = cr.user_id
     JOIN consultancy_offerings co ON co.id = cr.offering_id
     ORDER BY cr.created_at DESC`
  );
  res.json({
    requests: rows.map((r) => ({
      id: r.id,
      farmerName: r.farmer_name,
      farmerPhone: r.farmer_phone,
      offeringTitle: r.offering_title,
      message: r.message,
      status: r.status,
      createdAt: r.created_at,
    })),
  });
}

export async function adminUpdateConsultancyRequest(req, res) {
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
  res.json({ request: rows[0] });
}
