import nodemailer from "nodemailer";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { pool, detached } from "../db/pool.js";
import { normalizeNgPhone } from "../utils/phone.js";
import { brandWrap, htmlToText, renderTemplate } from "./messageTemplates.js";

const MAX_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 30, 120, 360];
const SMS_MAX_LEN = 160;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Send soon after queueing instead of waiting for the next scheduled run.
function kick() { detached(() => setImmediate(() => processQueue({ limit: 20 }).catch((e) => console.error("[messaging] drain failed:", e.message)))); }

// ---------------------------------------------------------------------------
// Email providers. EMAIL_DRIVER=ses | smtp | log  (auto: ses if SES_REGION +
// keys, else smtp if SMTP_HOST, else log).
// ---------------------------------------------------------------------------
export function emailDriverName() {
  const explicit = (process.env.EMAIL_DRIVER || "").toLowerCase();
  if (explicit) return explicit;
  if (process.env.SES_REGION && process.env.AWS_ACCESS_KEY_ID) return "ses";
  if (process.env.SMTP_HOST) return "smtp";
  return "log";
}

let transporterCache = { name: null, t: null };
function getTransporter() {
  const name = emailDriverName();
  if (transporterCache.name === name && transporterCache.t) return transporterCache.t;
  let t;
  if (name === "ses") {
    const client = new SESv2Client({
      region: process.env.SES_REGION || "us-east-1",
      ...(process.env.SES_ENDPOINT ? { endpoint: process.env.SES_ENDPOINT } : {}),
    });
    t = nodemailer.createTransport({ SES: { sesClient: client, SendEmailCommand } });
  } else if (name === "smtp") {
    t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000,
    });
  } else {
    t = null;
  }
  transporterCache = { name, t };
  return t;
}

export function resetEmailTransportForTests() { transporterCache = { name: null, t: null }; }

const FROM = () => process.env.FROM_EMAIL || "EPHAAG Farms <no-reply@ephaagfarms.test>";

async function deliverEmail(msg) {
  const t = getTransporter();
  if (!t) {
    // No provider configured: nothing is sent. Reported as a failure so the
    // message stays visible in the Messages log and can be resent later.
    console.log(`[email:no-provider, not sent] "${msg.subject}" -> ${msg.to_address}`);
    const err = new Error("No email provider configured (EMAIL_DRIVER / SES / SMTP)");
    err.permanent = true;
    throw err;
  }
  const attachments = Array.isArray(msg.attachments) ? msg.attachments : undefined;
  const info = await t.sendMail({
    from: FROM(), to: msg.to_address, subject: msg.subject,
    html: msg.body_html, text: msg.body_text || undefined, attachments,
  });
  return info.messageId || info.response || "sent";
}

// ---------------------------------------------------------------------------
// SMS provider adapter. SMS_DRIVER=termii | log. Termii's JSON API; other
// Nigerian providers are added as another case here.
// ---------------------------------------------------------------------------
export function smsDriverName() {
  return (process.env.SMS_DRIVER || (process.env.SMS_API_KEY ? "termii" : "log")).toLowerCase();
}

async function deliverSms(msg) {
  const driver = smsDriverName();
  if (driver === "termii") {
    const url = process.env.SMS_API_URL || "https://api.ng.termii.com/api/sms/send";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: msg.to_address.replace(/^\+/, ""),
        from: process.env.SMS_SENDER_ID,
        sms: msg.body_text,
        type: "plain",
        // "dnd" route reaches numbers on the national Do-Not-Disturb list.
        channel: process.env.SMS_CHANNEL || "dnd",
        api_key: process.env.SMS_API_KEY,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`SMS provider error ${res.status}: ${body.message || "unknown"}`);
    return body.message_id || "sms-sent";
  }
  console.log(`[sms:no-provider, not sent] -> ${msg.to_address}: ${msg.body_text}`);
  const err = new Error("No SMS provider configured (SMS_DRIVER / SMS_API_KEY)");
  err.permanent = true;
  throw err;
}

// ---------------------------------------------------------------------------
// Queue API
// ---------------------------------------------------------------------------
export async function isSuppressed(address) {
  const { rows } = await pool.query("SELECT 1 FROM email_suppressions WHERE address = $1", [String(address).toLowerCase()]);
  return rows.length > 0;
}

