import test from "node:test";
import assert from "node:assert/strict";
import { checkEnvironment, summarise, formatReport } from "../src/utils/preflight.js";

const good = {
  NODE_ENV: "production", DATABASE_URL: "postgresql://u:p@ep-x.neon.tech/db?sslmode=require", JWT_SECRET: "k9fj2Lq8xZp0Rt5vWb7nYc3mHs6uDa1E4gQ",
  ADMIN_SETUP_CODE: "kestrel-lantern-77", FRONTEND_ORIGIN: "https://ephaag-farms.onrender.com",
  R2_ACCOUNT_ID: "abc", R2_ACCESS_KEY_ID: "k", R2_SECRET_ACCESS_KEY: "s", R2_PUBLIC_BUCKET: "pub", R2_PRIVATE_BUCKET: "priv", R2_PUBLIC_BASE_URL: "https://pub-abc.r2.dev",
  SES_REGION: "eu-west-1", AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "b", FROM_EMAIL: "EPHAAG <no-reply@ephaag.com>",
  SMS_API_KEY: "k", SMS_SENDER_ID: "EPHAAG", ALERT_SMS_PHONE: "08031234567", PAYSTACK_SECRET_KEY: "sk_live_abc", JOB_TICK_SECRET: "tick", CSP_MODE: "enforce",
};
const names = (r, level) => r.filter((x) => x.level === level).map((x) => x.name);

test("a complete production environment passes with nothing to fix", () => {
  const r = checkEnvironment(good);
  assert.deepEqual(names(r, "fail"), []);
  assert.deepEqual(names(r, "warn"), []);
});

test("an empty environment fails on the things that matter", () => {
  const f = names(checkEnvironment({ NODE_ENV: "production" }), "fail");
  for (const k of ["DATABASE_URL", "JWT_SECRET", "FRONTEND_ORIGIN", "R2", "EMAIL", "PAYSTACK_SECRET_KEY"]) assert.ok(f.includes(k), k);
});

test("each check explains the fix", () => {
  const text = formatReport(checkEnvironment({ NODE_ENV: "production" }));
  assert.match(text, /FAIL  DATABASE_URL/);
  assert.match(text, /->/);
});

test("test keys and placeholder secrets are warned about; live keys are not", () => {
  assert.ok(names(checkEnvironment({ ...good, PAYSTACK_SECRET_KEY: "sk_test_abc" }), "warn").includes("PAYSTACK_SECRET_KEY"));
  assert.ok(names(checkEnvironment({ ...good, JWT_SECRET: "change-me-change-me-change-me-change-me" }), "warn").includes("JWT_SECRET"));
  assert.ok(names(checkEnvironment({ ...good, JWT_SECRET: "short" }), "fail").includes("JWT_SECRET"));
  assert.ok(names(checkEnvironment({ ...good, ADMIN_SETUP_CODE: "test-setup-code" }), "warn").includes("ADMIN_SETUP_CODE"));
});

test("production safety: simulated payments, loosened rate limits and a non-https site are flagged", () => {
  assert.ok(names(checkEnvironment({ ...good, PAYMENT_ALLOW_SIMULATED: "true" }), "warn").includes("PAYMENT_ALLOW_SIMULATED"));
  assert.ok(names(checkEnvironment({ ...good, RATE_LIMIT_MULTIPLIER: "1000" }), "fail").includes("RATE_LIMIT_MULTIPLIER"));
  assert.ok(names(checkEnvironment({ ...good, FRONTEND_ORIGIN: "http://example.com" }), "warn").includes("FRONTEND_ORIGIN"));
  assert.ok(names(checkEnvironment({ ...good, CSP_MODE: undefined }), "warn").includes("CSP_MODE"));
});

test("R2 without the public address, SMTP instead of SES, and sleeping-host warnings", () => {
  const { R2_PUBLIC_BASE_URL, ...noBase } = good;
  assert.ok(names(checkEnvironment(noBase), "fail").includes("R2_PUBLIC_BASE_URL"));
  const smtp = { ...good, SES_REGION: undefined, AWS_ACCESS_KEY_ID: undefined, AWS_SECRET_ACCESS_KEY: undefined, SMTP_HOST: "smtp.example.com" };
  assert.deepEqual(names(checkEnvironment(smtp), "fail"), []);
  assert.ok(names(checkEnvironment({ ...good, JOB_TICK_SECRET: undefined }), "warn").includes("JOB_TICK_SECRET"));
  const s = summarise(checkEnvironment({ NODE_ENV: "production" }));
  assert.ok(s.fail >= 5);
});

test("development is not held to production standards", () => {
  const r = checkEnvironment({ NODE_ENV: "development", DATABASE_URL: "postgres://x", JWT_SECRET: "x".repeat(40) });
  assert.deepEqual(names(r, "fail"), []);
});
