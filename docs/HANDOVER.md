# HANDOVER: v43 = v42 + Phases 14 and 20 (Corps certificate leftovers, Backup and restore)

Read `PHASE14-20-CORPS-CONSENT-AND-BACKUPS.md` first (decisions, how it works, assumptions to confirm, what you must set up) and `BACKUP-AND-RESTORE.md` (set-up and the restore drill). v42 notes (Phases 12 and 13) follow below.

**Assumption awaiting your confirmation:** corps money that arrives but cannot be applied is no longer refundable in the Refund room (still alerts the office).
**You must do before go-live:** create the backup bucket and second-provider bucket, set the backup settings, keep a copy of the encryption key, deploy where `pg_dump` exists (the Dockerfile), and do one restore drill.
**Next:** the leftovers (GitHub test automation, load test, browser journeys 5, 6 and 8), then a full go-live pass.

---

# HANDOVER: v42 = v40 + Phases 12 and 13 (Transport and Maintenance, Corps learning)

**Name note.** The zip you uploaded was called v40 but already held Phases 10 and 11 as well (it is the merge of both lines). The other line's own "v41" (Phases 10 and 11 only) is **older than this build and not needed**. This build is called **v42** so it cannot overwrite either.

**Phase 12** (Transport and Maintenance) and **Phase 13** (corps learning) are built, tested and documented in `PHASE12-13-TRANSPORT-CORPS-LEARNING.md` (read that first: decisions, how it works, assumptions to confirm, API). In short: fleet, trips, a delivery code the buyer gets, proof with photo and GPS, breakdown opens an urgent maintenance request and a rescue trip, Maintenance and Transport costs follow the department budgets (held for Finance when over budget); corps videos and documents now need real time, counted by the server, while live sessions and quizzes are unchanged.

**Assumptions awaiting your confirmation:** breakdown requests are created already approved; held costs are recorded but do not count until Finance decides; videos need 80 percent watched; non-YouTube/Vimeo video links fall back to "page must stay showing"; old video lessons need their length entered by an admin.

**Next:** Phase 14 (corps certificate leftovers), then Phase 20 (backups), then the leftovers (GitHub test automation, load test, browser journeys 5, 6 and 8).

---

# HANDOVER: v40 (v39 corrections + Phases 6, 7, 9, 10, 11 merged)

**v40** merges two builds that both grew from v38: my v39 (the four correction phases: wording, home page, farmers, buyers) and the other line's **Phase 6** (loan scoring), **7** (research internal, public consultancy with approval, fee and scheduling), **9** (analytics drill-down, Excel, report), **10** (purchasing roles, quotations, budgets) and **11** (production costs and profit). Everything from both is in. Where both did the same job I chose one:

- **Consultancy booking:** kept the other build's full flow (apply, admin approves with a fee, applicant pays, admin schedules, private tracking link, emails and SMS). Dropped my simpler appointment form and its endpoint. The public **Consultancy** block keeps the owner's wording: one note ("Have one-on-one guidance with Ephaag experts.") and a small **Book appointment** button at the bottom right that opens that booking form in a window (Home page, TRC page, Training & Consultancy page).
- **Research:** internal only (the other build). Gone from the public pages.
- **Payments wording:** the correction rules were applied to the new screens too. The consultancy payment page and emails no longer name the gateway or show a fee line; the guest sees the payment preview (Consultancy fee, Paystack Charges, Total, Proceed & Pay).
- **Migrations:** renumbered mine after theirs: `016_unit_others.sql`, `017_seminar_content.sql` (theirs are `014_research_consultancy.sql`, `015_purchasing_budgets_production_costs.sql`). My simple appointment migration was dropped.
- **Dashes:** applied to every new file and message from the other build.
- Test uploads (`backend/uploads/...pdf`) that were inside the other zip were left out; they are leftovers of test runs.

Not run in the build environment (no Postgres there): the API suites, Python suites and browser journeys. Checked there: syntax of every file, import and identifier resolution, every frontend API call against the mounted routes, and a server render of the main screens. Run `cd backend && node test/run-all.mjs` before deploying.

---

## Earlier: v39 = v38 + four correction phases

**v39** is v38 (the v37 + Phase 5/8 merge, main admin, buyers-only processing) plus the owner's corrections, in four phases:

