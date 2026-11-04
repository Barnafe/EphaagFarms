# Backup and restore (Phase 20)

## What protects the database, in three layers
1. **The host's own restore** (Neon point-in-time restore). Fast, for "undo the last few hours". How far back it goes depends on your Neon plan: check it.
2. **A nightly full backup** at 02:00 (Lagos), encrypted, kept **30 days**, stored in a private R2 backup bucket (kept apart from the database).
3. **A copy of that same backup at a second cloud provider** (Backblaze B2, AWS S3 or any S3-compatible service), also kept 30 days.

Uploaded files (photos, PDFs) have no extra protection beyond what the app already does (decided in Phase 20).
You test restores yourself (there is no automatic monthly restore test): do the drill below before go-live and then every few months.

## How it works
- Every night the server runs `pg_dump` (the whole database), encrypts the file with AES-256-GCM using `BACKUP_ENCRYPTION_KEY`, and uploads it to **both** places. After each upload it checks the stored size.
- Old copies (older than 30 days) are removed from both places, but the newest three are **never** removed, even if the nightly job stops, so an outage can never empty your safety net.
- If either copy fails, the backup counts as **failed**: the admins are emailed, the named person gets an SMS, and the job tries again later the same day. Retries and the one-alert-per-hour limit are the same as for every other scheduled job.
- **Admin hub, Backups** shows the last good backup, both places, and the history, and has a **Back up now** button. A red notice appears if no good backup exists from the last 26 hours.
- Nothing readable leaves the server: without `BACKUP_ENCRYPTION_KEY` a backup cannot be opened. **Keep a copy of the key in your password manager (and with one trusted person).** If the key is lost, every backup is useless. If it leaks, change it (older backups still need the old key).

## Set it up
1. **Backup bucket.** In Cloudflare R2 create a third bucket, private (for example `ephaag-backups`). Use the same R2 access key (it must be allowed to read and write this bucket too). Set `R2_BACKUP_BUCKET`.
2. **Second provider.** Create a bucket there and an access key. Set `BACKUP2_ENDPOINT` (for Backblaze B2 it looks like `https://s3.eu-central-003.backblazeb2.com`), `BACKUP2_BUCKET`, `BACKUP2_ACCESS_KEY_ID`, `BACKUP2_SECRET_ACCESS_KEY` and `BACKUP2_REGION` if the provider needs one.
3. **Encryption key.** `BACKUP_ENCRYPTION_KEY` = 32 or more random characters.
4. **Direct database address.** Neon gives a pooled address (it contains `-pooler`) and a direct one. `pg_dump` only works with the direct one: set `BACKUP_DATABASE_URL` to it.
5. **The dump tool.** The server needs `pg_dump` (PostgreSQL client tools, the same major version as the database or newer). The repo `Dockerfile` installs it (`PG_CLIENT_VERSION`, 17 by default: match your Neon version). The Render plain Node runtime does not have it, so use the Dockerfile or another host. Admin hub, Backups shows "not installed" if it is missing.
6. Run `npm run preflight`: it must show PASS for BACKUPS and for the backup tool.
7. Admin hub, Backups, **Back up now**. It should say it was saved in both places.

## The restore drill (do this before go-live)
You need a computer with Node and the PostgreSQL client tools (`pg_restore`), the project's `backend` folder, and a `.env` there with the **same backup settings the server uses** (`BACKUP_ENCRYPTION_KEY`, the R2 keys and `R2_BACKUP_BUCKET`, the `BACKUP2_*` keys).

1. **Make an empty database to restore into.** For example a new Neon branch or a free scratch database. Copy its address (a `postgresql://...` string). **Never use the live database.**
2. **See the backups:**
   ```
   cd backend
   npm run backup:list
   npm run backup:list -- --from second       (the second provider's copies)
   ```
3. **Restore one** (use a key from the list):
   ```
   npm run backup:restore -- db/2026/11/ephaag-20261103-010000.dump.enc --to "postgresql://...the EMPTY database..."
   npm run backup:restore -- db/2026/11/ephaag-20261103-010000.dump.enc --to "postgresql://..." --from second
   ```
   It downloads, decrypts, checks the file against its recorded checksum, and restores. It refuses to run if `--to` is the live database.
4. **Look at it.** Connect to the restored database and check that people, orders, payments and the newest records you expect are there. Then do the same once with `--from second` so you know both copies work.
5. Delete the scratch database.

If you restore the live system for real: restore into a new empty database first, check it, then point the server's `DATABASE_URL` at it (or ask Neon to swap it in). The migrations run on start and only add things, so an older backup brings the database to its old shape and the server updates it on boot.

## Files
`node scripts/restore-backup.mjs decrypt <file.dump.enc> <out.dump>` decrypts a file you downloaded by hand from either provider; then `pg_restore --no-owner --no-acl --dbname=<empty database> <out.dump>`.

## Settings reference
| Setting | Meaning |
|---|---|
| `BACKUP_ENCRYPTION_KEY` | 32+ characters, required |
| `R2_BACKUP_BUCKET` | private R2 bucket for backups (uses the normal R2 keys) |
| `BACKUP2_ENDPOINT`, `BACKUP2_BUCKET`, `BACKUP2_ACCESS_KEY_ID`, `BACKUP2_SECRET_ACCESS_KEY`, `BACKUP2_REGION` | the second provider |
| `BACKUP_DATABASE_URL` | direct database address for `pg_dump` (defaults to `DATABASE_URL`) |
| `BACKUP_RETENTION_DAYS` | default 30 |

## What the tests prove (backend/test/api/backups.test.mjs)
A real `pg_dump` is taken, encrypted, stored in both places with a manifest; the stored file shows no readable data, a wrong key or one damaged byte cannot open it and leaves no half-file; the **restore script restores from each place into an empty database and the data is found**; the script refuses the live database; retention removes copies over 30 days from both places but keeps the newest three; a down second provider makes the run a recorded failure with an alert (email and SMS); a bad dump address fails cleanly with no temp files left; production refuses to run without full set-up.
