# HANDOVER: where the build stands (v38 = v37 + Phase 8 + Phase 5, merged, + two owner changes)

**v38 (this zip)** is the clean merge of two parallel builds from v35: **v37** (the screen-usability pass + the owner's naming decisions) and the **Phase 8 + Phase 5 build** (farmer NIN identity/unit matching; Paystack money-in for savings, loan repayments and Boost Cash; automatic payouts to farmers and loan/withdrawal recipients; bank accounts; investment late penalties). Every feature of both is kept; where both touched a file, the Phase 5/8 logic sits inside v37's naming and dropdown layouts. Dropped on purpose: the old Processor room (v37 removed it) and `FarmerProfileCard` (the Phase 8 profile panel replaces it). Migrations: v37's buyer/processor migration is now `012_`, after the Phase 5/8 `009`-`011` ones (all safe to re-run on every boot).

Two changes made on top of the merge (owner's request):
1. **Processing goes to any buyer.** Procurement's assign-processing list shows every buyer account and the API accepts any `role_type = 'buyer'` account. There is no organization / individual or processor / consumer limit.
2. **Admin is not a registration choice.** The Register page no longer offers Admin and the API refuses `role_type: "admin"`; `ADMIN_SETUP_CODE` is gone. The seeded admin (`npm run seed:admin`) is the **main admin**; migration `013_admin_management.sql` also makes the earliest existing admin the main admin on an existing database. Only the main admin can add or remove admins (Admin -> Positions -> Admins): promoting turns an existing account into an admin (its old role is remembered); removing restores that role (or locks the account if there is none). Other admins have every other admin feature. Tests: `backend/test/api/admin-management.test.mjs`, new checks in `backend/store_test.py`, and an e2e journey.

**Not run in the build environment (no Postgres or bundler there):** the API suites, Python suites and browser journeys. Checked there: `node --check` on every backend file, a TypeScript JSX parse of every frontend file, every relative import and named export resolved, every JSX component declared, every frontend API call matched to a mounted route. Run `cd backend && node test/run-all.mjs` before deploying.

---

## (v37 = v36 + the owner's naming decisions)

**v37 (this zip)** applies five naming/structure decisions the owner strictly requested: NYSC AGROALLIED SAED, the 3EI Governance model, one Buyers/Processor profile (no Processor profile), departments hidden from the public site, and the README note. See the table at the top of `README.md` and the "v37" section of `APP_GUIDE.md`. Everything below is the v36 hand-over.

## (v36 = v35 + screen-usability pass)

**v36 = v35 merged with the usability pass** (Jump-to dropdowns on long screens, Login-as dropdown, Back button that steps through tabs, readability/visibility fixes). Backend is exactly v35's. Details and how the merge was done: `APP_GUIDE.md` ("v36"). v35 notes follow.


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