/** Add an email to the outbox. `html` is the inner body unless raw:true. */
export async function queueEmail({ to, subject, html, text, attachments, template = null, userId = null, raw = false, delayMs = 0 }) {
  if (!to) throw new Error("queueEmail: 'to' is required");
  const address = String(to).trim().toLowerCase();
  const finalHtml = raw ? html : brandWrap(html || "");
  const finalText = text || htmlToText(html || "");
  const suppressed = await isSuppressed(address);
  const { rows } = await pool.query(
    `INSERT INTO messages (channel, to_address, to_user_id, template, subject, body_html, body_text, attachments, status, last_error, next_attempt_at)
     VALUES ('email',$1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9, now() + ($10 || ' milliseconds')::interval) RETURNING *`,
    [address, userId, template, subject, finalHtml, finalText, attachments ? JSON.stringify(attachments) : null,
     suppressed ? "suppressed" : "queued", suppressed ? "Address is on the suppression list" : null, String(delayMs)]
  );
  return rows[0];
}

export async function queueSms({ to, text, template = null, userId = null }) {
  const phone = normalizeNgPhone(to);
  if (!phone) throw Object.assign(new Error("Invalid Nigerian phone number"), { status: 400 });
  let body = String(text || "").trim();
  if (body.length > SMS_MAX_LEN) body = body.slice(0, SMS_MAX_LEN - 1) + "…";
  const limit = Number(process.env.SMS_DAILY_LIMIT_PER_PERSON || 5);
  const { rows: countRows } = await pool.query(
    `SELECT count(*)::int AS n FROM messages WHERE channel='sms' AND to_address=$1 AND status IN ('queued','sending','sent') AND created_at > now() - interval '24 hours'`,
    [phone]
  );
  const overLimit = countRows[0].n >= limit;
  const { rows } = await pool.query(
    `INSERT INTO messages (channel, to_address, to_user_id, template, body_text, status, last_error)
     VALUES ('sms',$1,$2,$3,$4,$5,$6) RETURNING *`,
    [phone, userId, template, body, overLimit ? "suppressed" : "queued", overLimit ? "Daily SMS limit reached for this number" : null]
  );
  if (!overLimit) kick();
  return rows[0];
}

/**
 * Send a templated notification to a member: email if they have one, SMS only
 * for phone-only members (key alerts only, so the template must carry `sms`).
 */
export async function notifyUser(userId, templateName, data = {}, { allChannels = false } = {}) {
  const { rows } = await pool.query("SELECT id, name, email, phone FROM users WHERE id = $1", [userId]);
  const u = rows[0];
  if (!u) return null;
  const out = renderTemplate(templateName, { name: u.name, ...data });
  if (u.email) {
    const row = await queueEmail({ to: u.email, subject: out.subject, html: out.html, text: out.text, template: templateName, userId, raw: true });
    // Critical notices (a share about to be taken down) go to every channel the member has.
    if (allChannels && u.phone && out.sms) await queueSms({ to: u.phone, text: out.sms, template: templateName, userId }).catch(() => {});
    kick();
    return row;
  }
  if (u.phone && out.sms) {
    return queueSms({ to: u.phone, text: out.sms, template: templateName, userId });
  }
  return null;
}

