# Ephaag Farms — App Guide (context, not user-facing copy)

This file is for whoever picks up this project next (a future Claude
session, a new developer, or the founder revisiting it after a break). It
holds the "why" that used to be spelled out on-screen inside the app itself
— that in-app copy has since been trimmed to short, user-facing microcopy
(see the 2026-09-04 copy-trim note at the bottom), so this is now the one
place the fuller explanation lives.

## What the app is

Ephaag Farms is a full-stack farm-management platform. A public marketing
site (Home, About, Products & Services, Contact, service-specific rooms)
sits in front of a set of logged-in "rooms" — one per user type — plus an
admin side that oversees all of them.

## Member rooms (one per role_type)

- **Farmer** (`m2-farmer-room`) — declare produce, see standardized prices,
  make savings deposits, apply for loans, track farm-share investment,
  attend training courses, send feedback to admin, view payment history.
- **Buyers/Processor** (`m4-buyer-room`) — one profile for buying and processing.
  A Jumia/Temu-style shopping flow: browse the product catalog (real photos
  when an admin has added one, an emoji icon fallback otherwise), add to cart,
  check out, track orders — plus a **Processing jobs** tab where processing
  jobs assigned by Procurement are worked before orders move on to transport.
  (There is no separate Processor profile; `m6-processor-room` was removed.)
- **Transporter** (`m7-transporter-room`) — jobs assigned by the Transport
  department; generates shipment documents.
- **Distributor / Store room** (`m8-store-room`) — orders allocated by the
  Store department.
- **Investor** (`m9-boys-quarters`) — monthly/bulk investment plans, ROI
  breakdown.

## Admin side

Admin (`role_type='admin'`) has one login and full access to every
department's real screen — there's no separate department login yet (no
staff hired), so "Login As" (`admin-hub/LoginAsPage.jsx`) is just a picker:
click a department, `ActingAsContext` remembers the label, and the admin is
dropped straight into that department's own dashboard with every control
live. `ActingAsBanner.jsx` shows "Acting as: X" with an Exit button whenever
a department was reached this way.

**Admin's own sidebar** (`AdminDashboardShell.jsx`) is for admin-wide tools
only — Add Catalog, Add Price, TRC, Login As, Analytics, Requests,
Positions, Feedback, Contact messages, Profile — plus **Dashboard**, which
is the home screen (`admin-hub/AdminHub.jsx`): a welcome-back message and a
handful of quick stat cards (farmers, buyers, total savings, pending loans,
crops declared, requests awaiting the admin's approval), sourced from the
existing `/analytics/overview` and `/requests/awaiting-me` endpoints — no
new backend logic needed. Departments are **not** listed in this sidebar
(2026-09-04 change) — Login As is the one way in, to avoid the same
destination being reachable two different ways with two different visual
contexts.

Each **department** (Production, Procurement, Transport, Store, Finance,
Maintenance, TRC) has its own dashboard shell with its own hamburger
menu of that department's sections (e.g. Finance: Payments, Loans,
Settlements, Investments, Savings) — a separate component per department,
all sharing the same underlying `DashboardShell.jsx`.

## Catalog / pricing (single source of truth: `standard_prices`)

Adding a brand-new crop/product happens in **Add Catalog**
(`admin-hub/AddCatalogPage.jsx`) — the only place a new row is created.
**Add Price** (`admin-hub/AddPricePage.jsx`) only edits the buy/sell price of
something already in the catalog. Once a product exists, it shows up
automatically in the buyer's Product Catalog, the farmer's visible prices,
and Procurement's price list — all three read straight from
`standard_prices`, so there is no separate "publish" step.

**Product photos** (2026-09-04): `standard_prices.image_url`, set via a real
upload (multer middleware, served from `/uploads/products`) rather than the
old "type an emoji" field. The buyer catalog/detail panel shows the real
photo when present, falling back to an emoji icon by category otherwise.
The file `<input>` intentionally has **no** `capture="environment"`
attribute — that attribute forces mobile browsers straight into the camera
with no gallery option, which is what the 2026-09-04 bug report was about;
without it, the OS shows its normal chooser (camera *or* library).

## Theming: `.dash-scope` and `.on-light`

