// Phase 15 — permanent file storage (against a stand-in R2)
import test, { after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { api, call, API, S3, db, loginAdmin, newUser, sleep, uniq } from "../helpers/api.mjs";
import { saveFile, signedUrl, canAccessFile, deleteFile, purgeExpiredFiles, getFileRow, registerAccessRule } from "../../src/services/storage.js";
import { sendFileRef } from "../../src/utils/fileRefs.js";
import { pool } from "../../src/db/pool.js";

after(async () => { await db.end(); await pool.end(); });

// Minimal real files (magic bytes are what the server checks).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const keys = async () => (await (await fetch(`${S3}/__keys`)).json()).keys;
const advance = (s) => fetch(`${S3}/__advance?seconds=${s}`);

function form(buf, name, type, extra = {}) {
  const f = new FormData();
  f.append("crop", extra.crop || `Crop ${uniq()}`); f.append("unit", "kg"); f.append("buyPrice", "100"); f.append("sellPrice", "150"); f.append("category", "grain");
  f.append("image", new Blob([buf], { type }), name);
  return f;
}

test("a product photo goes to R2 with a random name, is registered, and is publicly reachable", async () => {
  const admin = await loginAdmin();
  const r = await api("/finance/prices", { method: "POST", token: admin, body: form(PNG, "my secret holiday photo.png", "image/png") });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const url = r.data.price.image_url;
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+\/pub\/product_image\/\d{4}\/[0-9a-f-]{36}\.png$/);
  assert.ok(!url.includes("secret"), "original name is not used");
  assert.ok((await keys()).includes(url.split("/").slice(3).join("/")), "object exists in the public bucket");
  const img = await fetch(url);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/png");
  const row = (await db.query("SELECT * FROM stored_files WHERE storage_key = $1", [url.split("/pub/")[1]])).rows[0];
  assert.equal(row.driver, "s3");
  assert.equal(row.visibility, "public");
  assert.equal(row.original_name, "my secret holiday photo.png");
  assert.equal(row.size_bytes, String(PNG.length));
  assert.equal(row.checksum_sha256, crypto.createHash("sha256").update(PNG).digest("hex"));
  assert.ok(row.uploaded_by);
});

test("fake file types, wrong types and oversized files are rejected", async () => {
  const admin = await loginAdmin();
  // a PDF renamed .png with an image mime type
  const a = await api("/finance/prices", { method: "POST", token: admin, body: form(PDF, "totally-an-image.png", "image/png") });
  assert.equal(a.status, 400); assert.match(a.data.error, /not accepted/i);
  // plain text pretending to be a jpg
  const b = await api("/finance/prices", { method: "POST", token: admin, body: form(Buffer.from("hello world, not an image"), "x.jpg", "image/jpeg") });
  assert.equal(b.status, 400);
  // too large (5 MB limit for product images)
  const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
  const c = await api("/finance/prices", { method: "POST", token: admin, body: form(big, "big.png", "image/png") });
  assert.equal(c.status, 400); assert.match(c.data.error, /too large/i);
  // nothing was created for the rejected ones
  assert.equal((await db.query("SELECT 1 FROM standard_prices WHERE crop ILIKE 'Crop %' AND image_url IS NULL")).rowCount, 0);
});

test("private files: owner and admin can get a link, others cannot, link dies after 5 minutes", async () => {
  const owner = await newUser(), stranger = await newUser(), admin = await loginAdmin();
  const row = await saveFile({ buffer: PDF, originalName: "agreement.pdf", category: "agreement", uploadedBy: owner.id });
  assert.equal(row.visibility, "private");
  assert.ok((await keys()).includes(`priv/${row.storage_key}`));

  const own = await api(`/files/${row.id}/link`, { token: owner.token });
  assert.equal(own.status, 200);
  assert.equal((await api(`/files/${row.id}/link`, { token: admin })).status, 200);
  assert.equal((await api(`/files/${row.id}/link`, { token: stranger.token })).status, 403);
  assert.equal((await api(`/files/${row.id}/link`)).status, 401);
  assert.equal((await api(`/files/00000000-0000-4000-8000-000000000000/link`, { token: owner.token })).status, 404);

  const ttl = (new Date(own.data.expiresAt) - Date.now()) / 1000;
  assert.ok(ttl > 290 && ttl <= 300, `link lives ~5 min, got ${ttl}`);
  const first = await fetch(own.data.url);
  assert.equal(first.status, 200);
  assert.equal((await first.arrayBuffer()).byteLength, PDF.length);
  await advance(4 * 60);
  assert.equal((await fetch(own.data.url)).status, 200, "still valid at 4 minutes");
  await advance(2 * 60);
  assert.equal((await fetch(own.data.url)).status, 403, "expired after 6 minutes");
  await fetch(`${S3}/__advance?seconds=-360`);
});