export async function notifyAdmins(templateName, data = {}) {
  const { rows } = await pool.query("SELECT id, email FROM users WHERE role_type = 'admin' AND email IS NOT NULL");
  const out = [];
  for (const a of rows) out.push(await notifyUser(a.id, templateName, data));
  return out.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Worker: sends one message at a time, rate limited, retried with backoff.
// ---------------------------------------------------------------------------
async function sendOne(msg) {
  if (msg.channel === "email") {
    if (await isSuppressed(msg.to_address)) {
      await pool.query(`UPDATE messages SET status='suppressed', last_error='Address is on the suppression list' WHERE id=$1`, [msg.id]);
      return "suppressed";
    }
    try {
      const providerId = await deliverEmail(msg);
      await pool.query(`UPDATE messages SET status='sent', provider_id=$2, sent_at=now(), attempts=attempts+1, last_error=NULL WHERE id=$1`, [msg.id, providerId]);
      return "sent";
    } catch (err) { return failOrRetry(msg, err); }
  }
  try {
    const providerId = await deliverSms(msg);
    await pool.query(`UPDATE messages SET status='sent', provider_id=$2, sent_at=now(), attempts=attempts+1, last_error=NULL WHERE id=$1`, [msg.id, providerId]);
    return "sent";
  } catch (err) { return failOrRetry(msg, err); }
}

async function failOrRetry(msg, err) {
  const attempts = msg.attempts + 1;
  const giveUp = err.permanent || attempts >= MAX_ATTEMPTS;
  if (giveUp) {
    await pool.query(`UPDATE messages SET status='failed', attempts=$2, last_error=$3 WHERE id=$1`, [msg.id, attempts, String(err.message).slice(0, 500)]);
    return "failed";
  }
  const mins = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
  await pool.query(
    `UPDATE messages SET status='queued', attempts=$2, last_error=$3, next_attempt_at = now() + ($4 || ' minutes')::interval WHERE id=$1`,
    [msg.id, attempts, String(err.message).slice(0, 500), String(mins)]
  );
  return "retry";
}

let draining = false;
let rerun = false;
export async function processQueue({ limit = 50, ids = null } = {}) {
  // A drain already running may have just finished looking at the queue. Ask it to look again,
  // so a message queued in that instant is picked up now instead of waiting for the next job run.
  if (draining) { rerun = true; return { skipped: true }; }
  draining = true;
  const tally = { sent: 0, failed: 0, retry: 0, suppressed: 0 };
  try {
    // Messages stuck in 'sending' (server died mid-send) go back to the queue.
    await pool.query(`UPDATE messages SET status='queued' WHERE status='sending' AND next_attempt_at < now() - interval '10 minutes'`);
    const perSec = Math.max(1, Number(process.env.EMAIL_RATE_PER_SECOND || 5));
    do {
      rerun = false;
      for (let i = 0; i < limit; i++) {
        const { rows } = await pool.query(
          `UPDATE messages SET status='sending', next_attempt_at = now()
           WHERE id = (SELECT id FROM messages WHERE status='queued' AND next_attempt_at <= now() ${ids ? "AND id = ANY($1::uuid[])" : ""}
                       ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1)
           RETURNING *`,
          ids ? [ids] : []
        );
        if (!rows[0]) break;
        const outcome = await sendOne(rows[0]);
        tally[outcome] = (tally[outcome] || 0) + 1;
        await sleep(Math.floor(1000 / perSec));
      }
    } while (rerun);
  } finally { draining = false; rerun = false; }
  return tally;
}

/**
 * Backwards-compatible entry point used by every existing caller. Queues the
 * email. With `immediate: true` it is also sent right now and the result says
 * whether it was really delivered (used by the certificate emails).
 */
export async function sendMail({ to, subject, html, text, attachments, template, userId, raw, immediate = false }) {
  try {
    const row = await queueEmail({ to, subject, html, text, attachments, template, userId, raw });
    if (row.status === "suppressed") return { sent: false, queued: false, suppressed: true, id: row.id };
    if (immediate) {
      await processQueue({ limit: 1, ids: [row.id] });
      const { rows } = await pool.query("SELECT status, provider_id, last_error FROM messages WHERE id=$1", [row.id]);
      const notConfigured = rows[0].status === "failed" && /^No email provider configured/.test(rows[0].last_error || "");
      if (notConfigured) return { sent: false, queued: false, notConfigured: true, id: row.id }; // nothing could leave this server
      return { sent: rows[0].status === "sent", queued: rows[0].status === "queued", messageId: rows[0].provider_id, error: rows[0].last_error, id: row.id };
    }
    // Kick the worker without making the caller wait for the provider.
    kick();
    return { sent: false, queued: true, id: row.id };
  } catch (err) {
    console.error(`[email] Could not queue "${subject}" to ${to}:`, err.message);
    return { sent: false, queued: false, error: err.message };
  }
}

export async function addSuppression(address, reason, detail = null) {
  const a = String(address).toLowerCase();
  await pool.query(
    `INSERT INTO email_suppressions (address, reason, detail) VALUES ($1,$2,$3) ON CONFLICT (address) DO UPDATE SET reason = EXCLUDED.reason, detail = EXCLUDED.detail`,
    [a, reason, detail]
  );
  await pool.query(`UPDATE messages SET status='suppressed', last_error='Address is on the suppression list' WHERE status='queued' AND channel='email' AND to_address=$1`, [a]);
}
