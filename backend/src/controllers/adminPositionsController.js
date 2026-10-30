import { rankLabel } from "../utils/governance.js";
import { pool } from "../db/pool.js";

// Promotion/appointment tool (2026-08-13 spec) — "someone isn't supposed
// to register or make himself HOD... when it is agreed by the company for
// a specific person, admin will have the tools to promote someone."
// Covers two independent position systems:
//   1. Farmer leadership ranks (Unit Leader -> Ward Leader -> LGA
//      Coordinator -> State Coordinator -> 3EI Governance), stored on
//      farmer_profiles.rank.
//   2. Admin department heads (HOD of Production/Procurement/Transport/
//      Store/Finance/Maintenance/TRC), stored on users.department_head_of.
// 2026-09-05: RESTORED "TRC" (Training, Research & Consultancy) as the
// department name here. A 2026-09-02 round had renamed it to "Seminal"
// and narrowed it system-wide, but that was only ever meant to apply to
// the farmer-facing course tab inside Farmer's Room — TRC remains a
// full admin department (Training/Research/Consultancy) everywhere else,
// see rtcController.js. Any pre-existing user row with
// department_head_of = 'Seminal' (the interim name) keeps that exact
// string until reassigned; there's no DB constraint on this column's
// values, so nothing breaks, but it's now a stale label worth
// re-appointing via this same tool.
// Every change is logged to coordinator_appointments (existing table,
// previously unused) as a durable, auditable history — never just an
// in-place update with no trace.

// --- Admin accounts -----------------------------------------------------
// Exactly one MAIN admin exists (the seeded one). Only the main admin can add
// or remove admins; every other admin has every other admin feature. Adding an
// admin promotes an existing account (the same way a farmer is promoted to Unit
// Leader); removing one gives the person their old account back.
async function isMainAdmin(userId) {
  const { rows } = await pool.query("SELECT 1 FROM users WHERE id = $1 AND role_type = 'admin' AND is_main_admin", [userId]);
  return rows.length > 0;
}

export async function requireMainAdmin(req, res, next) {
  if (!(await isMainAdmin(req.user.id))) {
    return res.status(403).json({ error: "Only the main admin can add or remove admins" });
  }
  next();
}

export async function searchAdminCandidates(req, res) {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json({ users: [] });
  const { rows } = await pool.query(
    `SELECT id, name, email, phone, role_type FROM users
      WHERE role_type <> 'admin' AND (name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1)
      ORDER BY name ASC LIMIT 20`,
    [`%${q}%`]
  );
  res.json({ users: rows });
}

