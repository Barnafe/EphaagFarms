import { pool } from "../db/pool.js";

// Unit Leader "create unit" (2026-09-06 spec) — a Unit Leader proposes a
// new unit from a nearby community once it's built up a strong, consistent
// group; it sits pending until admin approves it into an official company
// unit. Always visible in the proposing leader's own list regardless of
// status ("stays in his referral room").

export async function proposeUnit(req, res) {
  const { name, state, lga, ward, note } = req.body;
  if (!name || !state || !lga || !ward) {
    return res.status(400).json({ error: "name, state, lga, and ward are required" });
  }
  const { rows } = await pool.query(
    `INSERT INTO units (name, state, lga, ward, note, proposed_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name, state, lga, ward, note || null, req.user.id]
  );
  res.status(201).json({ unit: rows[0] });
}

export async function myUnits(req, res) {
  const { rows } = await pool.query(
    `SELECT * FROM units WHERE proposed_by = $1 ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ units: rows });
}

// --- Admin review -------------------------------------------------------

export async function adminPendingUnits(req, res) {
  const { rows } = await pool.query(
    `SELECT un.*, u.name AS proposed_by_name
     FROM units un
     JOIN users u ON u.id = un.proposed_by
     WHERE un.status = 'pending'
     ORDER BY un.created_at ASC`
  );
  res.json({ units: rows });
}

export async function adminDecideUnit(req, res) {
  const { id } = req.params;
  const { decision, note } = req.body;
  if (!["approved", "rejected"].includes(decision)) {
    return res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
  }
  const { rows } = await pool.query(
    `UPDATE units SET status = $1, reviewed_by = $2, reviewed_at = now(), decision_note = $3
     WHERE id = $4 AND status = 'pending' RETURNING *`,
    [decision, req.user.id, note || null, id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Unit request not found or already decided" });
  res.json({ unit: rows[0] });
}
