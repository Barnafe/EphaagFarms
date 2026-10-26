// Phase 17 — scheduled jobs
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { api, call, API, STRICT, db, loginAdmin, newUser, waitForMessage, sleep } from "../helpers/api.mjs";
import { registerJob, runJob, tick, isDue, lastDailyInstant } from "../../src/jobs/runner.js";
import { raiseAlert } from "../../src/jobs/alerts.js";
import { pool } from "../../src/db/pool.js";
import { registerAllJobs } from "../../src/jobs/index.js";

registerAllJobs();

after(async () => { await db.end(); await pool.end(); });

const lagos = (iso) => new Date(new Date(iso).getTime() - 3600000); // Lagos wall clock (UTC+1) -> UTC instant

test("daily jobs use Lagos time and catch up when the server was asleep", () => {
  const job = { name: "x", daily: "08:00" };
  const day = "2026-10-23";
  // 07:59 Lagos: not yet
  assert.equal(isDue(job, { last_ok_at: lagos(`2026-10-22T08:00:05Z`) }, lagos(`${day}T07:59:00Z`)), false);
  // 08:01 Lagos, last ran yesterday: due
  assert.equal(isDue(job, { last_ok_at: lagos(`2026-10-22T08:00:05Z`), last_run_at: lagos(`2026-10-22T08:00:05Z`) }, lagos(`${day}T08:01:00Z`)), true);
  // server slept until 14:00 Lagos: still runs (catch-up)
  assert.equal(isDue(job, { last_ok_at: lagos(`2026-10-22T08:00:05Z`), last_run_at: lagos(`2026-10-22T08:00:05Z`) }, lagos(`${day}T14:00:00Z`)), true);
  // already done today: not due again
  assert.equal(isDue(job, { last_ok_at: lagos(`${day}T08:02:00Z`), last_run_at: lagos(`${day}T08:02:00Z`) }, lagos(`${day}T14:00:00Z`)), false);
  // never ran, after the slot: due; before the slot (previous slot was yesterday) also due only once
  assert.equal(isDue(job, null, lagos(`${day}T09:00:00Z`)), true);
  // failed this morning: not retried every minute, but retried after 15 minutes
  const failedAt = lagos(`${day}T08:00:10Z`);
  assert.equal(isDue(job, { last_ok_at: lagos("2026-10-22T08:00:05Z"), last_run_at: failedAt }, new Date(failedAt.getTime() + 60000)), false);
  assert.equal(isDue(job, { last_ok_at: lagos("2026-10-22T08:00:05Z"), last_run_at: failedAt }, new Date(failedAt.getTime() + 16 * 60000)), true);
  // the slot instant itself
  assert.equal(lastDailyInstant(lagos(`${day}T09:00:00Z`), "08:00"), lagos(`${day}T08:00:00Z`).getTime());
  assert.equal(lastDailyInstant(lagos(`${day}T07:00:00Z`), "08:00"), lagos(`2026-10-22T08:00:00Z`).getTime());
});

test("interval jobs are due only after their interval", () => {
  const job = { name: "y", every: 5 };
  const now = new Date("2026-10-23T10:00:00Z");
  assert.equal(isDue(job, { last_run_at: new Date(now - 4 * 60000) }, now), false);
  assert.equal(isDue(job, { last_run_at: new Date(now - 5 * 60000) }, now), true);
  assert.equal(isDue(job, null, now), true);
});

test("two copies cannot run the same job at once (database lock)", async () => {
  let started = 0;
  registerJob({ name: "lock-test", every: 1 }, async () => { started++; await sleep(600); return { n: started }; });
  const [a, b] = await Promise.all([runJob("lock-test"), runJob("lock-test")]);
  const statuses = [a.status, b.status].sort();
  assert.deepEqual(statuses, ["ok", "skipped"]);
  assert.equal(started, 1);
  const runs = await db.query("SELECT count(*)::int AS n FROM job_runs WHERE job_name='lock-test'");
  assert.equal(runs.rows[0].n, 1);
});

test("running a job twice has no double effect (investment reminders, file cleanup, message queue)", async () => {
  const before = await db.query("SELECT count(*)::int AS n FROM messages");
  for (const name of ["file-cleanup", "message-queue", "log-pruning"]) {
    const one = await runJob(name, { trigger: "test" });
    const two = await runJob(name, { trigger: "test" });
    assert.equal(one.status, "ok", name);
    assert.equal(two.status, "ok", name);
  }
  const after = await db.query("SELECT count(*)::int AS n FROM messages");
  assert.equal(after.rows[0].n, before.rows[0].n, "no messages invented");
});

