import { pool } from "../db/pool.js";

// Unit Leader "report profile" (2026-09-06 spec) — a leader can flag a
// profile within their own jurisdiction with a reason and an optional
// proof image; it goes straight to admin as a pending review.

export async function submitReport(req, res) {
  const { reportedUserId, reason } = req.body;
  if (!reportedUserId || !reason) {
    return res.status(400).json({ error: "reportedUserId and reason are required" });
  }

  // Admin has no jurisdiction of its own — company-wide, any farmer is a
  // valid target (same pattern as the other admin-universal-access
  // branches in farmerRank.js).
  if (req.user.role_type !== "admin") {
    const me = req.farmerProfile;
    const { rows: targetRows } = await pool.query(
      `SELECT u.id FROM users u WHERE u.id = $1 AND u.role_type = 'farmer'
         AND u.state = $2 AND u.lga = $3 AND u.ward = $4 AND u.unit = $5`,
      [reportedUserId, me.state, me.lga, me.ward, me.unit]
    );
    if (!targetRows[0]) {
      return res.status(403).json({ error: "That profile isn't in your jurisdiction" });
    }
  }

  const proofImageUrl = req.file ? `/uploads/report-proofs/${req.file.filename}` : null;

  const { rows } = await pool.query(
    `INSERT INTO profile_reports (reported_by, reported_user_id, reason, proof_image_url)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [req.user.id, reportedUserId, reason, proofImageUrl]
  );
  res.status(201).json({ report: rows[0] });
}

export async function myReports(req, res) {
  const { rows } = await pool.query(
    `SELECT pr.*, u.name AS reported_user_name
     FROM profile_reports pr
     JOIN users u ON u.id = pr.reported_user_id
     WHERE pr.reported_by = $1
     ORDER BY pr.created_at DESC`,
    [req.user.id]
  );
  res.json({ reports: rows });
}

// --- Admin review -------------------------------------------------------

export async function adminPendingReports(req, res) {
  const { rows } = await pool.query(
    `SELECT pr.*, ru.name AS reported_user_name, rb.name AS reported_by_name
     FROM profile_reports pr
     JOIN users ru ON ru.id = pr.reported_user_id
     JOIN users rb ON rb.id = pr.reported_by
     WHERE pr.status = 'pending'
     ORDER BY pr.created_at ASC`
  );
  res.json({ reports: rows });
}

export async function adminDecideReport(req, res) {
  const { id } = req.params;
  const { decision, note } = req.body;
  if (!["actioned", "dismissed"].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'actioned' or 'dismissed'" });
  }
  const { rows } = await pool.query(
    `UPDATE profile_reports SET status = $1, reviewed_by = $2, reviewed_at = now(), decision_note = $3
     WHERE id = $4 AND status = 'pending' RETURNING *`,
    [decision, req.user.id, note || null, id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Report not found or already decided" });
  res.json({ report: rows[0] });
}
