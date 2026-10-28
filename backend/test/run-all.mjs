// One command for every backend test:   npm test   (from backend/)
// Builds a fresh test database, starts the stand-in services (fake R2, SES,
// SMS), starts the app, runs every suite in order and prints one summary.
//
// Needs: Postgres reachable with PG_ADMIN_URL (default postgres:postgres@localhost),
// and `psql` + python3 with `requests` for the older Python suites (skipped
// with a warning if python3/requests is missing; set SKIP_PYTHON=1 to skip on purpose).
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { startFakeS3 } from "./standins/fakeS3.mjs";
import { startFakeMail } from "./standins/fakeMail.mjs";
import { startFakePaystack } from "./standins/fakePaystack.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.join(here, "..");
const ADMIN_URL = process.env.PG_ADMIN_URL || "postgresql://postgres:postgres@localhost:5432/postgres";
const TEST_DB = process.env.TEST_DB_NAME || "ephaag_test";
const DB_URL = ADMIN_URL.replace(/\/[^/]*$/, `/${TEST_DB}`);
const ADMIN_EMAIL = "admin@ephaag.test", ADMIN_PASSWORD = "Admin1234";

const GUARD_LOG = path.join(os.tmpdir(), "ephaag-pool-guard.log");
const results = [];
const children = [];
let serverA = null;
let serverC = null;
let serverBaseA = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Async on purpose: the stand-in services live in THIS process, so it must keep
// answering their requests while a suite runs.
function run(label, cmd, args, { env = {}, cwd = backend, allowFail = false } = {}) {
  console.log(`\n=== ${label} ===`);
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: "inherit" });
    child.on("error", () => { results.push({ label, ok: false }); resolve(false); });
    child.on("exit", (code) => {
      const ok = code === 0;
      results.push({ label, ok });
      if (!ok && !allowFail) console.log(`--- ${label} FAILED`);
      resolve(ok);
    });
  });
}

async function freshDatabase() {
  const c = new pg.Client({ connectionString: ADMIN_URL });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await c.query(`CREATE DATABASE ${TEST_DB}`);
  await c.end();
}

function startServer(port, env) {
  const child = spawn("node", ["src/server.js"], { cwd: backend, env: { ...process.env, ...env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  child.getLog = () => log;
  return child;
}

async function waitFor(url, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.status < 500 || r.status === 503) return true; } catch { /* not up yet */ }
    await sleep(300);
  }
  return false;
}

