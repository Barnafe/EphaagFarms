import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { fileTypeFromBuffer } from "file-type";
import { pool } from "../db/pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_ROOT = path.join(__dirname, "..", "..", "uploads");
const MB = 1024 * 1024;
export const SIGNED_LINK_SECONDS = 5 * 60;
export const PURGE_AFTER_DAYS = 30;

const IMG = ["image/jpeg", "image/png", "image/webp"];
const PDF = ["application/pdf"];
const OFFICE = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/x-cfb", // legacy .doc / .ppt
];

// One row per kind of file: where it lives, how big, which real types are allowed.
export const CATEGORIES = {
  product_image:       { visibility: "public",  maxBytes: 5 * MB,  types: IMG },
  profile_photo:       { visibility: "public",  maxBytes: 5 * MB,  types: IMG },
  maintenance_photo:   { visibility: "public",  maxBytes: 5 * MB,  types: IMG },
  agreement:           { visibility: "private", maxBytes: 10 * MB, types: PDF },
  id_document:         { visibility: "private", maxBytes: 10 * MB, types: [...PDF, ...IMG] },
  attendance_sheet:    { visibility: "private", maxBytes: 10 * MB, types: [...PDF, ...IMG] },
  report_proof:        { visibility: "private", maxBytes: 5 * MB,  types: IMG },
  request_attachment:  { visibility: "private", maxBytes: 10 * MB, types: [...PDF, ...IMG] },
  lesson_document:     { visibility: "private", maxBytes: 20 * MB, types: [...PDF, ...OFFICE, ...IMG] },
  purchasing:          { visibility: "private", maxBytes: 10 * MB, types: [...PDF, "image/jpeg", "image/png"] },
  delivery_photo:      { visibility: "private", maxBytes: 10 * MB, types: IMG },
  certificate_asset:   { visibility: "private", maxBytes: 5 * MB,  types: ["image/png", "image/jpeg"] },
};

const EXT = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/x-cfb": "doc",
};

const httpError = (status, message) => Object.assign(new Error(message), { status });

// ---- driver selection ------------------------------------------------------
export function r2Configured() {
  return !!((process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID) && process.env.R2_ACCESS_KEY_ID
    && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_PUBLIC_BUCKET && process.env.R2_PRIVATE_BUCKET);
}

export function activeDriver() {
  if (r2Configured()) return "s3";
  // No silent fallback: a production server without R2 refuses uploads rather
  // than quietly writing to a disk that a redeploy wipes.
  if (process.env.NODE_ENV === "production") {
    throw Object.assign(httpError(503, "File storage is not configured on the server. Ask the administrator to set up Cloudflare R2."), { expose: true });
  }
  return "local";
}

let s3Cache = null;
function s3() {
  const key = [process.env.R2_ENDPOINT, process.env.R2_ACCOUNT_ID, process.env.R2_ACCESS_KEY_ID].join("|");
  if (s3Cache?.key === key) return s3Cache.client;
  const client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    forcePathStyle: true,
  });
  s3Cache = { key, client };
  return client;
}
const bucketFor = (visibility) => (visibility === "public" ? process.env.R2_PUBLIC_BUCKET : process.env.R2_PRIVATE_BUCKET);
const localPath = (visibility, key) => path.join(LOCAL_ROOT, visibility, ...key.split("/"));

