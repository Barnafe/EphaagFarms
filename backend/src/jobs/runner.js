import crypto from "node:crypto";
import { pool, connectLongLived } from "../db/pool.js";
import { raiseAlert } from "./alerts.js";

const LAGOS_OFFSET_MS = 60 * 60 * 1000; // Africa/Lagos is UTC+1 all year (no DST)
const RETRY_AFTER_FAILURE_MS = 15 * 60 * 1000;

const registry = new Map();
let lastTickAt = null;

/** spec: { name, description, every: minutes } or { name, description, daily: "HH:MM" (Lagos time) } */
export function registerJob(spec, handler) {
  if (!spec.name || (!spec.every && !spec.daily)) throw new Error("Job needs a name and every/daily");
  registry.set(spec.name, { ...spec, handler });
}
export function listRegisteredJobs() { return [...registry.values()].map(({ handler, ...s }) => s); }
export function getLastTickAt() { return lastTickAt; }

// The most recent moment (UTC) at which a daily Lagos-time job was scheduled to run.
export function lastDailyInstant(now, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const l = new Date(now.getTime() + LAGOS_OFFSET_MS);
  let inst = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate(), h, m) - LAGOS_OFFSET_MS;
  if (inst > now.getTime()) inst -= 24 * 60 * 60 * 1000;
  return inst;
}

export function nextRunAt(job, state, now) {
  if (job.every) return new Date((state?.last_run_at ? new Date(state.last_run_at).getTime() : now.getTime()) + job.every * 60000);
  return new Date(lastDailyInstant(now, job.daily) + 24 * 60 * 60 * 1000);
}

// Catch-up rule: a job is due when it has not completed since its latest scheduled moment.
export function isDue(job, state, now) {
  const lastRun = state?.last_run_at ? new Date(state.last_run_at).getTime() : 0;
  const lastOk = state?.last_ok_at ? new Date(state.last_ok_at).getTime() : 0;
  if (job.every) return now.getTime() - lastRun >= job.every * 60000;
  const inst = lastDailyInstant(now, job.daily);
  if (lastOk >= inst) return false;
  return now.getTime() - lastRun >= RETRY_AFTER_FAILURE_MS || lastRun < inst;
}

function lockKey(name) {
  return crypto.createHash("sha1").update(`job:${name}`).digest().readInt32BE(0);
}

/** Runs one job under a database lock so two server copies never run it at once. */
export async function runJob(name, { trigger = "schedule", now = new Date() } = {}) {
  const job = registry.get(name);
  if (!job) throw Object.assign(new Error(`Unknown job: ${name}`), { status: 404 });
  // The lock lives on this one dedicated connection for the whole run (a session-level advisory lock).
  const client = await connectLongLived();
  try {
    const { rows: lock } = await client.query("SELECT pg_try_advisory_lock($1) AS got", [lockKey(name)]);
    if (!lock[0].got) return { name, status: "skipped", reason: "already running elsewhere" };
    const { rows: runRows } = await pool.query(
      `INSERT INTO job_runs (job_name, trigger, started_at) VALUES ($1,$2,now()) RETURNING id`, [name, trigger]);
    const runId = runRows[0].id;
    await pool.query(
      `INSERT INTO job_state (job_name, last_run_at) VALUES ($1, now())
       ON CONFLICT (job_name) DO UPDATE SET last_run_at = now()`, [name]);
    try {
      const result = (await job.handler({ now, trigger })) ?? {};
      await pool.query(`UPDATE job_runs SET status='ok', finished_at=now(), result=$2::jsonb WHERE id=$1`, [runId, JSON.stringify(result)]);
      await pool.query(`UPDATE job_state SET last_ok_at = now() WHERE job_name=$1`, [name]);
      return { name, status: "ok", result };
    } catch (err) {
      await pool.query(`UPDATE job_runs SET status='failed', finished_at=now(), error=$2 WHERE id=$1`, [runId, String(err.stack || err.message).slice(0, 2000)]);
      console.error(`[job ${name}] failed:`, err);
      await raiseAlert(`job:${name}`, `Scheduled job failed: ${name}`, `${name} failed: ${err.message}`, { now });
      return { name, status: "failed", error: err.message };
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [lockKey(name)]).catch(() => {});
    client.release();
  }
}

/** Runs whatever is due right now. Called by the internal timer and by the outside pinger. */
export async function tick({ now = new Date(), trigger = "tick" } = {}) {
  lastTickAt = now;
  const { rows } = await pool.query("SELECT * FROM job_state");
  const states = new Map(rows.map((r) => [r.job_name, r]));
  const ran = [];
  for (const job of registry.values()) {
    if (isDue(job, states.get(job.name), now)) ran.push(await runJob(job.name, { trigger, now }));
  }
  return { at: now.toISOString(), ran };
}

let timer = null;
export function startInternalScheduler(intervalMs = 60000) {
  if (timer) return;
  timer = setInterval(() => tick({ trigger: "schedule" }).catch((e) => console.error("[scheduler] tick failed:", e.message)), intervalMs);
  timer.unref?.();
  // Catch up right after boot (a server that slept through its slot runs it now).
  setTimeout(() => tick({ trigger: "boot" }).catch((e) => console.error("[scheduler] boot tick failed:", e.message)), 5000).unref?.();
}
export function stopInternalScheduler() { if (timer) clearInterval(timer); timer = null; }

export async function systemStatus(now = new Date()) {
  const { rows: states } = await pool.query("SELECT * FROM job_state WHERE job_name NOT LIKE 'alert:%'");
  const stateMap = new Map(states.map((s) => [s.job_name, s]));
  const { rows: last } = await pool.query(
    `SELECT DISTINCT ON (job_name) job_name, status, started_at, finished_at, error, result FROM job_runs ORDER BY job_name, started_at DESC`);
  const lastMap = new Map(last.map((l) => [l.job_name, l]));
  const jobs = [...registry.values()].map((j) => ({
    name: j.name, description: j.description, schedule: j.every ? `every ${j.every} min` : `daily ${j.daily} (Lagos)`,
    lastRun: lastMap.get(j.name) || null, nextRun: nextRunAt(j, stateMap.get(j.name), now),
  }));
  const { rows: q } = await pool.query(`SELECT channel, status, count(*)::int AS n FROM messages WHERE status IN ('queued','failed') GROUP BY channel, status`);
  const { rows: wh } = await pool.query(`SELECT source, status, detail, created_at FROM webhook_events ORDER BY created_at DESC LIMIT 5`);
  const { rows: lastPay } = await pool.query(`SELECT created_at FROM webhook_events WHERE source='paystack' ORDER BY created_at DESC LIMIT 1`);
  return { now: now.toISOString(), lastTickAt, jobs, queues: q, recentWebhooks: wh, lastPaymentWebhookAt: lastPay[0]?.created_at || null };
}

/** For the public health address. */
export async function healthCheck(now = new Date()) {
  let db = false;
  try { await pool.query("SELECT 1"); db = true; } catch { /* db stays false */ }
  const upMin = process.uptime() / 60;
  const tickFresh = lastTickAt ? now.getTime() - lastTickAt.getTime() < 15 * 60000 : upMin < 15;
  return { ok: db && tickFresh, database: db, jobRunner: tickFresh, lastTickAt };
}
