import { pool } from "../db/pool.js";
import { verifySnsMessage } from "../services/snsVerify.js";
import { addSuppression, processQueue, queueEmail, queueSms } from "../services/messaging.js";
import { listTemplates, previewTemplate, renderTemplate } from "../services/messageTemplates.js";
import { recordWebhookEvent } from "../jobs/alerts.js";
import { logSecurityEvent } from "../utils/securityLog.js";

// POST /api/messaging/ses-events  (public; protected by SNS signature)
export async function sesEvents(req, res) {
  let m;
  try { m = typeof req.body === "string" ? JSON.parse(req.body) : req.body; } catch { m = null; }
  if (!m || !(await verifySnsMessage(m))) {
    await recordWebhookEvent("ses", "bad_signature", "SNS signature check failed", req);
    return res.status(403).json({ error: "Invalid signature" });
  }
  try {
    if (m.Type === "SubscriptionConfirmation") {
      const u = new URL(m.SubscribeURL);
      if (/^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname)) await fetch(u, { signal: AbortSignal.timeout(8000) }).catch(() => {});
      await recordWebhookEvent("ses", "ok", "subscription confirmation");
      return res.json({ ok: true });
    }
    if (m.Type === "Notification") {
      const ev = JSON.parse(m.Message);
      const kind = ev.notificationType || ev.eventType;
      if (kind === "Bounce" && ev.bounce?.bounceType === "Permanent") {
        for (const r of ev.bounce.bouncedRecipients || []) await addSuppression(r.emailAddress, "bounce", r.diagnosticCode || null);
      } else if (kind === "Complaint") {
        for (const r of ev.complaint?.complainedRecipients || []) await addSuppression(r.emailAddress, "complaint", ev.complaint?.complaintFeedbackType || null);
      }
      await recordWebhookEvent("ses", "ok", kind || "notification");
    }
    res.json({ ok: true });
  } catch (err) {
    await recordWebhookEvent("ses", "error", err.message);
    res.status(500).json({ error: "Could not process event" });
  }
}

// ---- admin Messages screen ---------------------------------------------------
export async function listMessages(req, res) {
  const { status, channel, q } = req.query;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const where = []; const params = [];
  if (status) { params.push(status); where.push(`status = $${params.length}`); }
  if (channel) { params.push(channel); where.push(`channel = $${params.length}`); }
  if (q) { params.push(`%${q}%`); where.push(`(to_address ILIKE $${params.length} OR subject ILIKE $${params.length})`); }
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT id, channel, to_address, template, subject, status, attempts, last_error, created_at, sent_at
     FROM messages ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const { rows: counts } = await pool.query(`SELECT channel, status, count(*)::int AS n FROM messages GROUP BY channel, status`);
  const { rows: sup } = await pool.query(`SELECT address, reason, created_at FROM email_suppressions ORDER BY created_at DESC LIMIT 100`);
  res.json({ messages: rows, counts, suppressions: sup });
}

export async function resendMessage(req, res) {
  const { rows } = await pool.query(
    `UPDATE messages SET status='queued', attempts=0, last_error=NULL, next_attempt_at=now()
     WHERE id=$1 AND status IN ('failed','suppressed') RETURNING id, to_address, channel`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Only failed or suppressed messages can be resent" });
  if (rows[0].channel === "email") {
    const { rows: s } = await pool.query("SELECT 1 FROM email_suppressions WHERE address=$1", [rows[0].to_address]);
    if (s[0]) {
      await pool.query(`UPDATE messages SET status='suppressed', last_error='Address is on the suppression list' WHERE id=$1`, [rows[0].id]);
      return res.status(409).json({ error: "That address is suppressed after a bounce or complaint. Remove it from the suppression list first." });
    }
  }
  await processQueue({ limit: 1, ids: [rows[0].id] });
  const { rows: after } = await pool.query("SELECT id, status, last_error FROM messages WHERE id=$1", [rows[0].id]);
  res.json({ message: after[0] });
}

export async function removeSuppression(req, res) {
  const { rowCount } = await pool.query("DELETE FROM email_suppressions WHERE address = $1", [String(req.params.address).toLowerCase()]);
  if (!rowCount) return res.status(404).json({ error: "Not on the suppression list" });
  await logSecurityEvent("suppression_removed", { userId: req.user.id, req, detail: { address: req.params.address } });
  res.json({ ok: true });
}

export async function testSend(req, res) {
  const { channel = "email", to, template = "generic" } = req.body || {};
  if (!to) return res.status(400).json({ error: "'to' is required" });
  const out = renderTemplate(template, { subject: "EPHAAG test message", message: "If you can read this, sending works." });
  const row = channel === "sms"
    ? await queueSms({ to, text: out.sms || "EPHAAG test message: sending works.", template })
    : await queueEmail({ to, subject: out.subject, html: out.html, text: out.text, template, raw: true });
  await processQueue({ limit: 1, ids: [row.id] });
  const { rows } = await pool.query("SELECT id, status, last_error FROM messages WHERE id=$1", [row.id]);
  res.json({ message: rows[0] });
}

export function templatesList(req, res) { res.json({ templates: listTemplates() }); }
export function templatePreview(req, res) {
  const p = previewTemplate(req.params.name);
  if (!p) return res.status(404).json({ error: "Unknown template" });
  res.json(p);
}
