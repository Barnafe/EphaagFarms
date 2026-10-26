# v25 — Corps members (NYSC) account merged into the v24 build

v25 = v24 (financing-banner alignment + payment audit, see
`CHANGES_2026-10-20_banner_and_payment_audit.md`) + the corps member account
built separately.

## What the corps account adds
- New `corper` role: registration wizard (NYSC identity fields + terms), login toggle ("Member" / "Corp member"), corps dashboard + profile tabs with completion %.
- Backend: `/api/corpers/me`, `/api/corpers/me/profile/:section`; `corper_profiles` table (one account per NYSC state code, case-insensitive).
- TRC admin: courses now have an audience (`general` farmer seminars vs `corps`); corps courses are built from ordered lessons (video / document upload / live session) plus a multiple-choice quiz, and can only be approved once they have at least one lesson and one question. Farmers never see corps courses.

## Merge notes
- Only `backend/src/db/migrations/001_init.sql` was edited by both sides (both appended new tables at the end); both blocks are kept. The migration is re-runnable and upgrades a v24 database in place (existing courses become `general`).
- Fixed along the way: `GET /api/maintenance/history` always returned a 500 (grouped by a non-existent column) — an old v23 bug, not part of the corps work.
- `backend/store_test.py` updated for the order form's required contact fields (old script drift).

## Verified
Fresh database + re-run migration; v24 -> v25 schema upgrade; 208 scripted checks (banner shares/loans, payment audit, corps registration/profile/courses/lessons/quiz, role isolation) all pass; all 136 parameter-free GET endpoints respond with no 5xx; frontend builds.