1. **General.** No long dashes anywhere (screens, messages, emails, docs, code comments). Customers never see the gateway name in explanations. The gateway charge shows in ONE place only, the payment preview: Amount, **Paystack Charges**, Total and a **Proceed & Pay** button (`components/PaymentPreview.jsx`, backed by `GET /api/payments/fee-quote`). Receipts, emails and SMS no longer show a fee line. Explanations written for the developer were cut to short notes (public pages, auth pages, farmer/loan/buyer/corps screens, the admin login hint).
2. **Home page.** The three videos are re-muxed fast-start (the index was at the end of each file, which caused the slow start and blank slides) and each has a poster frame; the carousel keeps the old slide under the new one until the next video is ready. Products & Services lists all six services with a short note (`data/services.js`, shared with Home). The "Free seminars..." paragraph is gone. Consultancy is one line plus a small **Book appointment** button at the bottom right that opens the booking form (in v40 this is the full approval, fee and scheduling flow).
3. **Farmers.** Company growth removed (screen and API). The dashboard shows three cards: User ID, Rank, Training rank. "Others" added as a unit (migration 017). Seminars are videos and slides: an admin adds YouTube/Vimeo/direct video links and slide images to a topic (Admin > TRC > Training > Videos & slides, migration 016); the farmer's screen marks a video complete when it ends and a deck when the last slide is reached, and the topic completes by itself (`controllers/seminarContentController.js`). No Mark complete button. **Buy Share** is its own menu, separate from Savings.
4. **Buyers.** The dashboard shows only: "You can place an order against a committed period of time instead of paying per order."

Notes: slide images must be PNG/JPG/WebP (export from PowerPoint or PDF as images). Direct video links should be hosted on our storage (the site's content policy limits media sources). Old seminar topics with only a material file or online link complete when the farmer opens them. New tests: `backend/test/api/fee-quote.test.mjs`, `seminar-content.test.mjs`, `admin-management.test.mjs`.

Not run in the build environment (no Postgres there): the API suites, Python suites and browser journeys. Checked there: syntax of every file, import/export and identifier resolution, every frontend API call against the mounted routes, and a server render of 36 screens including the Farmer, Buyer, Investor, Corps, Finance, Procurement, TRC and Positions rooms. Run `cd backend && node test/run-all.mjs` before deploying.
## Earlier line: v41 = v40 + Phases 10 and 11 (the other build)

**v41** adds Phase 10 (Purchasing: separate Procurement/Finance/CEO approval roles, required quotation and invoice documents, annual department budgets with low-budget alerts and a Finance hold when a budget is used up) and Phase 11 (Production: livestock farms and harvests, farm costs, profit per harvest). See `PHASE10-11-PURCHASING-PRODUCTION.md`. Also fixed: Purchasing handlers built responses while holding a database connection; a rejected purchase order could never be replaced; **the message queue had no per-send timeout, so one hung email or SMS could freeze all notifications until restart** (now a 25 s deadline, `SEND_TIMEOUT_MS`, with a regression test). **Next build: Phase 12** (Maintenance and Transport; fleet, delivery tracking, proof of delivery) **and Phases 13-14** (corps learning and certificate leftovers), then 20 (backup and restore).

---

## Earlier: v40 = v39 + Phases 7 and 9

**v40** adds Phase 7 (Research internal, PDF upload, staff only; Consultancy public booking with approval, Paystack payment and scheduling, for members and guests) and Phase 9 (Analytics: state/LGA/ward/unit drill-down, key charts, Excel export, printable report). See `PHASE7-9-RESEARCH-CONSULTANCY-ANALYTICS.md`. Also fixed an intermittent pool-guard failure in the message-queue drain. **Next build: Phases 10 and 11** (Purchasing, Production), then 12, 13-14, 20 (see the table in `EPHAAG-handover-note.md` section 6).

---

## Earlier in this line: v39 = v38 + Phase 6 (loan scoring)

Phase 6 (see `PHASE6-LOAN-SCORING.md`): funds utilization worked out from declared/listed produce, an admin-set minimum total score (Admin Hub > Loan scoring), the last completed quarter's score enforced in `applyForLoan` (tickets and first-time applicants not exempt), a score card on the farmer's Loan Office. Also fixed: a pool-guard violation on the ticket path of `applyForLoan`, and stale test wording after the NYSC AGROALLIED SAED rename.

---

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
