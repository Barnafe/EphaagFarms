#!/usr/bin/env node
// Phase 20: list and restore the nightly database backups.  Full steps: docs/BACKUP-AND-RESTORE.md
//
//   node scripts/restore-backup.mjs list    [--from primary|second]
//   node scripts/restore-backup.mjs restore <object-key> --to <postgres address of an EMPTY database> [--from primary|second]
//   node scripts/restore-backup.mjs decrypt <file.dump.enc> <out.dump>          (for a file you downloaded by hand)
//
// It needs: the same settings the server uses (BACKUP_ENCRYPTION_KEY, and the R2 / BACKUP2 keys), and the PostgreSQL
// client tools (pg_restore) on this computer. It NEVER restores into the live database unless you say so with --allow-live.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { backupTargets, listStore, downloadObject } from "../src/services/backup.js";
import { decryptFile, sha256File } from "../src/services/backupCrypto.js";

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
const has = (name) => args.includes(`--${name}`);
const die = (msg) => { console.error(`\nSTOP: ${msg}\n`); process.exit(1); };

const { primary, secondary } = backupTargets();
const from = flag("from") === "second" ? secondary : primary;
const fromLabel = flag("from") === "second" ? "the second provider" : "the backup bucket";

function pgRestore(target, file) {
  return new Promise((resolve, reject) => {
    const c = spawn("pg_restore", ["--no-owner", "--no-acl", "--exit-on-error", `--dbname=${target}`, file], { stdio: ["ignore", "inherit", "inherit"] });
    c.on("error", (e) => reject(new Error(e.code === "ENOENT" ? "pg_restore is not installed on this computer. Install the PostgreSQL client tools first." : e.message)));
    c.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`pg_restore failed (exit ${code})`))));
  });
}

async function main() {
  if (cmd === "list") {
    if (!from) die(`${fromLabel} is not configured in this computer's settings.`);
    const items = (await listStore(from)).filter((o) => o.key.endsWith(".dump.enc"));
    if (!items.length) return console.log(`No backups found in ${fromLabel}.`);
    console.log(`Backups in ${fromLabel} (newest first):\n`);
    for (const o of items) console.log(`  ${o.key}   ${(o.size / 1048576).toFixed(1)} MB   ${new Date(o.lastModified).toISOString()}`);
    return;
  }
  if (cmd === "decrypt") {
    const [, input, output] = args;
    if (!input || !output) die("Usage: decrypt <file.dump.enc> <out.dump>");
    await decryptFile(input, output, process.env.BACKUP_ENCRYPTION_KEY);
    return console.log(`Decrypted to ${output}. Restore it with: pg_restore --no-owner --no-acl --dbname=<empty database> ${output}`);
  }
  if (cmd === "restore") {
    const key = args[1];
    const to = flag("to");
    if (!key || key.startsWith("--")) die("Say which backup: restore <object-key> --to <database address>   (use the list command to see the keys)");
    if (!to) die("Say where to restore: --to <postgres address of an EMPTY database>. A restore never goes into the live database by default.");
    if (!from) die(`${fromLabel} is not configured in this computer's settings.`);
    const live = process.env.DATABASE_URL;
    if (live && (to === live || to === process.env.BACKUP_DATABASE_URL) && !has("allow-live")) {
      die("That is the live database. Restore into a new, empty database first, check it, then decide. (Add --allow-live only if you are sure.)");
    }
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ephaag-restore-"));
    try {
      const enc = path.join(dir, "backup.dump.enc"), plain = path.join(dir, "backup.dump");
      console.log(`1/4 Downloading ${key} from ${fromLabel}...`);
      await downloadObject(from, key, enc);
      let manifest = null;
      try { const m = path.join(dir, "manifest.json"); await downloadObject(from, key.replace(/\.dump\.enc$/, ".manifest.json"), m); manifest = JSON.parse(await fs.promises.readFile(m, "utf8")); } catch { /* the backup itself is what matters */ }
      console.log("2/4 Decrypting...");
      await decryptFile(enc, plain, process.env.BACKUP_ENCRYPTION_KEY);
      console.log("3/4 Checking the file is complete...");
      if (manifest?.plainSha256) {
        const sum = await sha256File(plain);
        if (sum !== manifest.plainSha256) die("The decrypted file does not match its recorded checksum. Do not use it; try the copy in the other provider.");
        console.log(`    checksum matches (${manifest.createdAt}, ${manifest.tables} tables)`);
      } else console.log("    (no manifest found, skipping the checksum)");
      console.log("4/4 Restoring into the target database...");
      await pgRestore(to, plain);
      console.log("\nDone. The database was restored. Open it and look around before you rely on it.");
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
    return;
  }
  console.log("Usage:\n  node scripts/restore-backup.mjs list [--from second]\n  node scripts/restore-backup.mjs restore <object-key> --to <empty database address> [--from second]\n  node scripts/restore-backup.mjs decrypt <file.dump.enc> <out.dump>");
  process.exit(cmd ? 1 : 0);
}

main().then(() => process.exit(0), (err) => die(err.message));
