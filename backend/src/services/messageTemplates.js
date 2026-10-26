// Branded email layout + a template per message type. Later phases add their
// own templates by calling registerTemplate().

const GREEN = "#14532d";
const RED = "#c81020";

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function htmlToText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<br\s*\/?>|<\/p>|<\/h\d>|<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// One shared design (EPHAAG header, green and red, plain footer).
export function brandWrap(innerHtml, { title = "" } = {}) {
  const origin = (process.env.FRONTEND_ORIGIN || "http://localhost:5173").split(",")[0].trim();
  return `<!doctype html><html><body style="margin:0;background:#f4f4f0;font-family:Arial,Helvetica,sans-serif;color:#1c1917;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
<tr><td style="background:${GREEN};padding:18px 24px;border-bottom:4px solid ${RED};">
<span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:1px;">EPHAAG FARMS</span>
<span style="color:#d9f99d;font-size:12px;display:block;">Feeding Humanity with Safe Food</span></td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55;">${title ? `<h2 style="margin:0 0 12px;color:${GREEN};font-size:18px;">${escapeHtml(title)}</h2>` : ""}${innerHtml}</td></tr>
<tr><td style="padding:14px 24px;background:#fafaf9;font-size:12px;color:#78716c;">EPHAAG Farms, Yelwa Makaranta, Opp. College of Agric, Bauchi State.<br>This is an automated message. <a href="${origin}" style="color:${RED};">${origin}</a></td></tr>
</table></td></tr></table></body></html>`;
}

const templates = new Map();

// fn(data) -> { subject, html, text?, sms? }  (html is the inner body; it is wrapped for you)
export function registerTemplate(name, fn, sampleData = {}) {
  templates.set(name, { fn, sampleData });
}

export function renderTemplate(name, data = {}) {
  const t = templates.get(name);
  if (!t) throw Object.assign(new Error(`Unknown message template: ${name}`), { status: 400 });
  const out = t.fn(data);
  const html = brandWrap(out.html, { title: out.title || "" });
  return { subject: out.subject, html, text: out.text || htmlToText(out.html), sms: out.sms || null };
}

export function listTemplates() {
  return [...templates.entries()].map(([name, t]) => ({ name, sampleData: t.sampleData }));
}

export function previewTemplate(name) {
  const t = templates.get(name);
  if (!t) return null;
  return renderTemplate(name, t.sampleData);
}

// ---- foundation templates -------------------------------------------------
registerTemplate("generic", (d) => ({
  subject: d.subject || "Message from EPHAAG Farms",
  title: d.title || "",
  html: d.html || `<p>${escapeHtml(d.message || "")}</p>`,
  sms: d.sms || null,
}), { subject: "Sample notice", message: "This is a sample message." });

registerTemplate("welcome", (d) => ({
  subject: "Welcome to EPHAAG Farms",
  title: "Welcome",
  html: `<p>Hi ${escapeHtml(d.name)},</p><p>Your EPHAAG Farms account has been created — you're all set.</p>`,
}), { name: "Amina" });

registerTemplate("password_reset", (d) => ({
  subject: "Reset your EPHAAG Farms password",
  title: "Reset your password",
  html: `<p>Hi ${escapeHtml(d.name)},</p><p>Click the link below to set a new password. This link expires in ${escapeHtml(d.minutes)} minutes.</p>
<p><a href="${escapeHtml(d.url)}">${escapeHtml(d.url)}</a></p>
<p>If you didn't request this, you can ignore this email — your password won't change.</p>`,
}), { name: "Amina", minutes: 30, url: "https://example.com/reset-password?token=abc" });

registerTemplate("account_locked", (d) => ({
  subject: "Several failed sign-in attempts on your account",
  title: "Account temporarily locked",
  html: `<p>Hi ${escapeHtml(d.name)},</p><p>There were several wrong-password attempts on your EPHAAG Farms account, so it is locked for ${escapeHtml(d.minutes)} minutes. If this was you, wait and try again, or reset your password. If it was not you, we recommend resetting your password.</p>`,
  sms: `EPHAAG: several wrong-password attempts on your account. It is locked for ${d.minutes} min. Not you? Reset your password.`,
}), { name: "Amina", minutes: 15 });

registerTemplate("job_alert", (d) => ({
  subject: `[EPHAAG alert] ${d.title}`,
  title: d.title,
  html: `<p>${escapeHtml(d.message)}</p>`,
  sms: `EPHAAG alert: ${d.title}`.slice(0, 160),
}), { title: "A scheduled job failed", message: "Job sample failed: example error." });