export async function promoteToAdmin(req, res) {
  const { userId } = req.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT id, name, role_type FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const target = rows[0];
    if (!target) { await client.query("ROLLBACK"); return res.status(404).json({ error: "User not found" }); }
    if (target.role_type === "admin") { await client.query("ROLLBACK"); return res.status(400).json({ error: `${target.name} is already an admin` }); }
    // token_version + 1 ends the person's old sessions, so their next login carries the admin role.
    await client.query(
      `UPDATE users SET previous_role_type = role_type, role_type = 'admin', department_head_of = NULL,
              token_version = token_version + 1 WHERE id = $1`,
      [userId]
    );
    await client.query(
      `INSERT INTO coordinator_appointments (user_id, rank, jurisdiction, approved_by) VALUES ($1, $2, $3, $4)`,
      [userId, "Admin", "Admin", req.user.name]
    );
    await client.query("COMMIT");
    res.json({ userId, name: target.name, role: "admin" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not promote to admin" });
  } finally {
    client.release();
  }
}

export async function removeAdmin(req, res) {
  const { userId } = req.params;
  if (userId === req.user.id) return res.status(400).json({ error: "You can't remove yourself" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT id, name, is_main_admin, previous_role_type FROM users WHERE id = $1 AND role_type = 'admin' FOR UPDATE", [userId]);
    const target = rows[0];
    if (!target) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Admin not found" }); }
    if (target.is_main_admin) { await client.query("ROLLBACK"); return res.status(400).json({ error: "The main admin can't be removed" }); }
    let outcome;
    if (target.previous_role_type) {
      await client.query(
        `UPDATE users SET role_type = previous_role_type, previous_role_type = NULL, department_head_of = NULL,
                token_version = token_version + 1 WHERE id = $1`, [userId]);
      outcome = `back to a ${target.previous_role_type} account`;
    } else {
      // This admin never had another account to go back to, so the account is locked instead.
      await client.query(
        `UPDATE users SET locked_until = now() + interval '100 years', department_head_of = NULL,
                token_version = token_version + 1 WHERE id = $1`, [userId]);
      outcome = "locked (there was no earlier account to return to)";
    }
    await client.query(
      `INSERT INTO coordinator_appointments (user_id, rank, jurisdiction, approved_by) VALUES ($1, $2, $3, $4)`,
      [userId, "Admin removed", "Admin", req.user.name]
    );
    await client.query("COMMIT");
    res.json({ userId, name: target.name, outcome });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not remove admin" });
  } finally {
    client.release();
  }
}

const FARMER_RANKS = ["Member", "Unit Leader", "Ward Leader", "LGA Coordinator", "State Coordinator", "Federal"];
const DEPARTMENTS = ["Production", "Procurement", "Transport", "Store", "Finance", "Maintenance", "TRC"];

export async function searchFarmers(req, res) {
  const { q, state, lga } = req.query;
  const filters = ["u.role_type = 'farmer'"];
  const values = [];
  if (q) { values.push(`%${q}%`); filters.push(`u.name ILIKE $${values.length}`); }
  if (state) { values.push(state); filters.push(`u.state = $${values.length}`); }
  if (lga) { values.push(lga); filters.push(`u.lga = $${values.length}`); }

  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.state, u.lga, u.ward, u.unit, fp.rank
     FROM users u JOIN farmer_profiles fp ON fp.user_id = u.id
     WHERE ${filters.join(" AND ")} ORDER BY u.name ASC LIMIT 50`,
    values
  );
  res.json({ farmers: rows });
}

export async function promoteFarmerRank(req, res) {
  const { userId } = req.params;
  const { rank } = req.body;
  if (!FARMER_RANKS.includes(rank)) {
    return res.status(400).json({ error: `rank must be one of: ${FARMER_RANKS.map(rankLabel).join(", ")}` });
  }
  const check = await pool.query(`SELECT id, name, state, lga, ward, unit FROM users WHERE id = $1 AND role_type = 'farmer'`, [userId]);
  const farmer = check.rows[0];
  if (!farmer) return res.status(404).json({ error: "Farmer not found" });

  const { rows } = await pool.query(
    `UPDATE farmer_profiles SET rank = $1 WHERE user_id = $2 RETURNING rank`,
    [rank, userId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Farmer profile not found" });

  await pool.query(
    `INSERT INTO coordinator_appointments (user_id, rank, jurisdiction, approved_by)
     VALUES ($1, $2, $3, $4)`,
    [userId, rank, [farmer.state, farmer.lga, farmer.ward, farmer.unit].filter(Boolean).join(" / "), req.user.name]
  );

  res.json({ userId, name: farmer.name, rank });
}

export async function demoteFarmerRank(req, res) {
  req.body = { rank: "Member" };
  return promoteFarmerRank(req, res);
}

export async function listAdminsForHod(req, res) {
  const { rows } = await pool.query(
    `SELECT id, name, email, department_head_of, is_main_admin FROM users WHERE role_type = 'admin' ORDER BY is_main_admin DESC, name ASC`
  );
  res.json({ admins: rows, departments: DEPARTMENTS, canManageAdmins: await isMainAdmin(req.user.id) });
}

export async function promoteHod(req, res) {
  const { userId } = req.params;
  const { department } = req.body;
  if (!DEPARTMENTS.includes(department)) {
    return res.status(400).json({ error: `department must be one of: ${DEPARTMENTS.join(", ")}` });
  }
  const check = await pool.query(`SELECT id, name FROM users WHERE id = $1 AND role_type = 'admin'`, [userId]);
  if (!check.rows[0]) return res.status(404).json({ error: "Admin user not found" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Only one HOD per department at a time — auto-clear whoever held it.
    await client.query(`UPDATE users SET department_head_of = NULL WHERE department_head_of = $1`, [department]);
    const { rows } = await client.query(
      `UPDATE users SET department_head_of = $1 WHERE id = $2 RETURNING id, name, department_head_of`,
      [department, userId]
    );
    await client.query(
      `INSERT INTO coordinator_appointments (user_id, rank, jurisdiction, approved_by)
       VALUES ($1, $2, $3, $4)`,
      [userId, `HOD: ${department}`, department, req.user.name]
    );
    await client.query("COMMIT");
    res.json({ userId: rows[0].id, name: rows[0].name, departmentHeadOf: rows[0].department_head_of });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Could not promote to HOD" });
  } finally {
    client.release();
  }
}

export async function demoteHod(req, res) {
  const { userId } = req.params;
  const check = await pool.query(`SELECT id, name, department_head_of FROM users WHERE id = $1 AND role_type = 'admin'`, [userId]);
  const admin = check.rows[0];
  if (!admin) return res.status(404).json({ error: "Admin user not found" });
  if (!admin.department_head_of) return res.status(400).json({ error: "This person isn't a department head" });

  await pool.query(`UPDATE users SET department_head_of = NULL WHERE id = $1`, [userId]);
  await pool.query(
    `INSERT INTO coordinator_appointments (user_id, rank, jurisdiction, approved_by)
     VALUES ($1, $2, $3, $4)`,
    [userId, "HOD removed", admin.department_head_of, req.user.name]
  );
  res.json({ userId, name: admin.name, departmentHeadOf: null });
}

export async function appointmentHistory(req, res) {
  const { rows } = await pool.query(
    `SELECT ca.*, u.name AS user_name FROM coordinator_appointments ca
     JOIN users u ON u.id = ca.user_id ORDER BY ca.created_at DESC LIMIT 100`
  );
  res.json({ appointments: rows });
}