test("extra access rules (e.g. purchasing roles) can widen access for one category", async () => {
  const u = await newUser();
  const row = await saveFile({ buffer: PDF, category: "purchasing", uploadedBy: null });
  assert.equal(await canAccessFile({ id: u.id, role_type: "investor" }, row), false);
  registerAccessRule("purchasing", (user) => user.role_type === "investor");
  assert.equal(await canAccessFile({ id: u.id, role_type: "investor" }, row), true);
  registerAccessRule("purchasing", () => false);
});

test("deleting keeps the file 30 days, then the cleanup job removes it for real; replacing never overwrites", async () => {
  const a = await saveFile({ buffer: PDF, category: "agreement", uploadedBy: null });
  const b = await saveFile({ buffer: PDF, category: "agreement", uploadedBy: null });
  assert.notEqual(a.storage_key, b.storage_key, "same bytes, new key: nothing is overwritten");
  assert.equal(await deleteFile(a.id), true);
  assert.equal(await getFileRow(a.id), null, "hidden straight away");
  assert.ok((await keys()).includes(`priv/${a.storage_key}`), "but still stored");
  const days = (await db.query("SELECT extract(epoch from (purge_after - deleted_at))/86400 AS d FROM stored_files WHERE id=$1", [a.id])).rows[0].d;
  assert.equal(Math.round(days), 30);
  assert.equal((await purgeExpiredFiles()).purged >= 0, true);
  assert.ok((await keys()).includes(`priv/${a.storage_key}`), "not purged before 30 days");
  await db.query("UPDATE stored_files SET purge_after = now() - interval '1 minute' WHERE id=$1", [a.id]);
  const out = await purgeExpiredFiles();
  assert.ok(out.purged >= 1);
  assert.ok(!(await keys()).includes(`priv/${a.storage_key}`), "gone from storage");
  assert.ok((await db.query("SELECT purged_at FROM stored_files WHERE id=$1", [a.id])).rows[0].purged_at);
  assert.ok((await keys()).includes(`priv/${b.storage_key}`), "the other file is untouched");
});

test("an old database row pointing at a vanished file says 'file missing' instead of a broken link", async () => {
  const sent = {};
  const res = { status(c) { sent.code = c; return this; }, json(b) { sent.body = b; return this; } };
  await sendFileRef(res, "old-upload-from-before-the-redeploy.pdf", { legacyDir: "/tmp/definitely-not-here" });
  assert.equal(sent.code, 404);
  assert.equal(sent.body.error, "File missing");
  const sent2 = {}; const res2 = { status(c) { sent2.code = c; return this; }, json(b) { sent2.body = b; return this; } };
  await sendFileRef(res2, "00000000-0000-4000-8000-0000000000aa", { legacyDir: "/tmp" });
  assert.equal(sent2.code, 404);
});

test("production with no R2 configured refuses uploads (no silent fallback to a disk that gets wiped)", async () => {
  const env = { ...process.env, NODE_ENV: "production", PORT: "4002", JOB_RUNNER: "off", FRONTEND_ORIGIN: "https://app.example.test" };
  for (const k of Object.keys(env)) if (k.startsWith("R2_")) delete env[k];
  const child = spawn("node", ["src/server.js"], { env, stdio: "ignore" });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { up = (await fetch("http://localhost:4002/health")).status < 600; } catch { await sleep(300); } }
    assert.ok(up, "server started");
    const login = await call("http://localhost:4002", "/api/auth/login", { method: "POST", body: { email: process.env.TEST_ADMIN_EMAIL, password: process.env.TEST_ADMIN_PASSWORD } });
    const r = await call("http://localhost:4002", "/api/finance/prices", { method: "POST", token: login.data.token, body: form(PNG, "a.png", "image/png") });
    assert.equal(r.status, 503);
    assert.match(r.data.error, /not configured/i);
  } finally { child.kill("SIGTERM"); }
});

test("profile photo upload returns a public URL the dashboard can show", async () => {
  const u = await newUser();
  const f = new FormData(); f.append("photo", new Blob([PNG], { type: "image/png" }), "me.png");
  const r = await api("/auth/me/photo", { method: "POST", token: u.token, body: f });
  assert.equal(r.status, 200);
  assert.equal((await fetch(r.data.photoUrl)).status, 200);
  assert.equal((await db.query("SELECT photo_url FROM users WHERE id=$1", [u.id])).rows[0].photo_url, r.data.photoUrl);
});
