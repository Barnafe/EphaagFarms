# Phases 14 and 20: Corps certificate leftovers, and Backup and restore

Built on v42. Migrations: `020_corps_consent_certificates.sql` and `021_backups.sql` (safe to run on every boot; checked by running them twice on a populated database).

## Phase 14: Corps certificate leftovers

### Agreed decisions (22 Oct 2026)
1. **Refunding is removed completely for corps fees**: fees are not refundable once agreed and paid. This replaces the Phase 3 refund decisions.
2. **Consent to share details with NYSC AGROALLIED SAED is required** while a member of the programme (no withdrawal).
3. Members who registered **before consent was required** see a **banner asking them to tick it**, and their **certificate release waits** until they do.

### How it works
- **No refunds for corps fees.** The old corps Refund button was already gone. Now the Refund room also refuses corps fee payments: they are shown as "not refundable" in search and Needs attention, and the refund call answers `409 NOT_REFUNDABLE`. Money that arrives but cannot be applied (wrong amount, stale page) still appears under Needs attention so the office knows, without a refund button.
- **Consent.** Registration already refuses a missing consent, and the profile cannot be changed back to "no". New: `POST /api/corpers/consent` (one tick, harmless if repeated, the first time is recorded in `consent_data_at`).
- **Banner.** On every page of the Corps room, a member with no consent sees "Your consent is needed" with a tick box and a button.
- **Certificate holds.** A certificate is only ever released to a member who has consented. When the office marks a batch complete, consenting members are released; the others stay hidden, are told once by email and SMS ("tick your consent to release your certificate"), and the office sees "N waiting for consent" on the batch and "Held: waiting for the member's consent" on each member. A member who finishes after the batch is closed is released at once only if they consented. The moment a member ticks consent, a held certificate in a closed batch is released and the usual certificate email is sent. Un-marking and re-marking a batch keeps the rule and does not remind the same member twice.
- The Certificate screen shows "waiting for your consent" and refreshes by itself when consent is given (a browser test found and fixed a stale screen here).

### Assumptions I applied (tell me if wrong)
- **A corps payment that arrives but cannot be applied** (wrong amount, stale payment page) can no longer be refunded in the Refund room, because "no refund anywhere for corps fees" was the decision. It still alerts the office. If you want a way to give such money back, say so and I will add a narrow exception for payments that were never applied.
- Consent can be given even before a member has paid the access fee.

## Phase 20: Backup and restore

### Agreed decisions (23 Oct 2026)
1. The database is protected by the **host's built-in restore** plus a **nightly full backup stored separately for 30 days** plus a **copy in a second cloud provider**.
2. Uploaded files get **no extra protection** beyond what the app already does.
3. **You test restores yourself** (no automatic monthly restore test).

### How it works (full guide: `docs/BACKUP-AND-RESTORE.md`)
- A scheduled job at 02:00 (Lagos) runs the real `pg_dump`, **encrypts** the file (AES-256-GCM, key from `BACKUP_ENCRYPTION_KEY`), and stores it in a private **R2 backup bucket** and at a **second S3-compatible provider**, each with a manifest (checksum, size, date). Each upload is verified by size and retried.
- Copies older than **30 days** are removed from both places; the **newest three are never removed**.
- Any shortfall (one copy missing, the tool missing, a bad address) is recorded as a failed run and raises the usual alert: email to the admins and an SMS to the named person; the job tries again the same day.
- **Admin hub, Backups**: last good backup, both places, tool version, history, a red notice if nothing good in 26 hours, and a **Back up now** button.
- **`backend/scripts/restore-backup.mjs`** (`npm run backup:list`, `npm run backup:restore`): lists, downloads, decrypts, checks the checksum and restores into an empty database. It refuses the live database.
- Preflight now checks the key, the bucket, the second provider, a pooled database address (pg_dump needs the direct one) and that `pg_dump` exists.
- `Dockerfile` installs the PostgreSQL client tools; `render.yaml` and `DEPLOYMENT.md` (section 8b and the go-live checklist) list every new setting.

### Things you must do (I cannot do them for you)
1. Create the third R2 bucket and the second-provider bucket and keys; set the `BACKUP2_*`, `R2_BACKUP_BUCKET`, `BACKUP_ENCRYPTION_KEY` and `BACKUP_DATABASE_URL` values.
2. **Keep a copy of `BACKUP_ENCRYPTION_KEY` outside the server.** Lost key = unreadable backups.
3. Deploy with the Dockerfile (or any host with `pg_dump`); Render's plain Node runtime does not have it.
4. Do one restore drill before go-live and then every few months.

### What I could not test here
The `Dockerfile` itself (no Docker in my environment) and real Cloudflare R2 / Backblaze / Neon endpoints. Everything else ran for real: a real `pg_dump`, real encryption, real `pg_restore` into scratch databases, against a stand-in S3 that decodes the same chunked uploads real S3 does.

## Tests added
- `backend/test/api/corps-consent-certificates.test.mjs` (9 tests), `backend/test/api/backups.test.mjs` (10 tests including the restore drill from both places), 1 new preflight test.
- Browser journeys 22 (consent banner and certificate release), 23 (Backups page), 24 (driver breakdown, rescue trip, Maintenance label, over-budget cost approved by Finance).
- Extra checks this round: an undefined-name lint over every frontend and backend file (found and fixed a missing icon import that would have crashed the Admin Hub), and the migrations run twice on a populated database.
