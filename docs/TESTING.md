# Testing guide

## Run everything (one command)

```
npm test            # from the project root (same as: cd backend && npm test)
```

Needs Postgres reachable as `postgres:postgres@localhost` (override with `PG_ADMIN_URL`),
`psql`, and Python 3 with `requests` (`pip install requests`) for the older suites.
`SKIP_PYTHON=1 npm test` skips the Python suites. `ONLY_PYTHON=store_test.py` runs one of them.
`SHOW_SERVER_LOG=1` prints the app's log when something fails.

What it does, in order:
1. Drops and recreates a throwaway database (`ephaag_test`), migrates it, seeds prices and an admin.
2. Starts **stand-in services** in the test process: fake Cloudflare R2 (`test/standins/fakeS3.mjs`), fake Amazon SES and a fake SMS provider (`fakeMail.mjs`). Each has `/__state`, `/__reset`, `/__fail` or `/__advance` control addresses so tests can read what was sent, simulate an outage, or **move the clock forward** (signed-link expiry) without waiting.
3. Starts the app twice: server A on port 4000 (rate limits relaxed so old suites can register many users), server B on port 4001 in production mode (real limits, strict CORS, no local-disk fallback).
4. Runs: the unit tests, then the Python suites (`corps_certificates`, `big_round`, `corps_learning`, `store`), then the foundations API tests in `test/api/`.
5. Prints one PASS/FAIL summary and exits non-zero if anything failed.

Time-dependent logic (job schedules, expiry) takes an explicit `now` so tests set the date instead of waiting; see `test/api/jobs.test.mjs`.

## Adding tests for a new phase
Add `test/api/<phase>.test.mjs` using `test/helpers/api.mjs` (`api()`, `newUser()`, `loginAdmin()`, `db`, mail helpers). It runs automatically. New stand-ins (fake Paystack, identity provider) go in `test/standins/` and are started in `run-all.mjs`.

## GitHub checks (`.github/workflows/ci.yml`)
On every push and pull request: secrets scan (gitleaks), syntax check of every backend file, frontend build, the two CSS checks, all API tests above, a package vulnerability scan (high/critical fail the run), and a Playwright job. Logs are saved on failure. To make failing checks **block a merge**: GitHub repo -> Settings -> Branches -> add a rule for `main` -> "Require status checks to pass" -> tick `checks` and `secrets-scan`.

## Browser tests (Playwright, `e2e/`)
`cd e2e && npm install && npx playwright install chromium && npx playwright test` (starts the app on port 4600 with a throwaway database `ephaag_e2e` and a stand-in Paystack on port 4510; create the empty database first: `createdb ephaag_e2e`).
The app must be built first (`npm run build` at the root): the browser tests use the real screens.
**Real today (7 passing on desktop and phone-sized screens):** admin sign-in, same message on a wrong password, buyer journey (shop, fee line, Pay with Paystack, return page, order history, receipt, duplicate-order warning), and the "payment refused" screen. The other journeys are `test.fixme` and become real as their phases are built.
In an environment that cannot download Playwright's Chromium (as my build environment could not): `npm i --no-save @sparticuz/chromium && node run-local.mjs`. These tests caught two real bugs in v29/v30 (see `V31-HARDENING.md`), which is why they matter.

## Connection-pool guard
`POOL_GUARD=1` (set by `npm test`) records any code that asks the database pool for a second connection while it already holds one: the pattern that deadlocks the server under load (v28's sign-up had it). The run fails if any is recorded, and `test/api/pool-guard.test.mjs` proves the guard itself works. It only sees code the tests exercise; `python3 backend/scripts/audit-pool-usage.py` is a crude static scan of everything (its remaining hits are the job lock, which holds one dedicated connection on purpose).

## Load test
`BASE_URL=https://staging.example USERS=200 DURATION_SECONDS=60 node backend/scripts/load-test.mjs`
Run it against a **staging copy on the real host**, started with `RATE_LIMIT_MULTIPLIER=1000` (otherwise the per-IP limits correctly block a single machine). Targets: 95% of requests under 800 ms and under 1% errors. A load test only means something on the real hosting. Note that password hashing (12 rounds) is deliberately slow: a burst of simultaneous sign-ins is the heaviest moment, so a small host may need more CPU.

## Demo data
`BASE_URL=http://localhost:4000 node backend/scripts/seed-demo.mjs` creates demo farmers, a buyer and an investor through the public API (password `DemoPass123!`).
