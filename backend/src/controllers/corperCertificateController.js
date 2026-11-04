import { pool } from "../db/pool.js";
import { loadMemberProgress } from "./corperLearningController.js";
import { sendMail } from "../utils/email.js";
import { notifyUser } from "../services/messaging.js";
import { registerTemplate, escapeHtml as escHtml } from "../services/messageTemplates.js";
import {
  newVerificationCode,
  formatCertNumber,
  normaliseCode,
  renderCertificatePdf,
  publicBase,
} from "../utils/certificate.js";

// Learning progress, certificates and the "batch complete" release all meet
// here. Rules (2026-10-21 spec):
//  * when a PAID member has completed EVERY approved NYSC AGROALLIED SAED course, a
//    certificate record is created at once (unique number + long code) but
//    stays HIDDEN;
//  * marking the member's batch complete makes the batch's certificates
//    visible and emails each member;
//  * a member who finishes AFTER their batch was closed gets it immediately;
//  * Phase 14: a certificate is only ever released to a member who has given their consent to share
//    their details with NYSC AGROALLIED SAED. Without it the certificate stays hidden, the member is
//    told (banner and a message), and it is released the moment they tick consent.

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

// ---------------------------------------------------------------------
// Progress, read through the SAME loader the member dashboard, the admin
// progress table and the export use (v27 learning), so they cannot disagree.
// "Completed every course" = paid now AND every live NYSC AGROALLIED SAED course earned.
// ---------------------------------------------------------------------
export async function courseProgressSummary(userId, runner = pool) {
  const s = await loadMemberProgress(userId, runner);
  return { total: s.total, done: s.completed, paid: s.paid };
}

// ---------------------------------------------------------------------
// Issuing
// ---------------------------------------------------------------------
async function nextNumber(client) {
  const { rows } = await client.query(`SELECT nextval('corper_certificate_seq') AS n`);
  return formatCertNumber(rows[0].n);
}

