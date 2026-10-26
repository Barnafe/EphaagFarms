// Checks the server's configuration for production. Used three ways:
//   npm run preflight          before you go live (prints a checklist, exits 1 on any FAIL)
//   at boot in production      logs the same checklist; only a missing or weak JWT_SECRET stops the server
//   in the test suite          so the checks themselves are tested
// Pure function: pass an environment object, get a list back.

const isUrl = (v) => { try { const u = new URL(v); return u.protocol === "https:" || u.protocol === "http:"; } catch { return false; } };

export function checkEnvironment(env = process.env) {
  const out = [];
  const add = (level, name, message, fix = null) => out.push({ level, name, message, fix });
  const has = (k) => !!(env[k] && String(env[k]).trim());
  const prod = env.NODE_ENV === "production";

  if (!prod) add("warn", "NODE_ENV", "NODE_ENV is not 'production'. Several protections (strict CORS, no local-disk uploads, no simulated payments) are only enforced in production.", "Set NODE_ENV=production on the host.");

  // --- database & secrets ---
  if (!has("DATABASE_URL")) add("fail", "DATABASE_URL", "No database connection string.", "Paste your Neon (or other Postgres) connection string.");
  else add("ok", "DATABASE_URL", "Set.");
  if (prod && has("DATABASE_URL") && !/sslmode=require/.test(env.DATABASE_URL) && env.DB_SSL !== "true") add("warn", "DB_SSL", "Managed databases need SSL.", "Set DB_SSL=true (or keep ?sslmode=require in the URL).");
  if (!has("JWT_SECRET")) add("fail", "JWT_SECRET", "No JWT secret: logins cannot be signed safely.", "Set a long random value (Render can generate one).");
  else if (String(env.JWT_SECRET).length < 32) add("fail", "JWT_SECRET", "JWT secret is shorter than 32 characters.", "Use a long random value (at least 32 characters).");
  else if (/change[-_ ]?me|secret|test|example/i.test(env.JWT_SECRET)) add("warn", "JWT_SECRET", "JWT secret looks like a placeholder.", "Use a freshly generated random value.");
  else add("ok", "JWT_SECRET", "Set and long enough.");
  if (!has("ADMIN_SETUP_CODE")) add("warn", "ADMIN_SETUP_CODE", "No admin setup code: nobody can register an Admin account from the Register page (fine after you have created yours).");
  else if (/change[-_ ]?me|test|example|1234/i.test(env.ADMIN_SETUP_CODE)) add("warn", "ADMIN_SETUP_CODE", "Admin setup code looks guessable.", "Use something private.");
  else add("ok", "ADMIN_SETUP_CODE", "Set.");

  // --- site address / CORS / links ---
  if (!has("FRONTEND_ORIGIN")) add(prod ? "fail" : "warn", "FRONTEND_ORIGIN", "Your site address is not set: Paystack return links and password-reset links will point at localhost.", "Set it to your real address, e.g. https://ephaag-farms.onrender.com");
  else if (!isUrl(String(env.FRONTEND_ORIGIN).split(",")[0].trim())) add("fail", "FRONTEND_ORIGIN", "Not a valid address.", "Use the full address starting with https://");
  else if (prod && !String(env.FRONTEND_ORIGIN).startsWith("https://")) add("warn", "FRONTEND_ORIGIN", "Not https. Payments and logins should only run over https.");
  else add("ok", "FRONTEND_ORIGIN", "Set.");

  // --- file storage ---
  const r2 = ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PUBLIC_BUCKET", "R2_PRIVATE_BUCKET"];
  const r2Ready = (has("R2_ACCOUNT_ID") || has("R2_ENDPOINT")) && r2.every(has);
  if (!r2Ready) add(prod ? "fail" : "warn", "R2", `File storage is not configured (missing: ${[(has("R2_ACCOUNT_ID") || has("R2_ENDPOINT")) ? null : "R2_ACCOUNT_ID", ...r2.filter((k) => !has(k))].filter(Boolean).join(", ")}). Uploads are refused in production without it.`, "Create two Cloudflare R2 buckets and an access key; see DEPLOYMENT.md step 5.");
  else if (!has("R2_PUBLIC_BASE_URL")) add("fail", "R2_PUBLIC_BASE_URL", "Product and profile photos need the public bucket's address.", "Enable the public address (r2.dev or your domain) on the public bucket and paste it here.");
  else add("ok", "R2", "File storage configured.");

  // --- email & SMS ---
  const sesReady = has("SES_REGION") && has("AWS_ACCESS_KEY_ID") && has("AWS_SECRET_ACCESS_KEY");
  const emailDriver = (env.EMAIL_DRIVER || (sesReady ? "ses" : has("SMTP_HOST") ? "smtp" : "log")).toLowerCase();
  if (emailDriver === "log") add(prod ? "fail" : "warn", "EMAIL", "No email provider: password resets, receipts and alerts will not be delivered (they show as failed in Admin > System > Messages).", "Set up Amazon SES (SES_REGION + AWS keys) or SMTP.");
  else if (!has("FROM_EMAIL")) add("fail", "FROM_EMAIL", "No sender address.", "Set FROM_EMAIL to an address on a domain verified in SES.");
  else add("ok", "EMAIL", `Email provider: ${emailDriver}.`);
  if (!has("SMS_API_KEY") || !has("SMS_SENDER_ID")) add("warn", "SMS", "No SMS provider: phone-only members get no payment receipts or alerts, and nobody is texted when a job fails.", "Sign up with a Nigerian SMS provider, register a sender name, then set SMS_API_KEY and SMS_SENDER_ID.");
  else add("ok", "SMS", "SMS provider configured.");
  if (!has("ALERT_SMS_PHONE")) add("warn", "ALERT_SMS_PHONE", "No named person for failure alerts (you can also set it in Admin > System).");
  else add("ok", "ALERT_SMS_PHONE", "Set.");

  // --- payments ---
  if (!has("PAYSTACK_SECRET_KEY")) add(prod ? "fail" : "warn", "PAYSTACK_SECRET_KEY", "No Paystack key: buyers will see 'Online payment unavailable'.", "Set your Paystack secret key (sk_test_... first, sk_live_... to go live).");
  else if (/^sk_test_/.test(env.PAYSTACK_SECRET_KEY)) add("warn", "PAYSTACK_SECRET_KEY", "This is a TEST key: no real money moves. Fine for rehearsal, switch to the live key to go live.");
  else if (!/^sk_live_/.test(env.PAYSTACK_SECRET_KEY)) add("warn", "PAYSTACK_SECRET_KEY", "Does not look like a Paystack secret key (expected sk_test_ or sk_live_).");
  else add("ok", "PAYSTACK_SECRET_KEY", "Live key set.");
  if (env.PAYMENT_ALLOW_SIMULATED === "true") add(prod ? "warn" : "ok", "PAYMENT_ALLOW_SIMULATED", prod ? "Set to true, but it is ignored in production. Remove it." : "Simulated share payments are on (local testing only).");

  // --- jobs on a sleeping host ---
  if (!has("JOB_TICK_SECRET")) add("warn", "JOB_TICK_SECRET", "No tick secret. On an always-on host this is fine. On a sleeping host (Render free) scheduled jobs only run while someone is using the site.", "Set a secret and point a free pinger at /api/system/tick every 5 minutes (DEPLOYMENT.md step 8).");
  else add("ok", "JOB_TICK_SECRET", "Set.");

  // --- security posture ---
  if ((env.CSP_MODE || "report-only") !== "enforce") add("warn", "CSP_MODE", "Content-security policy is in report-only mode. Once Admin > System > Security log shows no csp_violation entries after a week of normal use, set CSP_MODE=enforce.");
  if (env.RATE_LIMIT_MULTIPLIER && Number(env.RATE_LIMIT_MULTIPLIER) > 1 && prod) add("fail", "RATE_LIMIT_MULTIPLIER", "Rate limits are loosened (for load tests only).", "Remove RATE_LIMIT_MULTIPLIER from the live environment.");
  if (env.POOL_GUARD === "1" && prod) add("warn", "POOL_GUARD", "The connection guard is for tests; remove it from the live environment.");

  return out;
}

export function summarise(results) {
  return { fail: results.filter((r) => r.level === "fail").length, warn: results.filter((r) => r.level === "warn").length, ok: results.filter((r) => r.level === "ok").length };
}

export function formatReport(results) {
  const icon = { ok: "PASS", warn: "WARN", fail: "FAIL" };
  const order = { fail: 0, warn: 1, ok: 2 };
  return [...results].sort((a, b) => order[a.level] - order[b.level])
    .map((r) => `${icon[r.level]}  ${r.name}: ${r.message}${r.fix && r.level !== "ok" ? `\n        -> ${r.fix}` : ""}`).join("\n");
}
