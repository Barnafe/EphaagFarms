// Phase 20: backups hold every member's personal data and bank details, so they are encrypted before they leave the server.
// AES-256-GCM, key derived from BACKUP_ENCRYPTION_KEY with scrypt and a fresh random salt per file.
// File layout: "EPHBK001" (8 bytes) | salt (16) | iv (12) | ciphertext ... | auth tag (16)
import crypto from "node:crypto";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("EPHBK001");
const SALT = 16, IV = 12, TAG = 16;
const HEADER = MAGIC.length + SALT + IV;

const deriveKey = (secret, salt) => crypto.scryptSync(String(secret), salt, 32);

export function assertKey(secret) {
  if (!secret || String(secret).length < 32) throw Object.assign(new Error("BACKUP_ENCRYPTION_KEY must be at least 32 characters"), { code: "BACKUP_KEY" });
}

export async function encryptFile(inPath, outPath, secret) {
  assertKey(secret);
  const salt = crypto.randomBytes(SALT), iv = crypto.randomBytes(IV);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(secret, salt), iv);
  const out = fs.createWriteStream(outPath);
  out.write(Buffer.concat([MAGIC, salt, iv]));
  await pipeline(fs.createReadStream(inPath), cipher, out, { end: false });
  out.write(cipher.getAuthTag());
  await new Promise((resolve, reject) => { out.on("error", reject); out.end(resolve); });
  return (await fs.promises.stat(outPath)).size;
}

export async function decryptFile(inPath, outPath, secret) {
  assertKey(secret);
  const st = await fs.promises.stat(inPath);
  if (st.size < HEADER + TAG) throw new Error("This file is too short to be a backup");
  const fd = await fs.promises.open(inPath, "r");
  let head; let tag;
  try {
    head = Buffer.alloc(HEADER); await fd.read(head, 0, HEADER, 0);
    tag = Buffer.alloc(TAG); await fd.read(tag, 0, TAG, st.size - TAG);
  } finally { await fd.close(); }
  if (!head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("This is not an EPHAAG backup file");
  const salt = head.subarray(MAGIC.length, MAGIC.length + SALT), iv = head.subarray(MAGIC.length + SALT, HEADER);
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(secret, salt), iv);
  decipher.setAuthTag(tag);
  try {
    await pipeline(fs.createReadStream(inPath, { start: HEADER, end: st.size - TAG - 1 }), decipher, fs.createWriteStream(outPath));
  } catch (err) {
    await fs.promises.rm(outPath, { force: true });
    throw new Error("The backup could not be decrypted: the key is wrong, or the file is damaged");
  }
}

export async function sha256File(path) {
  const h = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(path), h);
  return h.digest("hex");
}