// Creates the member's certificate if (and only if) they are eligible and
// don't have one yet. Safe to call any number of times, concurrently: the
// profile row is locked, and user_id is UNIQUE on the table.
export async function issueCertificateIfEligible(userId) {
  const client = await pool.connect();
  let result = { issued: false, certificate: null, released: false };
  try {
    await client.query("BEGIN");
    const { rows: profRows } = await client.query(
      `SELECT cp.*, u.name FROM corper_profiles cp JOIN users u ON u.id = cp.user_id
       WHERE cp.user_id = $1 FOR UPDATE OF cp`,
      [userId]
    );
    const prof = profRows[0];
    if (!prof) {
      await client.query("ROLLBACK");
      return result;
    }
    const existing = await client.query(`SELECT * FROM corper_certificates WHERE user_id = $1`, [userId]);
    if (existing.rows[0]) {
      await client.query("ROLLBACK");
      return { issued: false, certificate: existing.rows[0], released: false };
    }
    const prog = await courseProgressSummary(userId, client);
    if (!prog.paid || prog.total < 1 || prog.done < prog.total) {
      await client.query("ROLLBACK");
      return result;
    }
    // Is the member's batch already closed? Then it is visible from the start.
    const { rows: batchRows } = await client.query(
      `SELECT completed FROM corp_batches WHERE service_year = $1 AND batch = $2 AND stream = $3`,
      [prof.service_year, prof.batch, prof.stream]
    );
    const closed = !!batchRows[0]?.completed && !!prof.consent_data;
    const number = await nextNumber(client);
    const { rows } = await client.query(
      `INSERT INTO corper_certificates
         (user_id, number, verification_code, holder_name, state_code, service_year, batch, stream, visible, visible_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, CASE WHEN $9 THEN now() ELSE NULL END)
       RETURNING *`,
      [userId, number, newVerificationCode(), prof.name, prof.state_code, prof.service_year, prof.batch, prof.stream, closed]
    );
    await client.query("COMMIT");
    result = { issued: true, certificate: rows[0], released: closed };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  if (result.released) {
    // Batch already closed: tell this member now (never blocks the caller).
    notifyOne(result.certificate.id).catch((e) => console.error("[certificate email]", e.message));
  }
  return result;
}

registerTemplate("corps_consent_needed", (d) => ({
  subject: "Your certificate is waiting for your consent",
  title: "One tick and your certificate is released",
  html: `<p>Hello ${escHtml(d.name)}, your batch is complete and your certificate is ready, but we cannot release it until you agree to share your details with NYSC AGROALLIED SAED.</p>
<p>Sign in, open your Corps room and tick the consent box at the top of the page. Your certificate is released at once.</p>`,
  sms: "EPHAAG: your certificate is ready. Sign in and tick your consent to share details with NYSC AGROALLIED SAED to release it.",
}), { name: "Ada" });

/** When a member gives consent after their batch was closed, release the certificate that was held back (and tell them). */
export async function releaseCertificateIfReady(userId) {
  const client = await pool.connect();
  let cert = null;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT c.id FROM corper_certificates c
         JOIN corper_profiles cp ON cp.user_id = c.user_id
         JOIN corp_batches b ON b.service_year = cp.service_year AND b.batch = cp.batch AND b.stream = cp.stream
        WHERE c.user_id = $1 AND c.visible = FALSE AND cp.consent_data = TRUE AND b.completed = TRUE
        FOR UPDATE OF c`, [userId]);
    if (rows[0]) {
      const up = await client.query(`UPDATE corper_certificates SET visible = TRUE, visible_at = now() WHERE id = $1 RETURNING id`, [rows[0].id]);
      cert = up.rows[0];
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  if (cert) notifyOne(cert.id).catch((e) => console.error("[certificate email]", e.message));
  return { released: !!cert };
}

/** Tell every member of a closed batch whose certificate is held back for missing consent (once each). */
export async function remindMissingConsent(batch) {
  const { rows } = await pool.query(
    `SELECT c.id, c.user_id, u.name FROM corper_certificates c
       JOIN corper_profiles cp ON cp.user_id = c.user_id JOIN users u ON u.id = c.user_id
      WHERE cp.service_year = $1 AND cp.batch = $2 AND cp.stream = $3
        AND c.visible = FALSE AND cp.consent_data = FALSE AND c.consent_reminded_at IS NULL`,
    [batch.service_year, batch.batch, batch.stream]);
  for (const r of rows) {
    await pool.query(`UPDATE corper_certificates SET consent_reminded_at = now() WHERE id = $1`, [r.id]);
    await notifyUser(r.user_id, "corps_consent_needed", { name: r.name }, { allChannels: true }).catch(() => {});
  }
  return rows.length;
}

// ---------------------------------------------------------------------
// Emails, one by one, small delay, outcome recorded per certificate
// ---------------------------------------------------------------------
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const emailDelayMs = () => {
  const n = Number(process.env.CERT_EMAIL_DELAY_MS);
  return Number.isFinite(n) && n >= 0 ? n : 1500;
};

function readyEmail(name) {
  const link = `${publicBase()}/dashboard/corper`;
  return {
    subject: "Your EPHAAG Farms certificate is ready",
    html:
      `<p>Dear ${escapeHtml(name)},</p>` +
      `<p>Congratulations, your batch has been marked complete and your EPHAAG Farms training certificate is now ready.</p>` +
      `<p>Sign in and open the <strong>Certificate</strong> tab to download it as a PDF:<br/><a href="${link}">${link}</a></p>` +
      `<p>The certificate carries a QR code anyone can scan to confirm it is genuine.</p>` +
      `<p>EPHAAG Farms</p>`,
  };
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Sends the "ready" email for one certificate and records what happened.
//   sent, SMTP accepted it
//   failed, SMTP error (can be resent)
//   not_configured, no SMTP on this server, so nothing really left (can be resent later)
//   no_email, the member has no email address
export async function notifyOne(certId) {
  const { rows } = await pool.query(
    `SELECT c.id, c.visible, u.name, u.email FROM corper_certificates c JOIN users u ON u.id = c.user_id WHERE c.id = $1`,
    [certId]
  );
  const c = rows[0];
  if (!c || !c.visible) return null;
  let status;
  let error = null;
  if (!c.email) {
    status = "no_email";
  } else {
    const { subject, html } = readyEmail(c.name);
    const r = await sendMail({ to: c.email, subject, html, immediate: true });
    if (r.sent) status = "sent";
    else if (r.error) {
      status = "failed";
      error = String(r.error).slice(0, 300);
    } else status = "not_configured";
  }
  await pool.query(
    `UPDATE corper_certificates
       SET notify_status = $2, notify_error = $3, notify_attempts = notify_attempts + 1,
           notified_at = CASE WHEN $2 = 'sent' THEN now() ELSE notified_at END
     WHERE id = $1`,
    [certId, status, error]
  );
  return status;
}

const activeRuns = new Set();
export const isNotifyRunning = (batchId) => activeRuns.has(batchId);

// Emails every visible certificate of the batch whose status is in
// `statuses`, one at a time. Fire-and-forget from the request handler; the
// per-batch lock stops two runs overlapping.
export async function runBatchNotifications(batch, statuses = ["pending"]) {
  if (activeRuns.has(batch.id)) return { started: false, reason: "already running" };
  const { rows } = await pool.query(
    `SELECT c.id FROM corper_certificates c
       JOIN corper_profiles p ON p.user_id = c.user_id
      WHERE p.service_year = $1 AND p.batch = $2 AND p.stream = $3
        AND c.visible = TRUE AND c.notify_status = ANY($4::text[])
      ORDER BY c.issued_at, c.id`,
    [batch.service_year, batch.batch, batch.stream, statuses]
  );
  activeRuns.add(batch.id);
  (async () => {
    try {
      for (let i = 0; i < rows.length; i++) {
        try {
          await notifyOne(rows[i].id);
        } catch (err) {
          console.error("[certificate email]", err.message);
        }
        if (i < rows.length - 1) await delay(emailDelayMs());
      }
    } finally {
      activeRuns.delete(batch.id);
    }
  })();
  return { started: true, queued: rows.length };
}

// ---------------------------------------------------------------------
// Member endpoints
// ---------------------------------------------------------------------
// GET /api/corpers/certificate
export async function myCertificate(req, res) {
  const userId = req.user.id;
  const prog = await courseProgressSummary(userId);
  const { rows: certRows } = await pool.query(`SELECT * FROM corper_certificates WHERE user_id = $1`, [userId]);
  const cert = certRows[0];
  const { rows: bRows } = await pool.query(
    `SELECT b.due_date, b.completed FROM corper_profiles p
       LEFT JOIN corp_batches b ON b.service_year = p.service_year AND b.batch = p.batch AND b.stream = p.stream
      WHERE p.user_id = $1`,
    [userId]
  );
  const batch = bRows[0] || {};
  const { rows: cRows } = await pool.query(`SELECT consent_data FROM corper_profiles WHERE user_id = $1`, [userId]);
  const consentGiven = !!cRows[0]?.consent_data;
  const base = { progress: { done: prog.done, total: prog.total }, batch: { dueDate: batch.due_date || null, closed: !!batch.completed }, consentGiven, needsConsent: !consentGiven };

  // Decision 1: members who have not finished see "not completed", no
  // certificate and no email. A finished member whose batch is still open
  // sees "awaiting batch completion" (the record exists but stays hidden).
  if (cert?.visible) {
    return res.json({
      ...base,
      status: "ready",
      certificate: {
        number: cert.number,
        issueDate: cert.visible_at,
        holderName: cert.holder_name,
        stateCode: cert.state_code,
        serviceYear: cert.service_year,
        batch: cert.batch,
        verificationCode: cert.verification_code,
      },
    });
  }
  // Phase 14: a finished member who has not given consent sees that, whatever the state of their batch.
  if (cert && !consentGiven) return res.json({ ...base, status: "awaiting_consent" });
  if (cert) return res.json({ ...base, status: "awaiting_batch" });
  res.json({ ...base, status: "not_completed" });
}

// GET /api/corpers/certificate/download, only a VISIBLE certificate of the
// signed-in member.
export async function downloadMyCertificate(req, res) {
  const { rows } = await pool.query(`SELECT * FROM corper_certificates WHERE user_id = $1 AND visible = TRUE`, [req.user.id]);
  const cert = rows[0];
  if (!cert) return res.status(404).json({ error: "Your certificate is not available yet" });
  const pdf = await renderCertificatePdf(cert);
  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${cert.number}.pdf"`,
    "Content-Length": pdf.length,
    "Cache-Control": "private, no-store",
  });
  res.send(pdf);
}

// ---------------------------------------------------------------------
// Public verification, name, batch and issue date only
// ---------------------------------------------------------------------
const hits = new Map(); // ip -> [timestamps]
function tooManyAttempts(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < 60_000)) hits.delete(k);
  return recent.length > 30;
}

// GET /api/certificates/verify/:code
export async function verifyCertificate(req, res) {
  if (tooManyAttempts(req.ip)) return res.status(429).json({ valid: false, error: "Too many attempts. Please wait a minute." });
  const code = normaliseCode(req.params.code);
  if (code.length < 20 || code.length > 32) return res.status(404).json({ valid: false });
  const { rows } = await pool.query(
    `SELECT holder_name, service_year, batch, visible_at FROM corper_certificates WHERE verification_code = $1 AND visible = TRUE`,
    [code]
  );
  const c = rows[0];
  if (!c) return res.status(404).json({ valid: false });
  res.json({
    valid: true,
    name: c.holder_name,
    batch: [c.service_year, c.batch ? `Batch ${c.batch}` : null].filter(Boolean).join(" · "),
    issueDate: c.visible_at,
  });
}

export { httpError };