test("a failing job is logged, alerts admins by email and the named person by SMS, at most once an hour", async () => {
  registerJob({ name: "always-fails", every: 1 }, async () => { throw new Error("kaboom"); });
  const t0 = new Date();
  const r1 = await runJob("always-fails", { trigger: "test", now: t0 });
  assert.equal(r1.status, "failed");
  const run = (await db.query("SELECT status, error FROM job_runs WHERE job_name='always-fails' ORDER BY id DESC LIMIT 1")).rows[0];
  assert.equal(run.status, "failed");
  assert.match(run.error, /kaboom/);
  const email = await waitForMessage("template='job_alert' AND subject ILIKE '%always-fails%'", []);
  assert.ok(email, "admin email");
  const countAlerts = async () => (await db.query("SELECT count(*)::int AS n FROM messages WHERE template='job_alert' AND (subject ILIKE '%always-fails%' OR body_text ILIKE '%always-fails%')")).rows[0].n;
  const n1 = await countAlerts();
  assert.ok(n1 >= 2, "email + sms queued");
  await runJob("always-fails", { trigger: "test", now: new Date(t0.getTime() + 10 * 60000) });
  assert.equal(await countAlerts(), n1, "second failure 10 minutes later is throttled");
  await runJob("always-fails", { trigger: "test", now: new Date(t0.getTime() + 61 * 60000) });
  assert.ok((await countAlerts()) > n1, "an hour later it alerts again");
});

test("repeated webhook errors raise one alert", async () => {
  const { recordWebhookEvent } = await import("../../src/jobs/alerts.js");
  const before = (await db.query("SELECT count(*)::int AS n FROM messages WHERE template='job_alert'")).rows[0].n;
  for (let i = 0; i < 4; i++) await recordWebhookEvent("paystack-test", "error", "db down");
  const after = (await db.query("SELECT count(*)::int AS n FROM messages WHERE template='job_alert'")).rows[0].n;
  assert.ok(after > before, "alert raised at the 3rd error");
  const count = async () => (await db.query("SELECT count(*)::int AS n FROM messages WHERE template='job_alert' AND body_text ILIKE '%paystack-test%'")).rows[0].n;
  const n1 = await count();
  assert.ok(n1 >= 1, "alert queued (one email per admin, plus the SMS)");
  for (let i = 0; i < 3; i++) await recordWebhookEvent("paystack-test", "error", "db still down");
  assert.equal(await count(), n1, "further errors within the hour add no more alerts");
});

test("the secured tick address wakes the server and runs what is due; wrong secret is refused", async () => {
  assert.equal((await api("/system/tick")).status, 403);
  assert.equal((await api("/system/tick", { headers: { "x-tick-secret": "wrong" } })).status, 403);
  await db.query("UPDATE job_state SET last_run_at = now() - interval '10 minutes' WHERE job_name = 'message-queue'");
  const ok = await api("/system/tick", { headers: { "x-tick-secret": process.env.TICK_SECRET } });
  assert.equal(ok.status, 200);
  assert.ok(Array.isArray(ok.data.ran));
  const ranNames = ok.data.ran.map((r) => r.name);
  assert.ok(ranNames.includes("message-queue"));
  // second tick straight away: interval jobs are not due again
  const again = await api("/system/tick", { method: "POST", headers: { "x-tick-secret": process.env.TICK_SECRET } });
  assert.ok(!again.data.ran.map((r) => r.name).includes("message-queue"));
  // not enabled at all when no secret is configured (server B)
  assert.equal((await call(STRICT, "/api/system/tick", { headers: { "x-tick-secret": "x" } })).status, 404);
  const bad = await db.query("SELECT 1 FROM webhook_events WHERE source='tick' AND status='bad_signature'");
  assert.ok(bad.rowCount >= 1, "wrong secret was logged");
});

test("system status shows every job, queues and last webhook; Run now works; health is public", async () => {
  const admin = await loginAdmin();
  const s = await api("/system/status", { token: admin });
  assert.equal(s.status, 200);
  const names = s.data.jobs.map((j) => j.name);
  for (const n of ["message-queue", "investment-reminders", "file-cleanup", "log-pruning"]) assert.ok(names.includes(n), n);
  const mq = s.data.jobs.find((j) => j.name === "message-queue");
  assert.ok(mq.lastRun?.status && mq.nextRun, "last and next run");
  assert.ok(Array.isArray(s.data.queues));
  const run = await api("/system/jobs/file-cleanup/run", { method: "POST", token: admin });
  assert.equal(run.data.status, "ok");
  assert.equal((await api("/system/jobs/not-a-job/run", { method: "POST", token: admin })).status, 404);
  assert.equal((await api("/system/status", { token: (await newUser()).token })).status, 403);
  const h = await fetch(`${API}/health`);
  const hb = await h.json();
  assert.equal(hb.database, true);
  assert.equal(hb.ok, true);
});

test("alert phone can be set (validated) by admins", async () => {
  const admin = await loginAdmin();
  assert.equal((await api("/system/alert-settings", { method: "PUT", token: admin, body: { alertSmsPhone: "123" } })).status, 400);
  const ok = await api("/system/alert-settings", { method: "PUT", token: admin, body: { alertSmsPhone: "0803 555 0101" } });
  assert.equal(ok.data.alertSmsPhone, "+2348035550101");
  assert.equal((await api("/system/alert-settings", { token: admin })).data.alertSmsPhone, "+2348035550101");
});
