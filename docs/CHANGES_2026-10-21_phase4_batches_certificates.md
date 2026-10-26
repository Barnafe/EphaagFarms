# v28 — Batches, certificates, emails and the NYSC export (the "Phase 4" spec)

Built on v27. **Numbering note:** v27's own "Phase 4" was the learning/quiz/progress work; this is the batches +
certificates + NYSC export phase (v27 called it phase 5). Nothing from v27 was changed except the small hooks below.

## Decisions (defaults = your recommendations)
1. Members who didn't finish: **no certificate, no "ready" email**; they see "Not completed yet" with x of y courses.
2. NYSC data consent: **required for every corps member** (registration, wizard checkbox, profile). The export includes a
   consent column and, by default, **leaves out members who haven't consented** (an admin tick-box can include them).
3. Certificate design: placeholders until you supply the real thing — see "What I still need".

## How it works
- **Eligible** = fee paid now + every live corps course completed (same progress code as the dashboard, v27 `loadMemberProgress`).
  The moment a member earns their last course a certificate row is created **hidden**: unique number
  `EPH-NYSC-<year>-<6 digits>` (database sequence, so simultaneous completions can't collide) and a 24-character
  verification code (~119 bits).
- **Batches** (`corp_batches`): one per service year + batch letter + stream, created automatically for every batch that has
  members. Admin sets the due date and presses **Mark batch complete** — refused before the due date or without one.
  Marking releases that batch's hidden certificates and starts the emails. **Un-mark** hides them again (with an optional reason).
  Every due-date change, close, un-mark, resend and reissue is logged with who and when (`corp_batch_events`).
- **Late finisher** (batch already closed): certificate is visible immediately and emailed straight away.
- **Certificate PDF**: generated on the server (pdfkit), A4 landscape: name, state code, batch + year, issue date, certificate
  number, QR code. No grades, no course names. Issue date = the day it was released. Printed details are a snapshot;
  a name correction = **Reissue** (same number and code, revision +1).
- **Public verify page** `/verify-certificate` (and `/verify-certificate/<code>`, which the QR opens): shows only name, batch,
  issue date. Hidden/unknown codes look identical (not found). Code is accepted with dashes / lower case. Rate-limited (30/min/IP).
- **Emails**: one at a time with a pause (`CERT_EMAIL_DELAY_MS`, default 1.5 s) in the background, outcome stored per certificate:
  `sent`, `failed`, `not_configured` (no SMTP on the server), `no_email`. **Send / resend** retries everything not sent; already-sent are never re-sent.
- **Members table + export** (TRC -> Corps -> Members): filters year, batch, stream, state, paid, completed, consent + search;
  `.xlsx` export with name, gender, email, phone, call-up number, state code, service year, batch, stream, state of deployment,
  PPA, discipline, paid, courses completed, completion date, certificate number, consent. Phone/call-up stay text (leading zeros kept).
  Certificate numbers are exported only for **released** certificates.

## API
Member: `GET /corpers/certificate` (status: not_completed / awaiting_batch / ready), `GET /corpers/certificate/download` (own, released only).
Public: `GET /certificates/verify/:code`.
Admin (`/rtc/admin/corps/...`): `GET batches`, `PUT batches/:id {dueDate}`, `POST batches/:id/complete|uncomplete|resend-emails`,
`GET members`, `GET members/export`, `POST members/:userId/certificate/reissue`, `GET members/:userId/certificate` (admin copy, even while hidden).

## Database (`001_init.sql` §25, safe to re-run, upgrades a v27 database in place)
`corp_batches`, `corper_certificates`, `corp_batch_events`, sequence `corper_certificate_seq`.

## Small changes to existing code
`corperLearningController.js` calls `issueCertificateIfEligible()` when a course is first completed (a failure there never breaks learning);
`consentData` is required in the corps profile spec / registration / wizard; `corps_learning_test.py` now registers with consent and gender (it was stale).

## Verified
`corps_certificates_test.py` (new, 95 checks, all pass): consent rules; hidden-until-closed; due-date rules; release; PDF download;
verify page; emails (record, resend only unsent, late finisher); un-mark + log; reissue; **12 simultaneous completions -> 12 unique numbers**;
members filters; export contents/columns/consent default/leading zeros/hidden numbers; permissions (401/403) and rate limit.
v27 `corps_learning_test.py` (73 checks) and `node --test` (26) still pass. Fresh DB and v27 -> v28 upgrade both migrate twice cleanly. Frontend builds.

## What I still need from you
- **NYSC logo**: save as `backend/assets/certificate/nysc-logo.png` (appears top-left automatically).
- **Signatories + signatures + wording**: edit `backend/assets/certificate/certificate-config.json` (names, titles, signature PNG file names, any NYSC-required wording), restart. Until then it prints two signature lines titled "Chief Executive Officer, EPHAAG Farms" and "NYSC Representative".
- **SMTP** on the server (see `.env.example`) for real emails. Until then emails show "not delivered" and can be sent later with Send / resend.

## Honest limits
- A refund **after** a certificate exists does not revoke it (access closes; the certificate stays). Say if you want refund = revoke.
- Existing members who registered before this update have consent "No" until they tick it in Profile -> Documents; they are left out of the default export.
- A member can't withdraw NYSC consent in the app while a corps member (it is required); handle by admin request.
- Un-marking and re-marking gives released certificates a new issue date; numbers and codes never change.
- Browser-level (click-through) tests were not run here; the API chain and a production-mode route check were.
