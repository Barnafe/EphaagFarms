import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { actingAsGuard } from "./security.js";

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }
  let payload;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  try {
    // The token carries a version; a password change/reset, an admin lock or
    // "Sign out of all devices" bumps the account's version and so ends every
    // older session at once.
    const { rows } = await pool.query("SELECT token_version, locked_until FROM users WHERE id = $1", [payload.id]);
    const u = rows[0];
    if (!u || (payload.tv ?? 0) !== u.token_version) {
      return res.status(401).json({ error: "Your session has ended. Please sign in again.", code: "SESSION_ENDED" });
    }
    req.user = payload;
    return actingAsGuard(req, res, next);
  } catch (err) {
    next(err);
  }
}

// Usage: requireRole("admin") or requireRole("farmer", "buyer")
export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!allowed.includes(req.user.role_type)) {
      return res.status(403).json({ error: "Not allowed for this role" });
    }
    next();
  };
}