Logged-in areas (`/dashboard/*`, `/admin/*`) are wrapped in `.dash-scope`
(`ProtectedRoute.jsx`), which enforces the brand's dark green/deep red
dashboard look and inverts dark text to light automatically. A handful of
surfaces deliberately stay light regardless (buyer cart/checkout/payment/
confirmation, the profile-menu dropdown, the savings-deposit consent modal)
— those carry the `on-light` class, which is a hard override (`!important`)
of the general inversion rules. Any *new* white/light card added inside a
dashboard route must carry `on-light` or its text will silently invert to
the light color meant for dark backgrounds and become unreadable — this
exact bug shipped once already (2026-09-04 report: "the write up aren't
visible").

## 2026-09-04 fixes (mobile responsiveness + copy trim + nav)

- **Root cause of the mobile "overflowing / cream showing through" bug**:
  `bg-canopy-950` was used in `DashboardShell.jsx` (the shell literally
  every room and every admin screen renders through) but `canopy-950` was
  never defined in `tailwind.config.js` — Tailwind silently emits no CSS
  for an undefined shade, so that background was fully transparent
  everywhere it was used, letting the page's cream body color show through
  on any row where a covering card/input didn't paint over it first. A full
  audit found **51 other call sites** across the app using an undefined
  shade of `canopy`/`clay`/`harvest`/`ink` the same way (mostly cosmetic —
  text quietly falling back to an inherited color — but all real bugs).
  Fixed by filling in the missing shades in `tailwind.config.js` rather than
  hunting down and rewriting every call site. Added `overflow-x: hidden` on
  `html body #root` plus `w-full`/`min-w-0` down the `DashboardShell.jsx`
  flex chain as a standing guard so a future long/unbreakable string can't
  force the page wider than the device again.
- **Photo upload camera-only bug**: fixed by dropping `capture="environment"`
  from both file inputs in `AddCatalogPage.jsx` (see above).
- **In-app copy**: the long paragraphs that used to sit under page headers
  (explaining, e.g., exactly how a new catalog item propagates to three
  other screens) were trimmed to one short line each, or removed where the
  heading already said enough. The fuller reasoning that copy used to carry
  lives in this file now instead, plus in the code comments at each
  relevant call site.
- **Admin home screen**: replaced the "Departments" grid at `/admin` with
  the Dashboard summary described above; "Login As" is now the only way an
  admin enters a department from the sidebar.

## v19 — pricing locked to admin, generic Requests wired into every department, back-button trap — 2026-09-05
1. **Pricing removed from Procurement**: the old "Pricing" tab
   (`PriceListManager.jsx`, now deleted) was read-only with a no-op "edit"
   button — never actually wired to a save endpoint. Standardized prices
   are admin-only, set exclusively via Add Catalog / Add Price.
2. **Generic Requests engine wired into every department**: the
   cross-department multi-approver → admin-final-approval workflow
   (`requestsController.js`, previously only reachable from the standalone
   admin "Requests" page) is now also embedded directly inside each
   department's own dashboard via a new shared
   `frontend/src/components/DepartmentRequestsPanel.jsx` — a "Requests" (or
   "Approval requests" for TRC, to avoid clashing with its existing
   consultancy-booking "Requests" list) tab in Procurement, Transport,
   Production, Store, Finance, Maintenance, and TRC. New requests raised
   from inside a department default to (and can't be reassigned away from)
   that department. This is separate from each department's own
   bespoke request features that already existed (Maintenance's fault
   reports, Finance's payment-authorization requests, Store's restock
   requests, Purchasing's own internal purchase-request pipeline) — those
   are untouched.
3. Fixed a real pre-existing bug found while doing this: `NewRequestForm.jsx`'s
   department list had "Transportation" instead of "Transport", inconsistent
   with `DEPARTMENTS` in `adminPositionsController.js` everywhere else.
4. Renamed Procurement → Purchasing → "Suppliers" to "Vendors" with a
   clarifying description — it's an internal-purchasing vendor directory
   (tools/supplies/services), not farmer/crop sourcing (which is the
   Orders tab's job). This was a real point of user confusion.
5. **Transport dashboard clarified**: the dispatch/driver-assignment
   function was always real and working, just displayed directly on the
   Dashboard tab with no menu item of its own, which read as "nothing
   built." Split into its own "Dispatch" tab; Dashboard is now a brief
   summary.
6. **Back-button trap for "Login As"**: `ActingAsContext.jsx` now installs a
   `popstate` trap for as long as `actingAs` is set — every back/forward
   gesture is caught and cancelled (re-pushes the current URL), so the
   device back button cannot surface any admin page while "inside" a
   department; the Exit button (`ActingAsBanner.jsx`) is the only way out,
   and clears `actingAs` before navigating so the trap disarms itself.
   `LoginAsPage.jsx`'s navigation into a department and the Exit button's
   navigation back to `/admin` both now use `replace` (not `push`) so the
   "Login As" picker screen and stale department entries don't linger in
   history as extra back-stops even before the trap's own guard entry is
   in place.
- Not yet addressed from the same request round: a system-wide audit of
  every other multi-step, React-state-only flow (buyer checkout, farmer
  registration wizard, the internal Purchasing pipeline's own stage
  navigation, etc.) for one-step-at-a-time browser-back behavior — this
  session only covered the specific Login-As boundary that was raised.

## v19-fixes merge — 2026-09-05
A second, independently-produced zip (`Ephaag-farms-v19-fixes.zip`) arrived
based on the original v18 baseline (not on the v19 changes above) and was
merged in cleanly — the two change sets touched different concerns and
only overlapped file-by-file, not line-by-line:
- **Unconditional department "Exit"** (`DashboardShell.jsx`'s new `exitTo`
  prop): a real gap this fixed — `ActingAsBanner`'s Exit button only
  renders when a department was reached via "Login As", so a department
  opened directly from the admin sidebar (TRC, most often) had no way back
  except browser-back or logging out entirely. Every department shell now
  always shows an "Exit" item in its own hamburger menu regardless of how
  it was reached. Merged alongside my back-button trap by making its
  `handleExit` also call `setActingAs(null)` (disarms the trap) and
  `navigate(exitTo, { replace: true })` (no stray history entry) — same
  pattern as `ActingAsBanner`'s own Exit.
- **`departmentRoleLabel()`** (`utils/departmentRole.js`, new): each
  department's Profile tab used to hardcode e.g. "Procurement HOD" for
  whoever happened to be viewing it, even though Login As doesn't swap
  accounts — now shows the real title only if `user.department_head_of`
  matches, else plain "Admin". Wired into all 7 departments' Profile tabs.
- **AdminHub.jsx redesign + new `HomeCharts.jsx`**: admin home screen now
  shows real cash flow / budget utilization / recent transactions /
  pending approvals / department spending / expense-mix charts, all
  linking through to the relevant Finance/Accounting screen or Requests.
  Built entirely from existing endpoints (`finance-department/dashboard`,
  `/transactions`, `/reports/income-statement`, `analytics/overview`,
  `requests/awaiting-me`) — no new backend routes needed for this part.
- **Finance deep-linking**: `FinanceDepartment.jsx` now reads `?tab=` and
  `?section=` query params (e.g. AdminHub's cards link to
  `/admin/finance?tab=accounting&section=transactions`) so a click lands
  directly on the right screen; `AccountingWorkspace.jsx` takes an
  `initialSection` prop for this.
- **Production — annual declarations**: a new company-wide "Ephaag
  declared X yam for 2026" figure per crop/year, distinct from the
  per-farm `harvest_logs` — new `production_annual_declarations` table
  (unique per year+crop, upserts on re-declare), `listAnnualDeclarations`
  / `declareAnnualProduction` controllers, `/production/declarations`
  routes, and `AnnualSummary.jsx` UI to declare/display it.
All 7 department files needed hand-merging (both change sets touched the
same `<DashboardShell>` opening tag, the same Profile block, and — for
Finance/Production only — the same state/effects) but with no actual
logic conflicts; merged, then verified with a full esbuild bundle (clean)
and `node --check` across every backend file (clean). Delivered as
Ephaag-farms-v19-merged.zip (kept v19.zip's docs/APP_GUIDE.md note above
plus this one).

## v20 — third independent branch merged: crop/livestock catalog split, department dashboard cards — 2026-09-05
A third, independently-produced zip (also named `Ephaag-farms-v19.zip`,
based on the pristine v18 baseline, unrelated to either of the two merges
above) arrived and was merged in. Two unrelated feature sets, neither
touching Requests/back-button/pricing-removal from before:
- **Crop vs. livestock catalog split**: `standard_prices` gets `item_type`
  (`crop`|`livestock`, default `crop`) and `age_description`. Livestock is
  priced per animal — `unit` is silently forced to the fixed value `'head'`
  and never shown; `age_description` ("1 year old goat", "3 months
  broiler") is what's actually displayed wherever a crop would show "per
  {unit}". `createPrice`/`updatePrice` in `financeController.js` validate
  and branch on this; `deletePrice` (new) lets Admin remove a catalog row
  entirely — safe because order_items/harvest_logs/farmer_products all
  snapshot crop name+unit as plain text rather than FK'ing to
  `standard_prices`. `AddCatalogPage.jsx`'s create/edit forms, and the
  buyer-facing `ProductCatalog.jsx`/`ProductDetailPanel.jsx`/
  `CartReview.jsx`/`catalogMeta.js`, all updated to branch on `itemType`.
- **Live "Dashboard" cards for every department**: new shared
  `DeptDashboardCards.jsx` (same visual pattern as Maintenance's existing
  DashboardPanel and AdminHub's cards) replaces static/placeholder text on
  each department's own Dashboard tab with real numbers from a new
  `GET .../dashboard` endpoint per department (Production, Procurement,
  Store, Transport, TRC, Finance — Maintenance already had this pattern).
  Cards are clickable shortcuts into the relevant tab via `onNavigate`.
Merge mechanics: wholesale-copied everything not already touched by the
two earlier merges (financeController/orderController/procurementController/
rtcController/storeController/transportController, their routes,
AddCatalogPage/AddPricePage, the four buyer-room catalog files, new
DeptDashboardCards.jsx). Hand-merged the files touched by more than one
branch — `001_init.sql` (two separate additive insertion points, no
overlap), `productionController.js`/`production.js` routes (dashboard
endpoint alongside the existing annual-declarations endpoints from the
v19-fixes merge), and the Production/Finance/Store/Transport/TRC/
Procurement department frontend files (dropped each department's new
dashboard-cards block into its existing Dashboard tab, replacing static
placeholder content where the incoming version did the same, keeping the
Requests tab / exitTo / departmentRoleLabel / declarations UI / deep-
linking from before — none of it overlapped the same lines). Procurement's
version of this file still referenced `PriceListManager` and "Pricing" in
its copy, both already removed by me — used my already-cleaned copy as
the merge base so pricing stayed removed from Procurement. Verified with a
full esbuild bundle (clean) and `node --check` on every backend file
(clean) afterward. Delivered as Ephaag-farms-v20.zip.

## v21 — Unit Leader recommendation as a direct gate, farmer attendance screen — 2026-09-06
1. **Recommendation ticket system (new)**: resolves the "unit_leader_recommendation
   has no point value" gap from earlier — confirmed it was never supposed
   to be graded. New `loan_recommendation_tickets` table + unique partial
   index (`used_at IS NULL`) enforcing one unused ticket per farmer at a
   time. A Unit Leader picks a farmer from their jurisdiction *before* any
   application exists (new `RecommendationTool.jsx`, in Farmer Room's Rank
   tab next to `AttendanceMarker`), gives a reason, issues the ticket.
   `applyForLoan` (loanController.js) now checks for an unused ticket
   FOR UPDATE inside its transaction; if found, the new loan is inserted
   directly at `status='recommended'` (skipping `pending` entirely) with
   `recommended_by` set to the issuing leader, and the ticket is atomically
   marked used — one-time-use, exactly as specified: next application (no
   ticket) goes back through the normal pending → Unit-Leader-review
   pipeline. Farmer's Loan Office (`LoanEligibility.jsx`) shows a banner
   when they're holding a live ticket, with the leader's reason. This is
   deliberately separate from the pre-existing `recommendLoan` action,
   which reviews an already-submitted pending application after the fact —
   both coexist.
2. **Farmer attendance screen (new)**: confirmed there was no self-marking
   to remove — attendance has always been Unit-Leader-only
   (`AttendanceMarker.jsx`, gated `isLeader`); nothing to strip out.
   What was missing was a farmer's own read-only view of their attendance.
   New `GET /farmers/attendance/me` (farmerController.js) — distinct from
   the pre-existing `attendanceHistory`, which is a leader's own "what I've
   marked" log, scoped by `marked_by`. New `AttendanceRoom.jsx` (new
   "Attendance" tab in Farmer Room): present count, attendance percentage,
   a weekly attendance chart (recharts `ComposedChart` — bar for "not
   present" counts, line for attendance %, both in the app's own canopy-
   green/clay-red palette per spec), and a records table. Deliberately
   adapted from the user's reference screenshot rather than copied
   verbatim: the reference shows per-record "Class Start / Sign In / Sign
   Out" timestamps and a computed lateness status — the current
   `seminar_attendance` schema has no time-of-day data at all, only a
   present/absent boolean tied to a seminar's date, so those columns were
   replaced with Date / Seminar / Location / Status rather than fabricating
   times. Flagged to the user as a real follow-up if they want actual
   sign-in/out timestamp capture added to the Unit Leader's marking flow.
Caught and fixed a real bug during this session's own edit: a str_replace
that added the new ticket controller functions accidentally dropped the
`export async function applyForLoan(req, res) {` declaration line itself
(old_str/new_str mismatch) — `node --check` caught it immediately
("Illegal return statement"), fixed by restoring the missing line before
re-verifying. Also cross-checked every route→controller function
reference in `loans.js`/`farmers.js` against the controllers' actual
exports (not just syntax-checked) since node_modules isn't installed in
this environment and the controllers can't actually be run. Verified with
node --check (all backend files clean after the fix), a full esbuild
bundle (clean), and manual div-balance checks (one apparent mismatch in
LoanEligibility.jsx was a false positive from a self-closing `<div .../>`
that grep's naive count doesn't pair with `</div>` — confirmed fine by
reading the file directly). Delivered as Ephaag-farms-v21.zip.

## v22 — 4-way merge: referral system, units, profile reports, community + recommendation tickets, attendance — 2026-09-06
User independently built two divergent v21 zips on top of the same v20
baseline and asked for a single clean merge, verified bit-by-bit, with
nothing left unmerged.

**Zip A's additions** (undocumented in its own APP_GUIDE — folded in here):
1. **Universal referral system**: every registered member gets a
   deterministic `referral_code` (from their own row id) at registration;
   an optional `referralCode` field on the Farmer registration wizard
   looks it up live (`GET /auth/referral-lookup`) and shows whose it is
   before submitting. Tracked in a new `member_referrals` table, separate
   from the pre-existing investor-specific referral/bonus system, which is
   untouched. Farmer Room gained a "Referral" tab (`ReferralPanel.jsx`).
2. **Unit Leader — create unit**: a Unit Leader can propose a new unit
   (`CreateUnitPanel.jsx`, Farmer Room's Rank tab) with name/state/lga/
   ward/note; sits `pending` until an admin approves/rejects it
   (`admin-community/CommunityPage.jsx`). New `units` table.
3. **Unit Leader — report profile**: a leader can flag a jurisdiction
   farmer's profile with a reason + optional proof image
   (`FarmerProfileReportModal.jsx`, opened via a new "View" link in
   `JurisdictionOverview.jsx`); goes to the same admin Community review
   queue. New `profile_reports` table + `uploadReportProof` upload config.
4. **Admin Community module + Unit Leader "Login As"**: new `/admin/
   community` page hosting the two review queues above; new `/admin/
   unit-leader` "login as" entry point giving any admin a real Unit
   Leader-equivalent screen (jurisdiction, attendance, loan review, unit
   creation) — not a new HOD position, just a bypass screen, same pattern
   as every other role_type='admin' bypass in this app.
5. **AdminHub dashboard sparklines**: the three top stat tiles (cash
   balance, revenue, expenses) gained a `MiniTrendChart` under the big
   number, derived from the same real daily transaction data already
   being fetched — no new endpoint.

**Zip B's additions** (already documented in its own v21 entry above):
recommendation-ticket system (Unit Leader pre-authorizes a farmer's next
loan application, one-time use) and the farmer-facing Attendance screen.

**Merge mechanics**: full hash-diff against a common ancestor confirmed
both zips branched independently from the same v20 delivery — genuinely
disjoint features, not competing edits. Most touched files were a clean
superset from one side (took that side wholesale: authController.js,
upload.js, routes/auth.js, server.js, AdminHub.jsx, HomeCharts.jsx,
LoginAsPage.jsx, AdminDashboardShell.jsx, App.jsx, JurisdictionOverview.jsx,
FarmerRegisterWizard.jsx from A; loanController.js, routes/loans.js,
indicesEngine.js, LoanEligibility.jsx, LoanOffice.jsx from B). Four files
needed a genuine hand-merge because both sides independently added
different content in the same area:
- `farmerController.js`: A's `jurisdictionFarmerProfile` and B's
  `myAttendanceRecord` sit in adjacent, non-overlapping insertions —
  both kept, in original relative order.
- `001_init.sql`: B's `loan_recommendation_tickets` table (mid-file) and
  A's `member_referrals`/`units`/`profile_reports` tables (end of file)
  inserted at their original locations — verified zero duplicate table
  or index names across the whole merged file.
- `routes/farmers.js`: both new route lines (`/jurisdiction/:id` from A,
  `/attendance/me` from B) added; both needed middleware already imported
  in the file.
- `FarmerRoom.jsx`: full hand-merge of both feature sets — Attendance tab
  + Referral tab + Rank-tab's RecommendationTool/CreateUnitPanel/
  profile-report-modal all coexist, every import and JSX branch
  reconciled by hand.

**Verification**: every backend `.js` file syntax-checked individually
(`node --check`, all clean). Full `npm install` + `npm run build`
(fresh, root workspace): zero errors, all new chunks present
(UnitLeaderDepartment, CommunityPage, AttendanceRoom, RecommendationTool,
etc.). Fresh Postgres 16 migration from an empty DB: clean, all 4 new
tables present. Wrote a new `merge_v22_test.py` (32 checks) covering every
merged feature end-to-end together on one real running server — referral
registration/lookup, unit propose→approve, profile report submit→decide,
jurisdiction profile view, attendance record→view, recommendation ticket
issue→duplicate-reject→consume-on-apply→correct auto-recommended status,
eligibility endpoint still reflecting the gate correctly — all 32 passed.
Reran the pre-existing `big_round_test.py`: 0 failures (2 skips are
long-documented, pre-existing, out-of-scope items — a date-window
constraint on personal savings and the retired Consultancy feature,
neither touched by either v21 branch). Reran the pre-existing
`store_test.py` (patched only in a throwaway sandbox copy to supply now-
required checkout contact fields and a seeded catalog price, both
pre-existing drift from unrelated prior sessions, not this merge): 61/62
passed, the 1 fail is the test script's own hardcoded `crops: "Maize"`
in its farmer-registration helper blocking a same-farmer Cassava listing
— a test-script limitation, not an app or merge defect (confirmed
`createMyProduct`'s crop-restriction logic is byte-identical between
both v21 branches, untouched by this merge).

Deleted all throwaway test scripts (`merge_v22_test.py`,
`store_test_sandbox.py`, sandbox `.env`) and cleaned `node_modules`/
`dist`/`__pycache__` before zipping. Delivered as Ephaag-farms-v22.zip.

## v24 — NYSC AGROALLIED SAED member (NYSC) portal, phase 1: role, registration, login, dashboard, profile — 2026-10-20
NYSC has partnered with EPHAAG to train NYSC AGROALLIED SAED members. This is phase 1 of 6;
the agreed rules for the later phases are recorded here so nobody has to
re-derive them.

**Agreed rules (all phases)**
- Own role `corper` (self-service). Look = the light "portal" design (option B),
  same hamburger `DashboardShell` as every room, content in an `on-light` cream surface.
- Registration is free. A single one-time access fee is paid online through a
  payment gateway (to be introduced later, for the whole app). Until paid:
  no access to courses and the dashboard % does not count.
- Admin creates training in all forms (video link, PDF/reading, live session) and,
  for every course/training, chooses its audience: **Corps** or **General**.
  Corps content is separate from the general (free) farmer courses — the existing
  farmer endpoints (`rtc` `myCourses` etc.) must filter to `audience='general'`.
- Each course has its own quiz and its own score out of 100 (score only matters at
  course level). **Dashboard % = courses completed / total NYSC AGROALLIED SAED courses** (5 courses:
  each = 20%), regardless of quiz score. Nothing counts before payment.
- Certificate: one general EPHAAG certificate for everybody (personal details only —
  no grades, no course names). Issued automatically when a member completes everything
  but hidden until the batch due date; admin then marks the batch complete, making it
  visible to every completed member of that batch and emailing them. Admin can export
  all registered NYSC AGROALLIED SAED members' data to send to NYSC for NYSC's own certification.

**Built in phase 1**
- DB (`001_init.sql` §21): `users.role_type` now allows `'corper'` (self-healing
  DROP/ADD of `users_role_type_check`); new `corper_profiles` (NYSC identity,
  personal, education/skills, training goals, consents). Batch = `service_year` +
  `batch` (A/B/C) + `stream` (I/II) — structured, not free text. State code is unique
  (case-insensitive).
- `backend/src/utils/corperProfile.js`: single spec of every profile field, its tab
  ("section"), validation, and which fields count toward profile completeness (plus the
  passport photo). Shared by registration, the profile endpoints and the `/me` loader.
- `POST /auth/register` with `role_type:"corper"` (email + phone mandatory; NYSC fields
  and terms acceptance validated before any insert); `GET /api/corpers/me`;
  `PUT /api/corpers/me/profile/:section` (personal | nysc | education | goals | documents).
  `attachProfile` returns `user.corper` and `user.profileCompletion` for corpers.
- Frontend: `CorperRegisterWizard` (3 steps) wired into Register; Member / Corp member
  switch on LoginMember; `/dashboard/corper` → `modules/m10-corper-room/` (Home with the
  4-step tracker, five-tab Profile, locked placeholders for Training / Payments /
  Certificate, Support → Contact).

**Not built yet:** payment + gate, course audience + lessons + quizzes + admin screens,
progress %, batches/due dates, certificate + verify page + emails, NYSC export, CV upload
(needs persistent file storage — Render's free-tier disk is wiped on redeploy), universal
Referral tab for corpers.

## v25 — NYSC AGROALLIED SAED member portal, phase 2: Corps / General training, lessons & quiz (admin side) — 2026-10-21
**Rule:** every course/training the admin creates in TRC → Training now has an **audience**:
`general` (the existing free farmer "Seminar" courses — every course that existed before this
version is general) or `corps` (NYSC AGROALLIED SAED member training). Corps content is completely separate:
farmers never see it (`myCourses`, `completeCourse`, material download and the farmer `course_pct`
all filter to `audience = 'general'`), and NYSC AGROALLIED SAED members cannot use the farmer endpoints.

**DB (`001_init.sql` §22):** `courses.audience` (`general`|`corps`, default `general`, self-healing
check constraint); `course_lessons` (ordered; kind `video` link | `document` upload | `live` link + date);
`course_quiz_questions` + `course_quiz_options` (multiple choice, exactly one correct option).

**Admin API (all admin-only, `routes/rtc.js` → `trainingContentController.js`):**
`POST /rtc/admin/courses` takes `audience` (a NYSC AGROALLIED SAED course ignores material/link/schedule);
`GET /rtc/admin/courses?audience=general|corps|all` (adds lesson/question counts);
`GET /rtc/admin/courses/:id/content`; lessons: `POST|PUT|DELETE .../lessons[/:lessonId]`,
`POST .../lessons/:lessonId/move {direction:"up"|"down"}`, `GET /rtc/admin/lessons/:lessonId/file`;
quiz: `POST|PUT|DELETE .../questions[/:questionId]`. Lesson/question changes are serialised per
course (row lock) so positions stay unique and contiguous. Links must be http(s). **A NYSC AGROALLIED SAED course
can only be approved once it has at least one lesson and one quiz question.** The dashboard summary
gained `corpsApprovedCourses` / `corpsDraftCourses` (the general counts mean what they always did).

**Admin UI (`modules/admin-trc-department`):** audience switch on the course form (corps hides the
single-material / link / schedule fields), All/General/Corps filter, audience badge, lesson & question
counts, "Manage lessons & quiz" → `CorpsCourseEditor.jsx` (add/edit/delete/reorder lessons, document
download, question editor with 2–6 options, approve when ready). Dashboard shows corps cards.

**Also fixed:** a rejected upload (wrong type) or an oversized file used to come back as a vague 500
"Something went wrong"; it is now a clear 400 everywhere (`upload.js` `badFile`, multer errors in the
global handler). `apiUpload` accepts `{method}` (needed for PUT multipart). The corps registration
wizard's labels are now properly associated with their inputs.

**Verification (see the delivery note):** 23 API tests (phase 1 regression + phase 2) and 8 UI tests that
drive the real screens against the real backend/Postgres, on both an upgraded and a brand-new database.

**Still to build:** payment gate + gateway, corps-member learning screens (lessons, quiz taking, scores,
progress % = courses completed / total), batches + due date + admin "mark batch complete", certificate +
verify page + emails, NYSC export, CV upload (needs persistent storage), Referral tab for corpers.
Note for the learning phase: quiz attempts must snapshot answers (editing a question replaces its options).


## NYSC AGROALLIED SAED access-fee payments (phase 3, 2026-10-21)

See `docs/CHANGES_2026-10-21_phase3_payment_gate.md` for the full write-up.
In short: NYSC AGROALLIED SAED members pay a one-time fee (set by admin in TRC -> Corps, stored
in `finance_settings`) via Paystack, or an admin confirms by hand when Paystack
isn't connected. `confirmPayment()` is the only place a payment becomes "paid";
it also posts the income to Finance. Every endpoint that opens NYSC AGROALLIED SAED training
must sit behind `requireCorperPaid` (HTTP 402 `PAYMENT_REQUIRED`).


## Corps learning, quizzes and progress (phase 4, v27, 2026-10-21)

Full write-up: `docs/CHANGES_2026-10-21_phase4_learning.md`. Rules in short:

- **Dashboard % = courses completed / live NYSC AGROALLIED SAED courses** (live = `audience='corps' AND approved`). 5 courses ->
  each is 20%. Quiz score never changes it.
- **A course is complete when every lesson is marked done AND the quiz has been submitted at least once.**
  `corper_course_progress.completed_at` is set once and never cleared (later edits/deletes don't undo it).
- Unpaid/refunded members: every learning endpoint returns 402 `PAYMENT_REQUIRED`, and their progress doesn't
  count (kept; counts again if they pay again).
- **One place for the numbers:** `utils/corperLearning.js` (pure rules: percent, quiz lock, live-session rule,
  grading, shuffle) + `loadProgressRows()` in `corperLearningController.js` (the one SQL). Member dashboard,
  admin Corps -> Progress, and (phase 5) certificate + NYSC export must all use these, never their own maths.
- Decisions as switches: `RULES` in `utils/corperLearning.js` (lessons before quiz, live complete only after
  start, shuffle). Retakes are unlimited; correct answers + explanations show after submitting.
- Quiz is graded on the server only. Before submitting, the member gets question/option text only (no
  `isCorrect`, no explanation). `corper_quiz_answers` keeps a COPY of the question, the chosen answer and the
  correct answer, because editing a question replaces its option ids. lesson/question/option ids in the
  progress tables have no foreign keys on purpose.
- Double submit: `clientToken` (unique per member+course) makes repeated sends one attempt; all changes to a
  member's course progress lock their `corper_course_progress` row first.
- Honour system: videos and live sessions are on other sites, so "Mark complete" can't be verified. If NYSC
  needs proof of attendance, add admin-marked attendance for live sessions.
- Admin approving a NYSC AGROALLIED SAED course when members already have progress gets 409 `APPROVAL_IMPACT` and must
  resend with `confirmImpact: true` (the screen shows a confirm box). The error handler now passes
  `httpError(msg, status, clientCode, details)` through as `code` / `details`.
- Tests: `npm run test:unit -w backend` (no database) and `python3 backend/corps_learning_test.py` (live API).


## Corps certificates (v28)
TRC -> Corps now has Payments | Progress | **Batches** | **Members**. Batches: set a due date, then Mark batch complete to release certificates and email members. Members: filters and the NYSC .xlsx export. Public check page: `/verify-certificate`. Details: `docs/CHANGES_2026-10-21_phase4_batches_certificates.md`.

## v36 — your v35 (payments phases 3-4, late fees, Refund room) merged with the screen-usability pass

v36 is a three-way merge: v32 was the common base, v35 brought the payment work, and the usability work below was done on v32. Only six files were edited by both sides; each was merged by hand (see "How the merge was done"). Nothing from either side was dropped.

### Pull-down "Jump to" lists
Long screens that used to stack many panels/tables now show a pull-down list instead:
- `components/SectionDropdown.jsx` — the select control (optional pending-count badge per option).
- `components/SectionStack.jsx` — wraps `[{ key, label, badge?, hidden?, node }]`; shows one section at a time with a "Show all sections" option; one visible section renders with no dropdown. `urlKey` lets two stacks nest (`sec`, `sec2`); `defaultKey` picks the opening section.
- `components/DeptSectionNav.jsx` (card-grid pickers: Accounting, Requests, Maintenance, Purchasing, Positions) also shows a "Go to" dropdown once inside a section.
Used in: Admin home dashboard (cash flow, budget, transactions, approvals, department spending, expenses — the top tiles, Quick actions and Platform at a glance stay as they were), Analytics, Finance (Loans, Investments, Savings, Accounting dashboard and reports), Loan Office, Farmer Room (Declare & List, Savings, Rank, Dashboard), Farmer Savings, Investor Room, Unit Leader, Store (dashboard, receiving), Maintenance reports, TRC (Training, Research, Consultancy, Corps progress), Add Catalog.
Farmer Savings has two sections, "My savings" and "Farm shares"; the share-purchase card is under "Farm shares" (the e2e farmer tests pick it with `openFarmShares`). A share payment return (`?sharePayment=`) opens Farm shares automatically.
Admin → Login as a department is a dropdown + preview card + "Login as …" button.

### Back button
Cause: tabs/sections were plain React state, so they never changed the URL, and Back only walks URL history.
Fix: `hooks/useUrlState.js` keeps tab/section/sub-view in the query string (`?tab=accounting&section=budget`); every change is one history step; changing an outer key clears the inner ones. Used by every department/room `tab`, Accounting/Maintenance/Purchasing/Analytics `section`, TRC `corps`, Payments `view`/`sub`, the department Requests panel (`rtab`), the Refund room tabs and every Jump-to dropdown (`sec`/`sec2`).
Payment-return links (`?sharePayment`, `?investmentPayment`, `?corperPayment`) clear only their own parameter through the router, keep the tab, and use replace, so Back never replays a payment check.
Login As: the old "back trap" re-pushed the URL on every Back, so Back worked once and then went dead, and the router had already shown the previous page. It is replaced by a guard in `context/ActingAsContext.jsx`: Back/forward move through the department's own tabs normally and are only redirected (replace, before paint) when they would land outside the department page you entered. Exit clears the guard first. `setActingAs(name, homePath)` takes the department path.
Still in-memory (Back leaves the page): Buyer checkout steps and open detail/edit panels (viewing a farmer, editing a course).

### Readability and visibility
End of `index.css`: form controls inside `.dash-scope` default to dark text on white (zero specificity, so classes still win), option lists are dark on white, white/cream surfaces keep dark text, dark text classes (text-red-700/800, clay-*, canopy-700/900, harvest-600/800, ink-700/500/400, gray-400, amber-900) are remapped to light shades on the dark cards/page, and `.recharts-*` text is light on the dark cards. A `.card` is always dark inside `.dash-scope` even if it carries bg-red-50 etc. Chart colours were also set in Analytics, Attendance and Company growth.

### How the merge was done
Files only v35 changed (backend, payments, Refund room, PayPanel, late-fee UI, tests, docs) were taken as v35 wrote them. Files only the usability pass changed were taken as is. The six shared files:
- `FinanceDepartment.jsx` — my Investments dropdown + v35's new `onRecordOffline` on the Applications panel.
- `PaymentsWorkspace.jsx` — v35 moved the refund list to the Refund room, so the old inline refund list stays removed; `sub`/`view` use URL state.
- `InvestorRoom.jsx` — my dropdown around v35's new `PaymentLog` props (`onChanged`, `onError`), v35's PayPanel and return handling (now cleared through the router).
- `AdminHub.jsx`, `CorperRoom.jsx`, `FarmShareCard.jsx` — merged cleanly; v35's Refund-room quick action, corper payment notices and late-fee box are all kept.
Also: `RefundRoomPage.jsx` tabs use URL state; `e2e/tests/journeys.spec.js` selects "Farm shares" in the dropdown before the farmer share steps.


## v37 — naming and structure decisions (strictly requested by the owner)

See the table at the top of `README.md`. Implementation notes:
- **NYSC AGROALLIED SAED** replaces every visible NYSC / corps / corp-member label (frontend, API messages, emails, spreadsheet export and file name, charts via `utils/roleLabels.js`). Internal names (`corper` role, `/api/corpers`, `corper_*` tables, `audience = 'corps'`) are unchanged on purpose.
- **3EI Governance model** replaces "Federal"/"top to bottom" wording. `utils/governance.js` (frontend and backend) maps the stored top-rank value `Federal` to the label "3EI Governance"; `GovernanceApproval.jsx` is the renamed approval screen; the loan route guards still check the stored value, so permissions are untouched.
- **Processor profile removed.** No processor registration (the API refuses it), no Processor room or route (`/dashboard/processor` redirects to the buyer room). The buyer profile is shown as **Buyers/Processor**; Procurement assigns processing jobs to Buyers/Processor accounts (`GET /api/procurement/processors` now lists buyer accounts), who work them in the new **Processing jobs** tab of the Buyers/Processor room (`/api/processor/jobs` is open to the buyer role). The migration `backend/src/db/migrations/009_buyers_processor_profile.sql` converts any existing processor account into a Buyers/Processor account (idempotent).
- **Departments are internal.** Removed from the public Home stats and from the public logistics / service pages.
- `e2e` journeys and `backend/store_test.py` were updated for the above.


## v38 — merge of v37 with Phase 5 + Phase 8, processing to any buyer, admin management

- **Merge:** v37 (usability dropdowns, naming) + the Phase 8 (farmer NIN identity, unit locations) and Phase 5 (Paystack money-in, automatic payouts, bank accounts, late penalties) build. See `PHASE5-MONEY-FLOWS.md`, `PHASE8-FARMER-IDENTITY.md` and `HANDOVER.md`. Finance Department's Loans tab now lists Recommend / Verify / Approve plus a "Payouts & repayments" note (loans are paid out by Paystack on final approval); the Settlements tab is a note too (farmers are paid automatically).
- **Processing assignment:** Procurement can assign processing to any buyer account. A buyer is a buyer: no organization / individual or processor / consumer split.
- **Admins:** Admin is not on the Register page and the API refuses it. One **main admin** (the seeded one, flagged `users.is_main_admin`, unique in the database) adds and removes other admins from Admin -> Positions -> Admins. Promoting converts an existing account to admin and remembers the old role (`users.previous_role_type`); removing restores it, or locks the account if there was none. The person's sessions end on both changes. All other admins keep every other admin feature, including making department heads. The main admin cannot be removed or remove itself. Every change is written to the Positions history.

