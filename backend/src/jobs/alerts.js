import { pool, detached } from "../db/pool.js";
import { getSetting } from "../utils/settings.js";
import { notifyAdmins, queueSms, processQueue } from "../services/messaging.js";
import { normalizeNgPhone } from "../utils/phone.js";
import { clientIp } from "../utils/securityLog.js";

const ALERT_THROTTLE_MS = 60 * 60 * 1000; // at most one alert per key per hour

/**
 * Email every admin and SMS the named person. Throttled per key so a failing
 * job or webhook cannot flood anyone. Returns true if an alert was sent.
 */
export async function raiseAlert(key, title, message, { now = new Date() } = {}) {
  const name = `alert:${key}`;
  const { rows } = await pool.query("SELECT last_alert_at FROM job_state WHERE job_name = $1", [name]);
  const last = rows[0]?.last_alert_at ? new Date(rows[0].last_alert_at).getTime() : 0;
  if (now.getTime() - last < ALERT_THROTTLE_MS) return false;
  await pool.query(
    `INSERT INTO job_state (job_name, last_alert_at) VALUES ($1, $2)
     ON CONFLICT (job_name) DO UPDATE SET last_alert_at = EXCLUDED.last_alert_at`, [name, now]);
  try {
    await notifyAdmins("job_alert", { title, message });
    const phone = normalizeNgPhone((await getSetting("alert_sms_phone", null)) || process.env.ALERT_SMS_PHONE);
    if (phone) await queueSms({ to: phone, text: `EPHAAG alert: ${title}`.slice(0, 160), template: "job_alert" });
    detached(() => setImmediate(() => processQueue({ limit: 20 }).catch(() => {})));
  } catch (err) {
    console.error("[alerts] could not queue alert:", err.message);
  }
  return true;
}

/** Log a payment/email webhook outcome and alert on repeated errors or bad signatures. */
export async function recordWebhookEvent(source, status, detail = null, req = null) {
  try {
    await pool.query(`INSERT INTO webhook_events (source, status, detail) VALUES ($1,$2,$3)`,
      [source, status, [detail, req ? `ip ${clientIp(req)}` : null].filter(Boolean).join(" | ") || null]);
    if (status === "bad_signature") {
      await raiseAlert(`webhook:${source}:signature`, `Webhook with a bad signature (${source})`,
        `A ${source} webhook arrived with an invalid signature. If this keeps happening someone may be probing the endpoint.`);
    } else if (status === "error") {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM webhook_events WHERE source=$1 AND status='error' AND created_at > now() - interval '10 minutes'`, [source]);
      if (rows[0].n >= 3) {
        await raiseAlert(`webhook:${source}:errors`, `Webhook errors (${source})`,
          `The ${source} webhook has failed ${rows[0].n} times in the last 10 minutes. Last error: ${detail}`);
      }
    }
  } catch (err) {
    console.error("[webhook-log] failed:", err.message);
  }
}

/**
 * An exceptional case that needs a person: email every admin and text the named alert phone,
 * straight away (not throttled: each one is a real item waiting for someone).
 */
export async function notifyAttention(templateName, data, smsText) {
  try {
    await notifyAdmins(templateName, data);
    const phone = normalizeNgPhone((await getSetting("alert_sms_phone", null)) || process.env.ALERT_SMS_PHONE);
    if (phone && smsText) await queueSms({ to: phone, text: String(smsText).slice(0, 160), template: templateName });
    detached(() => setImmediate(() => processQueue({ limit: 20 }).catch(() => {})));
  } catch (err) {
    console.error("[attention] could not notify admins:", err.message);
  }
}