async function main() {
  fs.rmSync(GUARD_LOG, { force: true });
  await freshDatabase();
  const s3 = await startFakeS3();
  const mail = await startFakeMail();
  const paystack = await startFakePaystack();
  const snsKeys = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const snsPublic = snsKeys.publicKey.export({ type: "spki", format: "pem" });
  const snsPrivate = snsKeys.privateKey.export({ type: "pkcs8", format: "pem" });

  const base = {
    POOL_GUARD: "1", POOL_GUARD_LOG: GUARD_LOG,
    DATABASE_URL: DB_URL, DB_SSL: "false", JWT_SECRET: "test-secret-test-secret-test-secret",
    NODE_ENV: "development", SMTP_HOST: "", SAVINGS_DEPOSIT_WINDOW_OVERRIDE: "true", PAYSTACK_SECRET_KEY: "", PAYMENT_ALLOW_SIMULATED: "true",
    ADMIN_SETUP_CODE: "test-setup-code", FRONTEND_ORIGIN: "http://localhost:5173",
    CERT_EMAIL_DELAY_MS: "50", EMAIL_RATE_PER_SECOND: "1000",
    // stand-ins
    R2_ENDPOINT: s3.url, R2_ACCESS_KEY_ID: "test", R2_SECRET_ACCESS_KEY: "test",
    R2_PUBLIC_BUCKET: "pub", R2_PRIVATE_BUCKET: "priv", R2_PUBLIC_BASE_URL: `${s3.url}/pub`,
    EMAIL_DRIVER: "ses", SES_REGION: "us-east-1", SES_ENDPOINT: mail.url, AWS_ACCESS_KEY_ID: "test", AWS_SECRET_ACCESS_KEY: "test",
    SMS_DRIVER: "termii", SMS_API_URL: `${mail.url}/sms/send`, SMS_API_KEY: "test", SMS_SENDER_ID: "EPHAAG",
    SNS_TEST_CERT_PEM: snsPublic, ALERT_SMS_PHONE: "08031234567",
  };

  if (!(await run("Migrate test database", "node", ["src/db/migrate.js"], { env: base }))) return finish(1);
  await run("Seed prices", "node", ["src/db/seed-prices.js"], { env: base, allowFail: true });
  if (!(await run("Seed admin", "node", ["src/db/seed-admin.js", "--email", ADMIN_EMAIL, "--password", ADMIN_PASSWORD, "--name", "Test Admin"], { env: base }))) return finish(1);

  // Server A: relaxed rate limits so the older suites can register many users; tick address on.
  serverBaseA = { ...base, RATE_LIMIT_MULTIPLIER: "1000", JOB_TICK_SECRET: "tick-secret", JOB_RUNNER: "off" };
  serverA = startServer(4000, serverBaseA);
  // Server B: real limits, production mode (strict CORS, no local-disk fallback).
  startServer(4001, { ...base, NODE_ENV: "production", FRONTEND_ORIGIN: "https://app.example.test", JOB_RUNNER: "off", DB_SSL: "false" });
  // Server C: relaxed limits like A, but with Paystack switched on (pointing at the stand-in).
  // Kept separate because the older corps suites expect a server with NO Paystack key.
  serverC = startServer(4003, { ...base, RATE_LIMIT_MULTIPLIER: "1000", JOB_RUNNER: "off", PAYSTACK_SECRET_KEY: paystack.secret, PAYSTACK_BASE_URL: paystack.url, FRONTEND_ORIGIN: "http://localhost:5173" });
  if (!(await waitFor("http://localhost:4003/health"))) { console.log("Paystack-enabled server did not start"); return finish(1); }
  if (!(await waitFor("http://localhost:4000/health")) || !(await waitFor("http://localhost:4001/health"))) {
    console.log("Servers did not start"); children.forEach((c) => console.log(c.getLog?.())); return finish(1);
  }

  const testEnv = {
    ...base, API_URL: "http://localhost:4000", API_STRICT_URL: "http://localhost:4001", API_PAY_URL: "http://localhost:4003", PAYSTACK_URL: paystack.url, PAYSTACK_SECRET: paystack.secret,
    S3_URL: s3.url, MAIL_URL: mail.url, SNS_TEST_PRIVATE_KEY: snsPrivate, TICK_SECRET: "tick-secret",
    TEST_ADMIN_EMAIL: ADMIN_EMAIL, TEST_ADMIN_PASSWORD: ADMIN_PASSWORD,
  };

  if (!process.env.ONLY_PYTHON) await run("Unit tests (no database)", "node", ["--test", "test/corperLearning.test.mjs", "test/preflight.test.mjs"], { env: testEnv });

  if (process.env.SKIP_PYTHON === "1") console.log("\n(Python suites skipped on request)");
  else {
    const py = spawnSync("python3", ["-c", "import requests"], { stdio: "ignore" });
    if (py.status !== 0) { console.log("\nWARNING: python3 + requests not available, older suites NOT run"); results.push({ label: "Python suites", ok: false }); }
    else {
      const pyEnv = { ...testEnv, PGURL: DB_URL };
      const only = process.env.ONLY_PYTHON;
      for (const f of ["corps_certificates_test.py", "big_round_test.py", "corps_learning_test.py", "store_test.py"].filter((x) => !only || x === only)) {
        // The certificate suite checks what happens when this server has NO
        // email provider, so it gets an app instance configured that way.
        if (f === "corps_certificates_test.py") {
          serverA.kill("SIGTERM"); await sleep(800);
          serverA = startServer(4000, { ...serverBaseA, EMAIL_DRIVER: "log" }); children.push(serverA);
          await waitFor("http://localhost:4000/health");
        }
        await run(`Python suite ${f}`, "python3", [f], { env: pyEnv });
        if (f === "corps_certificates_test.py") {
          serverA.kill("SIGTERM"); await sleep(800);
          serverA = startServer(4000, serverBaseA); children.push(serverA);
          await waitFor("http://localhost:4000/health");
        }
      }
    }
  }
  // Last on purpose: these create lots of users/messages and are written to cope with a used database.
  if (!process.env.ONLY_PYTHON) await run("Foundations API tests (phases 15-19)", "node", ["--test", "--test-concurrency=1", ...(process.env.API_TEST_NAME ? ["--test-name-pattern", process.env.API_TEST_NAME] : []), ...(process.env.API_TEST_FILES ? process.env.API_TEST_FILES.split(",") : ["test/api/*.test.mjs"])], { env: testEnv });
  return finish(0, s3, mail, paystack);
}

async function dumpMessageState() {
  try {
    const c = new pg.Client({ connectionString: DB_URL }); await c.connect();
    const a = await c.query("SELECT channel, status, count(*)::int AS n FROM messages GROUP BY 1,2 ORDER BY 1,2");
    const q = await c.query("SELECT template, to_address, attempts, last_error, created_at FROM messages WHERE status='queued' ORDER BY created_at LIMIT 5");
    console.log("\n--- messages by status ---\n" + JSON.stringify(a.rows) + "\n--- oldest queued ---\n" + JSON.stringify(q.rows));
    await c.end();
  } catch (e) { console.log("could not read messages:", e.message); }
}

function finish(code, s3, mail, paystack) {
  // Pool guard: any code that asked for a second database connection while holding one.
  const guard = fs.existsSync(GUARD_LOG) ? fs.readFileSync(GUARD_LOG, "utf8").trim().split("\n").filter(Boolean) : [];
  if (guard.length) console.log("\n--- pool guard violations ---\n" + [...new Set(guard.map((l) => l.replace(/^\S+ /, "")))].slice(0, 10).join("\n"));
  results.push({ label: "Pool guard (no code holds a database connection while asking for another)", ok: guard.length === 0 });
  children.forEach((c) => c.kill("SIGTERM"));
  s3?.close(); mail?.close(); paystack?.close();
  console.log("\n================ SUMMARY ================");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.label}`);
  const failed = results.filter((r) => !r.ok).length;
  if (failed && process.env.SHOW_SERVER_LOG) return dumpMessageState().then(() => finishNow(code, failed));
  return finishNow(code, failed);
}

function finishNow(code, failed) {
  if (failed && process.env.SHOW_SERVER_LOG) {
    console.log("\n--- app log A (last 40 lines) ---\n" + (serverA?.getLog?.() || "").split("\n").slice(-40).join("\n"));
    console.log("\n--- app log C, Paystack-enabled (last 60 lines) ---\n" + (serverC?.getLog?.() || "").split("\n").slice(-60).join("\n"));
  }
  console.log(failed ? `\n${failed} suite(s) FAILED` : "\nAll suites passed");
  process.exit(code || (failed ? 1 : 0));
}

main().catch((e) => { console.error(e); children.forEach((c) => c.kill("SIGTERM")); process.exit(1); });
