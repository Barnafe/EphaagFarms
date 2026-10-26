import express from "express";
import { Router } from "../utils/asyncRouter.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { cspReport } from "../middleware/security.js";
import { pool } from "../db/pool.js";
import { logSecurityEvent } from "../utils/securityLog.js";

const router = Router();

// Browsers post CSP violation reports here (content-type application/csp-report).
router.post("/csp-report", express.json({ type: ["application/csp-report", "application/json", "application/reports+json"] }), cspReport);

router.use(requireAuth, requireRole("admin"));

// The admin picked a department on "Login as a department".
router.post("/acting-as", async (req, res) => {
  const dept = String(req.body?.department || "").slice(0, 40);
  if (!dept) return res.status(400).json({ error: "department is required" });
  await logSecurityEvent("acting_as_started", { userId: req.user.id, req, detail: { department: dept } });
  res.json({ ok: true });
});

// Search the security log.  ?type=&userId=&q=&from=&to=&limit=&offset=
router.get("/log", async (req, res) => {
  const { type, userId, q, from, to } = req.query;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const where = []; const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replaceAll("?", `$${params.length}`)); };
  if (type) add("e.event_type = ?", type);
  if (userId) add("e.user_id = ?", userId);
  if (from) add("e.created_at >= ?", from);
  if (to) add("e.created_at <= ?", to);
  if (q) add("(e.detail::text ILIKE ? OR e.ip ILIKE ? OR u.name ILIKE ? OR u.email ILIKE ?)", `%${q}%`);
  const sqlWhere = where.join(" AND ");
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT e.id, e.event_type, e.user_id, u.name AS user_name, u.email AS user_email, e.ip, e.detail, e.created_at
     FROM security_events e LEFT JOIN users u ON u.id = e.user_id
     ${sqlWhere ? "WHERE " + sqlWhere : ""} ORDER BY e.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params);
  res.json({ events: rows });
});

router.post("/users/:id/unlock", async (req, res) => {
  const { rowCount } = await pool.query("UPDATE users SET locked_until = NULL, failed_login_count = 0 WHERE id = $1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: "User not found" });
  await logSecurityEvent("account_unlocked", { userId: req.params.id, req, detail: { by: req.user.id } });
  res.json({ ok: true });
});

// Admin lock: blocks sign-in for N minutes (default 24h) and ends every session.
router.post("/users/:id/lock", async (req, res) => {
  const minutes = Math.min(Math.max(Number(req.body?.minutes) || 1440, 1), 60 * 24 * 30);
  if (req.params.id === req.user.id) return res.status(400).json({ error: "You cannot lock your own account" });
  const { rowCount } = await pool.query(
    `UPDATE users SET locked_until = now() + ($2 || ' minutes')::interval, token_version = token_version + 1 WHERE id = $1`,
    [req.params.id, String(minutes)]);
  if (!rowCount) return res.status(404).json({ error: "User not found" });
  await logSecurityEvent("account_locked_by_admin", { userId: req.params.id, req, detail: { by: req.user.id, minutes } });
  res.json({ ok: true });
});

export default router;
