// Phase 20: nightly encrypted backup to two places, 30 day retention, alerts on failure, and a real restore drill.
import test, { after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { api, db, newFarmer, loginAdmin, S3, uniq } from "../helpers/api.mjs";
import { pool } from "../../src/db/pool.js";
import { registerAllJobs } from "../../src/jobs/index.js";
import { runJob } from "../../src/jobs/runner.js";
import { runBackup, backupTargets, listStore, applyRetention } from "../../src/services/backup.js";

registerAllJobs();
const drills = [];
after(async () => {
  for (const d of drills) await db.query(`DROP DATABASE IF EXISTS ${d} WITH (FORCE)`).catch(() => {});
  await db.end(); await pool.end();
});

let admin;
const ENV = { ...process.env };
const keysIn = async () => (await (await fetch(`${S3}/__keys`)).json()).keys;
const urlFor = (name) => process.env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, `/${name}$1`);
const script = (...args) => spawnSync("node", ["scripts/restore-backup.mjs", ...args], { env: process.env, encoding: "utf8", cwd: new URL("../..", import.meta.url).pathname });
async function scratch() {
  const name = `drill_${uniq().replace(/\W/g, "").toLowerCase()}`;
  await db.query(`CREATE DATABASE ${name}`); drills.push(name);
  return { name, url: urlFor(name) };
}
const q = async (url, sql, params = []) => {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: url }); await c.connect();
  try { return (await c.query(sql, params)).rows; } finally { await c.end(); }
};

test("only admins see backups; the status shows both places, the 30 day rule and the dump tool", async () => {
  admin = await loginAdmin();
  assert.equal((await api("/system/backups")).status, 401);
  const f = await newFarmer();
  assert.equal((await api("/system/backups", { token: f.token })).status, 403);
  assert.equal((await api("/system/backups/run", { method: "POST", token: f.token })).status, 403);
  const s = (await api("/system/backups", { token: admin })).data;
  assert.equal(s.retentionDays, 30);
  assert.ok(s.configured.encryptionKey); assert.match(s.configured.primary, /backup bucket/i); assert.match(s.configured.secondary, /second provider/i);
  assert.match(s.pgDump, /pg_dump/);
  assert.ok(!JSON.stringify(s).includes(process.env.BACKUP_ENCRYPTION_KEY), "the key is never shown");
  assert.ok(!JSON.stringify(s).includes("BACKUP2_SECRET"), "no secrets in the status");
});

let marker, firstKey;
test("a backup lands, encrypted, in BOTH places and is recorded", async () => {
  marker = await newFarmer();                                  // a person who exists at backup time, to find again after a restore
  const r = await api("/system/backups/run", { method: "POST", token: admin });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.status, "ok", JSON.stringify(r.data));
  firstKey = r.data.result.key;
  assert.match(firstKey, /^db\/\d{4}\/\d{2}\/ephaag-\d{8}-\d{6}\.dump\.enc$/);
  const keys = await keysIn();
  for (const b of ["bk1", "bk2"]) {
    assert.ok(keys.includes(`${b}/${firstKey}`), `the dump is in ${b}`);
    assert.ok(keys.includes(`${b}/${firstKey.replace(".dump.enc", ".manifest.json")}`), `the manifest is in ${b}`);
  }
  const run = (await db.query("SELECT * FROM backup_runs ORDER BY started_at DESC LIMIT 1")).rows[0];
  assert.equal(run.status, "ok"); assert.equal(run.primary_ok, true); assert.equal(run.secondary_ok, true); assert.ok(Number(run.bytes) > 1000);
  const st = (await api("/system/backups", { token: admin })).data;
  assert.equal(st.stale, false); assert.ok(st.lastOk.object_key === firstKey);
  assert.equal(st.runs[0].status, "ok");
  const man = await (await fetch(`${S3}/__get?key=${encodeURIComponent(`bk1/${firstKey.replace(".dump.enc", ".manifest.json")}`)}`)).json();
  assert.equal(man.object, firstKey); assert.ok(man.plainSha256.length === 64 && man.tables > 50);
});

