# HANDOVER: where the build stands (v36 = v35 + screen-usability pass)

**v36 (this zip) = v35 merged with the usability pass** (Jump-to dropdowns on long screens, Login-as dropdown, Back button that steps through tabs, readability/visibility fixes). Backend is exactly v35's. Details and how the merge was done: `APP_GUIDE.md` ("v36"). v35 notes follow.


Project: EPHAAG Farms 20-phase gap-closing plan. Chain: v28 -> v29 foundations -> v30/v31 phase 1 -> v32 phase 2 + deployment -> v33 phase 3 -> **v34 (this zip): late share fees, the single Refund room, corps scan-before-pay. Fully tested** (backend suites, Python suites and browser journeys).

**v35 (this zip) = v34 plus Phase 4 (investor payments), fully tested** (backend suites, Python suites, browser journeys 1-12). See `PHASE4-INVESTOR-PAYMENTS.md`. v34 added late share fees, the Refund room and corps scan-before-pay (`LATE-FEES-AND-REFUND-ROOM.md`).

What v34 added is described in `LATE-FEES-AND-REFUND-ROOM.md`. Fixed while finishing it: `verifyAndSettle` was missing from `services/payments.js` (the server would not start), and a late purchase's payment link was not returned to the browser.

## Remaining phases (build order from the plan)
Next: **Phase 8** (farmer identity/NIMC, profile), then Phases 5 and 6 (money flows: savings, loan repayments in instalments, Boost Cash, payouts; loan scoring), then 7, 9-12, 13-14, 20 -> Step 3: **Phase 8 verified farmer profile (NIN)** -> Step 4: **Phase 5 savings/repayments/Boost/payouts** (instalments within the loan duration; Paystack transfers out; pause switch + daily cap) and **Phase 6 loan scoring** -> Step 5: Phases 7, 9, 10, 11, 12 -> Step 6: Phases 13, 14 -> Step 7: Phase 20 backups. Phases 15-19 (storage, email/SMS, jobs, login protection, tests) are DONE (v29). Apply the new money rules above to every new payment type.

## Rules to apply to every new payment type
Duplicates detected by the system (warning + Proceed to pay); expired, cancelled, wrong amount or currency rejected with the reason on screen; no manual steps except real exceptions, which notify admins and wait in the Refund room (full refunds, written reason). Late payments are never refused: the late fee is shown and agreed first. **Phase 5**: savings and loan repayments payable in instalments (any part, e.g. half) but never beyond the loan duration; a wrong amount is refused with the correct amount shown; loan late calculations stay as already built.

## Decisions I applied without an answer (tell the user if wrong)
Automatic refunds removed entirely (they said no refund wiring); profile photos in the public bucket; duplicate window 24h (same items/quantity/amount); order expiry 24h; corps payments cannot be paid twice (no pay button after paid).

## How to work in the sandbox (lessons learned)
- Tools time out at 300 s per command: run long jobs detached (`setsid nohup ... &`) and poll the log.
- Postgres is not running after a restart: `service postgresql start`. Create DB user password `postgres`; tests use `postgresql://postgres:postgres@localhost:5432` (`PG_ADMIN_URL`).
- `npm install` at the project root (workspaces: backend, frontend), then `cd backend && node test/run-all.mjs` (builds a throwaway DB, stand-in R2/SES/SMS/Paystack, runs everything incl. the Python suites; `SKIP_PYTHON=1`, `API_TEST_FILES=test/api/x.test.mjs`, `API_TEST_NAME=...`, `SHOW_SERVER_LOG=1` help). The frontend must be built (`npm run build`) for browser tests.
- Browser tests: `cd e2e && npm install && npm i --no-save @sparticuz/chromium && node run-local.mjs` (real Chromium works this way; Playwright's own download is blocked). Create DB `ephaag_e2e` first.
- Never `pkill -f` a pattern that appears in your own command line (it kills your shell): use `pkill -x node`.
- Needed `.env` for ad-hoc runs is not shipped; `backend/.env.example` lists variables.
- Python suites need `requests` and `psql`.
