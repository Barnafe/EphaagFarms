# Deploying EPHAAG Farms

One web service serves the API (`/api/*`) and the built frontend, with a Postgres database behind it.
This guide takes you from nothing to a live site. **Do it in two passes**: first a *rehearsal* with test keys
(Paystack test mode, SES sandbox), then *go live* by swapping in the live values. Nothing in the app changes
between the two; only the environment variables do.

Run the checklist tool any time:

```bash
cd backend
NODE_ENV=production DATABASE_URL=... JWT_SECRET=... npm run preflight   # paste the same values you give the host
```

It prints PASS / WARN / FAIL for every setting below, says how to fix each, and tests the database connection.
In production the server also prints this checklist when it boots (look at the host's logs), and refuses to
start only if `JWT_SECRET` is missing or too short.

## 0. Accounts you need

| For | Account | When |
|---|---|---|
| Code + automatic checks | GitHub | first |
| Database | Neon (or any Postgres) | first |
| Hosting | Render (free to rehearse; paid before launch) | first |
| Uploaded files | Cloudflare (R2 storage) | before anyone uploads |
| Email | Amazon Web Services (SES) | before real users; a **domain** is needed to leave the sandbox |
| SMS | A Nigerian SMS provider (Termii or similar) with a **registered sender name** | before real users |
| Payments | Paystack | first (test keys) |

A domain and the SMS sender-name approval can take days: start them early.

## 1. Database (Neon)
Create a project, open **Connection Details**, copy the **pooled connection** string (it ends in `?sslmode=require`).
That is `DATABASE_URL`. You never run SQL by hand: the app creates and upgrades its own tables on every start
(migrations are additive and safe to repeat).

## 2. GitHub
```bash
git init && git add . && git commit -m "EPHAAG Farms"
git remote add origin https://github.com/<you>/ephaag-farms.git && git branch -M main && git push -u origin main
```
`.gitignore` already keeps `.env`, `node_modules`, builds and uploads out of git. The workflow in
`.github/workflows/ci.yml` then runs on every push: secret scan, syntax checks, build, all tests, package
vulnerability scan, browser tests. To make failing checks **block merges**: repo → Settings → Branches → add a rule
for `main` → "Require status checks to pass" → tick `checks` and `secrets-scan`.

## 3. Render
New → **Blueprint** → pick the repo. Render reads `render.yaml` and creates the service with every variable slot.
Fill the ones marked in the table below. After the first deploy Render gives you an address like
`https://ephaag-farms.onrender.com`: put it in `FRONTEND_ORIGIN` and redeploy (Paystack return links and
password-reset links use it).

| Variable | Where the value comes from |
|---|---|
| `DATABASE_URL` | Neon (step 1) |
| `JWT_SECRET`, `JOB_TICK_SECRET` | Render generates them |
| `FRONTEND_ORIGIN` | your site address (https) |
| `ADMIN_SETUP_CODE` | make up a private code |
| `R2_*` | step 4 |
| `SES_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `FROM_EMAIL`, `FARMER_PLACEHOLDER_EMAIL_DOMAIN` | step 5 |
| `SMS_API_KEY`, `SMS_SENDER_ID`, `ALERT_SMS_PHONE` | step 6 |
| `PAYSTACK_SECRET_KEY` | step 7 |

Not on Render? `Dockerfile` runs the same app on any container host (it has **not** been built in the environment
where this was prepared: build it once and check `/health`). Otherwise: build command `npm install && npm run build`,
start command `npm run start`, health check `/health`, Node 20 or newer.

## 4. File storage (Cloudflare R2)
1. Cloudflare dashboard → R2 → create **two buckets**: one *public* (product, profile and maintenance photos) and
   one *private* (agreements, ID documents, lesson files, purchasing and delivery files, certificate signatures).
2. On the public bucket, switch on its public address (the `r2.dev` address, or your own domain). Copy it into
   `R2_PUBLIC_BASE_URL`.
3. Create an **API token / access key** with read and write on both buckets. Put the account id, key id and
   secret into `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and the bucket names into
   `R2_PUBLIC_BUCKET`, `R2_PRIVATE_BUCKET`.
Without these, uploads are refused (HTTP 503) in production on purpose: a free host's disk is wiped on every
redeploy. Private files are only served through a link that expires after 5 minutes.
**Uploaded files have no backup of their own** (Phase 20 adds database backups, not file backups). Signed
investment agreements are legal records: revisit this before launch.

## 5. Email (Amazon SES)
1. SES → verify a **domain** (add the DNS records SES gives you) or, to rehearse, verify the individual addresses
   you will send to (the sandbox only delivers to verified addresses).
2. Create an access key for sending; put `SES_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` in the host.
3. `FROM_EMAIL` must be an address on the verified domain, e.g. `EPHAAG Farms <no-reply@yourdomain>`.
4. **Bounces and complaints:** create an SNS topic, add an HTTPS subscription pointing at
   `https://<your-site>/api/messaging/ses-events` (the app confirms the subscription itself and verifies Amazon's
   signature), then send SES's bounce and complaint events to that topic. Bounced addresses are then suppressed
   automatically and listed in Admin → System → Messages.
5. Before launch, ask AWS for **production access** (leave the sandbox). Test with Admin → System → Messages → Send test.
Farmers with no email are sent to Paystack under `<phone>@FARMER_PLACEHOLDER_EMAIL_DOMAIN`; nothing is ever sent there
(they get SMS instead).

## 6. SMS
Sign up with a Nigerian provider, register a **sender name** (approval takes time), and set `SMS_API_KEY`,
`SMS_SENDER_ID`. The adapter speaks Termii's JSON API; another provider is one more case in
`backend/src/services/messaging.js`. `ALERT_SMS_PHONE` is who is texted when a job or payment webhook fails
(also editable in Admin → System). SMS goes only to members with no email, for key alerts.

## 7. Paystack
1. Dashboard → Settings → API Keys & Webhooks. Rehearse with the **test** secret key (`sk_test_...`).
2. Webhook URL: `https://<your-site>/api/payments/paystack-webhook` (one address for orders, shares, corps fees
   and everything built later; the old corps address keeps working).
3. Run the Paystack test-mode checklists in `docs/PHASE1-BUYER-PAYMENTS.md` and `docs/PHASE2-FARMER-SHARES.md`
   (test card, bank transfer, closed window, replayed webhook, and that the net settled equals the listed price).
4. To go live: swap in the **live** key (`sk_live_...`) and the live webhook. Money out (loans, payouts) arrives in
   Phase 5 and needs Transfers enabled on your account.
Fee, review thresholds, expiry times and the late-fee settings are all editable in Admin → Finance → Payment
confirmations → Settings.

## 8. Scheduled jobs on a sleeping host
Render's free plan puts the service to sleep when idle, so a job due while it sleeps would not run. Set up a free
pinger (cron-job.org, UptimeRobot, ...) to call, every 5 minutes:

```
GET https://<your-site>/api/system/tick        header:  x-tick-secret: <JOB_TICK_SECRET>
```
Each call wakes the server and runs whatever is due; jobs catch up if they were late and are safe to repeat.
On an always-on (paid) host you can drop the pinger. Check Admin → System → System status: every job shows its last
and next run. `GET /health` reports whether the database and job runner are working (point an uptime monitor there too).
Rate-limit counters live in memory, so run **one** copy of the service (a second copy would need a shared store).

## 9. First admin and prices
From your own machine, pointed at the live database:
```bash
cd backend
DATABASE_URL="<neon string>" DB_SSL=true npm run seed:admin -- --email you@yourdomain --password "<strong password>" --name "Your Name"
DATABASE_URL="<neon string>" DB_SSL=true npm run seed:prices        # starting catalogue; review the sell prices before going live
```
(Or register an Admin on the site with `ADMIN_SETUP_CODE`.) Then log in, open Admin → System, and use **Send test** on
Messages for one email and one SMS.

## 10. Go-live checklist
1. `npm run preflight` with the live values: **0 FAIL**, and every WARN understood.
2. Paystack live key + live webhook; one small real payment end to end; confirm the net settled in Paystack equals the
   listed price; adjust the fee settings if Paystack's VAT or card mix makes it differ.
3. SES out of the sandbox; SMS sender name approved; bounce topic connected; test messages arrive.
4. Admin → System: every job has run, `GET /health` is green, the alert phone is set.
5. A week of normal use with `CSP_MODE=report-only`; if Admin → System → Security log shows no `csp_violation`
   entries, set `CSP_MODE=enforce`.
6. No `PAYMENT_ALLOW_SIMULATED`, no `RATE_LIMIT_MULTIPLIER`, no test keys left in the live environment.
7. Admins can move money with only a password for now (a second step is not built). Revisit before launch.
8. Move to an always-on plan. Take a backup plan seriously: Neon's own point-in-time restore for the database
   (check how far back your plan reaches); files have none (see step 4).

## 11. Updating and rolling back
Push to `main`; Render redeploys. Migrations run on start and only **add** things, so rolling the code back to a
previous version is safe for the database. Do not roll back after a release that changed money data (payments,
refunds) without checking the payment ledger first.

## 12. When something looks wrong
| You see | Likely cause |
|---|---|
| "Online payment is unavailable" | `PAYSTACK_SECRET_KEY` missing |
| Uploads fail with "File storage is not configured" | `R2_*` missing or incomplete |
| Emails show **failed** in Admin → System → Messages | no email provider, SES still in sandbox, or an unverified address |
| Page loads but no styling or script (403) | very old build; the app's own address is always allowed since v31 |
| "Too many attempts, try again in N minutes" | the per-IP limit or a locked account: Admin → System → Security log; unlock under Security |
| Jobs not running | no pinger on a sleeping host (step 8) |
| Server will not start | `JWT_SECRET` missing or under 32 characters; read the host's logs |
| Payment taken but order not confirmed | wait a minute (the return page and the 15-minute re-check settle it); check Admin → System status → last payment webhook |