test("the stored file is encrypted: no readable data, and the wrong key cannot open it", async () => {
  const raw = Buffer.from(await (await fetch(`${S3}/__get?key=${encodeURIComponent(`bk1/${firstKey}`)}`)).arrayBuffer());
  assert.equal(raw.subarray(0, 8).toString(), "EPHBK001");
  assert.ok(!raw.includes("PGDMP"), "not a readable dump");
  assert.ok(!raw.includes(Buffer.from(marker.email)), "the member's email is not readable in it");
  const fs = await import("node:fs"); const os = await import("node:os"); const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bkt-"));
  fs.writeFileSync(path.join(dir, "b.enc"), raw);
  const wrong = spawnSync("node", ["scripts/restore-backup.mjs", "decrypt", path.join(dir, "b.enc"), path.join(dir, "out")], { env: { ...process.env, BACKUP_ENCRYPTION_KEY: "another-key-another-key-another-key-1234" }, encoding: "utf8", cwd: new URL("../..", import.meta.url).pathname });
  assert.notEqual(wrong.status, 0); assert.match(wrong.stderr, /could not be decrypted/i);
  const bad = Buffer.from(raw); bad[bad.length >> 1] ^= 0xff;                       // one damaged byte in the middle
  fs.writeFileSync(path.join(dir, "bad.enc"), bad);
  const dmg = script("decrypt", path.join(dir, "bad.enc"), path.join(dir, "out2"));
  assert.notEqual(dmg.status, 0); assert.match(dmg.stderr, /could not be decrypted/i);
  assert.ok(!fs.existsSync(path.join(dir, "out2")), "no half-decrypted file is left behind");
  const ok = script("decrypt", path.join(dir, "b.enc"), path.join(dir, "good.dump"));
  assert.equal(ok.status, 0, ok.stderr);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("RESTORE DRILL: restore from the backup bucket and from the second provider into empty databases and find the data", async () => {
  const live = (await db.query("SELECT count(*)::int AS n FROM users")).rows[0].n;
  const list = script("list"); assert.equal(list.status, 0, list.stderr); assert.ok(list.stdout.includes(firstKey));
  const list2 = script("list", "--from", "second"); assert.equal(list2.status, 0, list2.stderr); assert.ok(list2.stdout.includes(firstKey));

  const a = await scratch();
  const r1 = script("restore", firstKey, "--to", a.url);
  assert.equal(r1.status, 0, r1.stdout + r1.stderr); assert.match(r1.stdout, /checksum matches/);
  const found = await q(a.url, "SELECT email FROM users WHERE id = $1", [marker.id]);
  assert.equal(found[0]?.email, marker.email, "the member made before the backup is in the restored database");
  assert.ok((await q(a.url, "SELECT count(*)::int AS n FROM users"))[0].n <= live, "no more users than the live system has");
  assert.ok((await q(a.url, "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'"))[0].n > 50, "every table came back");

  const b = await scratch();
  const r2 = script("restore", firstKey, "--to", b.url, "--from", "second");
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  assert.equal((await q(b.url, "SELECT email FROM users WHERE id = $1", [marker.id]))[0]?.email, marker.email, "the second provider's copy works too");
});

test("a restore never goes into the live database by mistake, and needs a target and a real backup", async () => {
  const live = script("restore", firstKey, "--to", process.env.DATABASE_URL);
  assert.notEqual(live.status, 0); assert.match(live.stderr, /live database/i);
  const none = script("restore", firstKey); assert.notEqual(none.status, 0); assert.match(none.stderr, /--to/);
  const a = await scratch();
  const missing = script("restore", "db/2000/01/nothing.dump.enc", "--to", a.url);
  assert.notEqual(missing.status, 0);
  assert.equal((await q(a.url, "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'"))[0].n, 0, "nothing was restored");
});

test("old backups are removed after 30 days in both places, but the newest three are never removed", async () => {
  const stamps = [];
  for (let i = 1; i <= 5; i++) {
    const now = new Date(Date.now() - i * 3600e3);                                   // distinct file names
    const r = await runBackup({ now, trigger: "test" }); stamps.push(r.key);
  }
  const base = Object.fromEntries(Object.entries(await keysIn().then((k) => ({ all: k }))));
  assert.ok(stamps.every((k) => base.all.includes(`bk1/${k}`) && base.all.includes(`bk2/${k}`)));
  // make the two oldest of these, and the first one from earlier, 40 days old
  const old = [stamps[4], stamps[3], firstKey];
  for (const k of old) for (const b of ["bk1", "bk2"]) await fetch(`${S3}/__age?key=${encodeURIComponent(`${b}/${k}`)}&days=40`);
  const fresh = await runBackup({ now: new Date(), trigger: "test" });
  const after = await keysIn();
  for (const k of old) for (const b of ["bk1", "bk2"]) {
    assert.ok(!after.includes(`${b}/${k}`), `${k} is gone from ${b}`);
    assert.ok(!after.includes(`${b}/${k.replace(".dump.enc", ".manifest.json")}`), "its manifest is gone too");
  }
  assert.ok(fresh.removedOld >= 3);
  for (const k of [stamps[0], stamps[1], stamps[2], fresh.key]) assert.ok(after.includes(`bk1/${k}`) && after.includes(`bk2/${k}`), `${k} is kept`);
  // even if EVERYTHING is old, the newest three stay
  const { primary } = backupTargets();
  for (const o of await listStore(primary)) await fetch(`${S3}/__age?key=${encodeURIComponent(`bk1/${o.key}`)}&days=60`);
  await applyRetention(primary);
  const left = (await listStore(primary)).filter((o) => o.key.endsWith(".dump.enc"));
  assert.equal(left.length, 3, "the newest three survive");
});

test("if the second provider is down the backup is a failure: it is recorded, the first copy is kept, and the admins are alerted", async () => {
  process.env.BACKUP2_ENDPOINT = "http://127.0.0.1:1";                              // nothing listens there
  try {
    await db.query("DELETE FROM job_state WHERE job_name = 'alert:job:database-backup'");
    const before = (await db.query("SELECT count(*)::int AS n FROM messages WHERE template = 'job_alert'")).rows[0].n;
    const out = await runJob("database-backup", { trigger: "test" });
    assert.equal(out.status, "failed"); assert.match(out.error, /partial/i);
    const run = (await db.query("SELECT * FROM backup_runs ORDER BY started_at DESC LIMIT 1")).rows[0];
    assert.equal(run.status, "partial"); assert.equal(run.primary_ok, true); assert.equal(run.secondary_ok, false); assert.match(run.error, /second provider/i);
    assert.ok(run.object_key, "the first copy exists");
    assert.ok((await keysIn()).includes(`bk1/${run.object_key}`));
    const after = (await db.query("SELECT count(*)::int AS n FROM messages WHERE template = 'job_alert'")).rows[0].n;
    assert.ok(after > before, "the admins were told");
    const sms = (await db.query("SELECT count(*)::int AS n FROM messages WHERE channel = 'sms' AND template = 'job_alert' AND body_text ILIKE '%Scheduled job failed%'")).rows[0].n;
    assert.ok(sms >= 1, "and the named person was sent an SMS");
    assert.equal((await api("/system/backups", { token: admin })).data.runs[0].status, "partial");
  } finally { process.env.BACKUP2_ENDPOINT = ENV.BACKUP2_ENDPOINT; }
});

test("a wrong pg_dump address is a clean failure, not a hang or a leftover temp file", async () => {
  process.env.BACKUP_DATABASE_URL = "postgresql://nobody:wrong@127.0.0.1:1/none";
  try {
    await assert.rejects(runBackup({ trigger: "test" }), /pg_dump failed|Backup failed/);
    const run = (await db.query("SELECT * FROM backup_runs ORDER BY started_at DESC LIMIT 1")).rows[0];
    assert.equal(run.status, "failed"); assert.equal(run.primary_ok, false);
  } finally { delete process.env.BACKUP_DATABASE_URL; }
  const os = await import("node:os"); const fs = await import("node:fs");
  assert.equal(fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("ephaag-backup-")).length, 0, "no temp files are left");
});

test("without a backup bucket a development machine skips quietly, but production refuses to run unprotected", async () => {
  const saved = { b: process.env.R2_BACKUP_BUCKET };
  try {
    delete process.env.R2_BACKUP_BUCKET;
    const r = await runBackup({ trigger: "test" }); assert.equal(r.skipped, true); assert.match(r.reason, /backup bucket/);
    process.env.NODE_ENV = "production";
    await assert.rejects(runBackup({ trigger: "test" }), /not fully set up/);
  } finally { process.env.NODE_ENV = ENV.NODE_ENV; process.env.R2_BACKUP_BUCKET = saved.b; }
});
