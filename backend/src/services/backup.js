// Phase 20: the nightly database backup.
//   1. pg_dump (custom format) of the whole database
//   2. encrypted (AES-256-GCM) with BACKUP_ENCRYPTION_KEY
//   3. stored in TWO places: a private backup bucket (Cloudflare R2, kept apart from the database host) and a second
//      cloud provider (any S3-compatible service)
//   4. each copy is checked after upload (size) and old copies are removed after 30 days (the newest 3 are always kept)
// Uploaded files get no extra protection beyond what the app already does (agreed in Phase 20).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { S3Client, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { pool } from "../db/pool.js";
import { encryptFile, sha256File, assertKey } from "./backupCrypto.js";

export const RETENTION_DAYS = () => Number(process.env.BACKUP_RETENTION_DAYS) > 0 ? Number(process.env.BACKUP_RETENTION_DAYS) : 30;
const KEEP_NEWEST = 3;
const PREFIX = "db/";
const has = (k) => !!(process.env[k] && String(process.env[k]).trim());
const retryMs = () => (Number.isFinite(Number(process.env.BACKUP_RETRY_MS)) ? Number(process.env.BACKUP_RETRY_MS) : 5000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Only add request checksums when a service requires them: several S3-compatible stores (R2, Backblaze) reject the newer defaults.
const COMPAT = { requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED" };

/** The two places a backup goes. A place is "configured" when every setting it needs is there. */
export function backupTargets(env = process.env) {
  const h = (k) => !!(env[k] && String(env[k]).trim());
  const primary = (h("R2_ACCOUNT_ID") || h("R2_ENDPOINT")) && h("R2_ACCESS_KEY_ID") && h("R2_SECRET_ACCESS_KEY") && h("R2_BACKUP_BUCKET")
    ? { id: "primary", label: "Cloudflare R2 (backup bucket)", bucket: env.R2_BACKUP_BUCKET,
        client: () => new S3Client({ region: "auto", endpoint: env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY }, forcePathStyle: true, ...COMPAT }) }
    : null;
  const secondary = h("BACKUP2_ENDPOINT") && h("BACKUP2_BUCKET") && h("BACKUP2_ACCESS_KEY_ID") && h("BACKUP2_SECRET_ACCESS_KEY")
    ? { id: "secondary", label: `Second provider (${new URL(env.BACKUP2_ENDPOINT).hostname})`, bucket: env.BACKUP2_BUCKET,
        client: () => new S3Client({ region: env.BACKUP2_REGION || "auto", endpoint: env.BACKUP2_ENDPOINT,
          credentials: { accessKeyId: env.BACKUP2_ACCESS_KEY_ID, secretAccessKey: env.BACKUP2_SECRET_ACCESS_KEY }, forcePathStyle: true, ...COMPAT }) }
    : null;
  return { primary, secondary };
}

const dbUrl = () => process.env.BACKUP_DATABASE_URL || process.env.DATABASE_URL;

function run(cmd, args, { timeoutMs = 30 * 60000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${cmd} took longer than ${Math.round(timeoutMs / 60000)} minutes and was stopped`)); }, timeoutMs);
    child.on("error", (e) => { clearTimeout(timer); reject(new Error(e.code === "ENOENT" ? `${cmd} is not installed on this server. Install the PostgreSQL client tools (see docs/BACKUP-AND-RESTORE.md).` : e.message)); });
    child.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`${cmd} failed (exit ${code}): ${err.trim().split("\n").slice(-3).join(" ")}`)); });
  });
}

export async function pgDumpVersion() {
  return new Promise((resolve) => {
    const c = spawn("pg_dump", ["--version"]); let out = "";
    c.stdout.on("data", (d) => { out += d; }); c.on("error", () => resolve(null)); c.on("close", (code) => resolve(code === 0 ? out.trim() : null));
  });
}

async function putWithRetry(target, key, file, contentType, size) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const c = target.client();
      await c.send(new PutObjectCommand({ Bucket: target.bucket, Key: key, Body: fs.createReadStream(file), ContentLength: size, ContentType: contentType }));
      const head = await c.send(new HeadObjectCommand({ Bucket: target.bucket, Key: key }));
      if (Number(head.ContentLength) !== size) throw new Error(`stored size ${head.ContentLength} does not match ${size}`);
      return;
    } catch (err) {
      last = err;
      if (attempt < 3) await sleep(retryMs() * attempt);
    }
  }
  throw new Error(`${target.label}: ${last.message}`);
}

async function putJson(target, key, obj) {
  const body = Buffer.from(JSON.stringify(obj, null, 2));
  await target.client().send(new PutObjectCommand({ Bucket: target.bucket, Key: key, Body: body, ContentLength: body.length, ContentType: "application/json" }));
}

/** Every backup object in a store (newest first). */
export async function listStore(target) {
  const out = []; let token;
  do {
    const r = await target.client().send(new ListObjectsV2Command({ Bucket: target.bucket, Prefix: PREFIX, ContinuationToken: token }));
    for (const o of r.Contents || []) out.push({ key: o.Key, size: Number(o.Size), lastModified: o.LastModified });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return out.sort((a, b) => b.lastModified - a.lastModified);
}

/** Remove backups older than the retention period, but never the newest few. Returns how many were removed. */
export async function applyRetention(target, now = new Date()) {
  const dumps = (await listStore(target)).filter((o) => o.key.endsWith(".dump.enc"));
  const cutoff = now.getTime() - RETENTION_DAYS() * 86400000;
  let removed = 0;
  for (const o of dumps.slice(KEEP_NEWEST)) {
    if (new Date(o.lastModified).getTime() < cutoff) {
      const c = target.client();
      await c.send(new DeleteObjectCommand({ Bucket: target.bucket, Key: o.key }));
      await c.send(new DeleteObjectCommand({ Bucket: target.bucket, Key: o.key.replace(/\.dump\.enc$/, ".manifest.json") }));
      removed++;
    }
  }
  return removed;
}

export async function runBackup({ now = new Date(), trigger = "schedule" } = {}) {
  const prod = process.env.NODE_ENV === "production";
  const { primary, secondary } = backupTargets();
  const problems = [];
  if (!has("BACKUP_ENCRYPTION_KEY") || String(process.env.BACKUP_ENCRYPTION_KEY).length < 32) problems.push("BACKUP_ENCRYPTION_KEY is missing or shorter than 32 characters");
  if (!primary) problems.push("the backup bucket is not configured (R2_BACKUP_BUCKET and the R2 access keys)");
  if (!secondary) problems.push("the second provider is not configured (BACKUP2_ENDPOINT, BACKUP2_BUCKET, BACKUP2_ACCESS_KEY_ID, BACKUP2_SECRET_ACCESS_KEY)");
  if (!dbUrl()) problems.push("there is no database address to back up");
  // Production must be fully set up (the runner turns the error into an alert). A development machine without
  // a backup bucket just skips, and one with a bucket but no second provider still backs up to the one it has.
  if (prod && problems.length) throw new Error(`Backups are not fully set up: ${problems.join("; ")}`);
  if (!primary || !has("BACKUP_ENCRYPTION_KEY") || !dbUrl()) return { skipped: true, reason: problems.join("; ") };
  assertKey(process.env.BACKUP_ENCRYPTION_KEY);

  const { rows: [run] } = await pool.query(
    `INSERT INTO backup_runs (trigger, started_at, secondary_configured) VALUES ($1, now(), $2) RETURNING id`, [trigger, !!secondary]);
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ephaag-backup-"));
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");   // 20261103-020000
  const key = `${PREFIX}${stamp.slice(0, 4)}/${stamp.slice(4, 6)}/ephaag-${stamp}.dump.enc`;
  const manifestKey = key.replace(/\.dump\.enc$/, ".manifest.json");
  const plain = path.join(dir, "dump"), enc = path.join(dir, "dump.enc");
  const state = { primary_ok: false, secondary_ok: secondary ? false : null, bytes: null, sha256: null, deleted: 0 };
  const errors = [];
  try {
    await run_("pg_dump", ["--format=custom", "--no-owner", "--no-acl", `--file=${plain}`, `--dbname=${dbUrl()}`]);
    state.sha256 = await sha256File(plain);
    const plainBytes = (await fs.promises.stat(plain)).size;
    state.bytes = await encryptFile(plain, enc, process.env.BACKUP_ENCRYPTION_KEY);
    const { rows: [tbl] } = await pool.query(`SELECT count(*)::int AS tables FROM information_schema.tables WHERE table_schema = 'public'`);
    const migrationFiles = fs.readdirSync(new URL("../db/migrations", import.meta.url)).filter((f) => f.endsWith(".sql")).length;
    const manifest = { app: "EPHAAG Farms", createdAt: now.toISOString(), object: key, encryptedBytes: state.bytes, plainBytes, plainSha256: state.sha256,
      format: "pg_dump custom, AES-256-GCM (see docs/BACKUP-AND-RESTORE.md)", tables: tbl.tables, migrationFiles, retentionDays: RETENTION_DAYS() };
    for (const t of [primary, secondary].filter(Boolean)) {
      try {
        await putWithRetry(t, key, enc, "application/octet-stream", state.bytes);
        await putJson(t, manifestKey, manifest);
        state[`${t.id}_ok`] = true;
        state.deleted += await applyRetention(t, now).catch((e) => { errors.push(`${t.label} cleanup: ${e.message}`); return 0; });
      } catch (err) { errors.push(err.message); }
    }
  } catch (err) {
    errors.push(err.message);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
  const ok = state.primary_ok && (secondary ? state.secondary_ok : !prod);
  const status = ok ? "ok" : state.primary_ok || state.secondary_ok ? "partial" : "failed";
  const missingSecondary = !secondary && prod ? "the second provider is not configured" : null;
  const error = [...errors, missingSecondary].filter(Boolean).join(" | ") || null;
  await pool.query(
    `UPDATE backup_runs SET finished_at = now(), status = $2, object_key = $3, bytes = $4, sha256 = $5, primary_ok = $6, secondary_ok = $7, deleted_old = $8, error = $9 WHERE id = $1`,
    [run.id, status, state.bytes ? key : null, state.bytes, state.sha256, state.primary_ok, state.secondary_ok, state.deleted, error]);
  const result = { status, key, bytes: state.bytes, primary: state.primary_ok, secondary: state.secondary_ok, removedOld: state.deleted };
  // Anything short of two good copies is a failure the runner turns into an alert (email to the admins and an SMS).
  if (status !== "ok") throw new Error(`Backup ${status}: ${error}`);
  return result;
}
const run_ = run;

export async function backupStatus(now = new Date()) {
  const { rows: runs } = await pool.query(
    `SELECT id, trigger, started_at, finished_at, status, object_key, bytes, primary_ok, secondary_ok, secondary_configured, deleted_old, error
       FROM backup_runs ORDER BY started_at DESC LIMIT 15`);
  const { rows: [lastOk] } = await pool.query(`SELECT started_at, finished_at, object_key, bytes FROM backup_runs WHERE status = 'ok' ORDER BY started_at DESC LIMIT 1`);
  const { primary, secondary } = backupTargets();
  const ageH = lastOk ? (now.getTime() - new Date(lastOk.started_at).getTime()) / 3600000 : null;
  return {
    configured: { encryptionKey: has("BACKUP_ENCRYPTION_KEY") && String(process.env.BACKUP_ENCRYPTION_KEY).length >= 32, primary: primary ? primary.label : null, secondary: secondary ? secondary.label : null,
      directDatabaseAddress: has("BACKUP_DATABASE_URL") },
    retentionDays: RETENTION_DAYS(),
    pgDump: await pgDumpVersion(),
    lastOk: lastOk || null,
    hoursSinceLastOk: ageH === null ? null : Math.round(ageH * 10) / 10,
    stale: ageH === null || ageH > 26,
    runs,
  };
}

/** Used by the restore script and the tests: download one object from a store into a local file. */
export async function downloadObject(target, key, toPath) {
  const r = await target.client().send(new GetObjectCommand({ Bucket: target.bucket, Key: key }));
  await new Promise((resolve, reject) => { const w = fs.createWriteStream(toPath); r.Body.pipe(w); w.on("finish", resolve); w.on("error", reject); r.Body.on("error", reject); });
}
