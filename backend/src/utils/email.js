import nodemailer from "nodemailer";

// If real SMTP credentials are in .env, use them (production) — go live by
// setting SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, FROM_EMAIL in
// backend/.env.
//
// Without them (development/testing), emails are composed and logged in
// full — recipient, subject, body, attachment names — but never actually
// sent over the network. This is deliberate: this environment's outbound
// network access is restricted to an allowlist that doesn't include any
// mail service (real SMTP or test services like Ethereal both fail with a
// hard network denial), so a "fake test inbox" approach isn't reliable
// here. The JSON transport requires no network call at all, which makes
// the whole apply -> approve -> upload -> activate -> reminder flow fully
// testable without ever touching the network.

function buildTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // Fail fast rather than hanging the request for minutes if the SMTP
      // server is unreachable or slow — a mail hiccup should never block
      // the underlying business action for long.
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  }
  return nodemailer.createTransport({ jsonTransport: true });
}

let transporter = null;
function getTransporter() {
  if (!transporter) transporter = buildTransporter();
  return transporter;
}

// attachments: [{ filename, path }]
export async function sendMail({ to, subject, html, attachments }) {
  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: process.env.FROM_EMAIL || "EPHAAG Farms <no-reply@ephaagfarms.test>",
      to,
      subject,
      html,
      attachments,
    });

    if (!process.env.SMTP_HOST) {
      // Dev/test mode — nothing was actually sent. Log it so the trigger
      // and content can be verified during testing.
      console.log(`[email:dev-mode, not sent] "${subject}" -> ${to}` +
        (attachments?.length ? ` (attachments: ${attachments.map((a) => a.filename).join(", ")})` : ""));
    }
    return { sent: !!process.env.SMTP_HOST, messageId: info.messageId };
  } catch (err) {
    // Never let an email failure break the underlying business action
    // (approving an application, sending a reminder, etc.) — log and move on.
    console.error(`[email] Failed to send "${subject}" to ${to}:`, err.message);
    return { sent: false, error: err.message };
  }
}