// ---- save ------------------------------------------------------------------
export async function saveFile({ buffer, originalName = null, category, uploadedBy = null, purpose = null }) {
  const spec = CATEGORIES[category];
  if (!spec) throw httpError(500, `Unknown file category: ${category}`);
  if (!buffer || !buffer.length) throw httpError(400, "The file is empty");
  if (buffer.length > spec.maxBytes) throw httpError(400, `That file is too large (limit ${Math.round(spec.maxBytes / MB)} MB)`);

  // The type comes from the file's own bytes, never from its name or the
  // browser's claim.
  const sniffed = await fileTypeFromBuffer(buffer);
  if (!sniffed || !spec.types.includes(sniffed.mime)) {
    throw httpError(400, `That kind of file is not accepted here. Allowed: ${spec.types.map((t) => EXT[t]).join(", ").toUpperCase()}`);
  }
  const driver = activeDriver();
  const ext = EXT[sniffed.mime] || sniffed.ext;
  const key = `${category}/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${ext}`; // random name, original never used
  const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

  if (driver === "s3") {
    await s3().send(new PutObjectCommand({
      Bucket: bucketFor(spec.visibility), Key: key, Body: buffer, ContentType: sniffed.mime, ContentLength: buffer.length,
    }));
  } else {
    const full = localPath(spec.visibility, key);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, buffer);
  }
  const { rows } = await pool.query(
    `INSERT INTO stored_files (storage_key, visibility, driver, original_name, mime_type, size_bytes, checksum_sha256, category, purpose, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [key, spec.visibility, driver, originalName ? String(originalName).slice(0, 200) : null, sniffed.mime, buffer.length, checksum, category, purpose, uploadedBy]
  );
  return rows[0];
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isStoredFileId = (v) => typeof v === "string" && UUID_RE.test(v);

export async function getFileRow(id) {
  if (!isStoredFileId(id)) return null;
  const { rows } = await pool.query("SELECT * FROM stored_files WHERE id = $1 AND deleted_at IS NULL AND purged_at IS NULL", [id]);
  return rows[0] || null;
}

// ---- links -----------------------------------------------------------------
export function publicUrl(row) {
  if (row.driver === "s3") return `${(process.env.R2_PUBLIC_BASE_URL || "").replace(/\/$/, "")}/${row.storage_key}`;
  return `/uploads/public/${row.storage_key}`;
}

function localSignature(id, exp) {
  return crypto.createHmac("sha256", process.env.JWT_SECRET || "dev").update(`file:${id}:${exp}`).digest("hex");
}
export function verifyLocalSignature(id, exp, sig) {
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const expected = localSignature(id, exp);
  return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/** A link that stops working after 5 minutes. */
export async function signedUrl(row, ttl = SIGNED_LINK_SECONDS) {
  if (row.visibility === "public") return { url: publicUrl(row), expiresAt: null };
  const expiresAt = new Date(Date.now() + ttl * 1000);
  if (row.driver === "s3") {
    const url = await getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucketFor("private"), Key: row.storage_key }), { expiresIn: ttl });
    return { url, expiresAt };
  }
  const exp = Math.floor(expiresAt.getTime() / 1000);
  return { url: `/api/files/${row.id}/content?exp=${exp}&sig=${localSignature(row.id, exp)}`, expiresAt };
}

/** Raw bytes for server-side streaming (existing download endpoints). */
export async function openStream(row) {
  if (row.driver === "s3") {
    const out = await s3().send(new GetObjectCommand({ Bucket: bucketFor(row.visibility), Key: row.storage_key }));
    return { stream: out.Body instanceof Readable ? out.Body : Readable.fromWeb(out.Body.transformToWebStream()), size: row.size_bytes };
  }
  const full = localPath(row.visibility, row.storage_key);
  await fs.promises.access(full); // throws if the file is gone
  return { stream: fs.createReadStream(full), size: row.size_bytes };
}

/** Streams a stored file to the HTTP response. Missing file -> a clear 404, never a broken link. */
export async function sendStoredFile(res, row, { download = false, filename = null } = {}) {
  if (!row) return res.status(404).json({ error: "File missing" });
  try {
    const { stream, size } = await openStream(row);
    res.setHeader("Content-Type", row.mime_type);
    res.setHeader("Content-Length", size);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}; filename="${(filename || row.original_name || "file").replace(/[^\w.\- ]/g, "_")}"`);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  } catch {
    res.status(404).json({ error: "File missing" });
  }
}

export async function fileExists(row) {
  try {
    if (row.driver === "s3") await s3().send(new HeadObjectCommand({ Bucket: bucketFor(row.visibility), Key: row.storage_key }));
    else await fs.promises.access(localPath(row.visibility, row.storage_key));
    return true;
  } catch { return false; }
}

// ---- delete / cleanup ------------------------------------------------------
/** Soft delete: the file stays 30 days, then the cleanup job removes it for real. */
export async function deleteFile(id) {
  if (!isStoredFileId(id)) return false;
  const { rowCount } = await pool.query(
    `UPDATE stored_files SET deleted_at = now(), purge_after = now() + ($2 || ' days')::interval WHERE id = $1 AND deleted_at IS NULL`,
    [id, String(PURGE_AFTER_DAYS)]);
  return rowCount > 0;
}

export async function purgeExpiredFiles() {
  const { rows } = await pool.query(
    `SELECT * FROM stored_files WHERE deleted_at IS NOT NULL AND purged_at IS NULL AND purge_after <= now() LIMIT 500`);
  let purged = 0, failed = 0;
  for (const f of rows) {
    try {
      if (f.driver === "s3") await s3().send(new DeleteObjectCommand({ Bucket: bucketFor(f.visibility), Key: f.storage_key }));
      else await fs.promises.rm(localPath(f.visibility, f.storage_key), { force: true });
      await pool.query("UPDATE stored_files SET purged_at = now() WHERE id = $1", [f.id]);
      purged++;
    } catch (err) { failed++; console.error("[file-cleanup]", f.id, err.message); }
  }
  return { purged, failed };
}

// ---- access rules ------------------------------------------------------------
const accessRules = new Map();
/** Later phases register extra rules, e.g. purchasing roles may read purchasing files. */
export function registerAccessRule(category, fn) { accessRules.set(category, fn); }
export async function canAccessFile(user, row) {
  if (!user || !row) return false;
  if (row.visibility === "public") return true;
  if (user.role_type === "admin") return true;
  if (row.uploaded_by && row.uploaded_by === user.id) return true;
  const rule = accessRules.get(row.category);
  return rule ? !!(await rule(user, row)) : false;
}
