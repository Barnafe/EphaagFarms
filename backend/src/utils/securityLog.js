import { pool } from "../db/pool.js";

export function clientIp(req) {
  return req?.ip || req?.socket?.remoteAddress || null;
}

// Never throws: a logging failure must not break the action being logged.
export async function logSecurityEvent(eventType, { userId = null, req = null, ip = null, detail = {} } = {}) {
  try {
    await pool.query(
      `INSERT INTO security_events (event_type, user_id, ip, detail) VALUES ($1,$2,$3,$4::jsonb)`,
      [eventType, userId, ip || clientIp(req), JSON.stringify(detail || {})]
    );
  } catch (err) {
    console.error("[security-log] failed:", err.message);
  }
}
