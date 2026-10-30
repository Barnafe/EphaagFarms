# Ephaag Farms — Full Project

One repo, two apps, run together with one install and one command — set up
as an npm workspace so you don't need two terminals.

```
ephaag-farms-project/
├── package.json  ← ties both apps together (npm workspaces)
├── frontend/     ← React app (Vite + Tailwind) — the actual website/dashboards
└── backend/      ← Express + PostgreSQL API — not yet connected to the frontend
```

## v38 notes

v38 merges v37 with the Phase 5 (money flows) and Phase 8 (farmer identity) build. Two owner-requested changes sit on top: processing can be assigned to **any buyer account**, and **Admin is no longer a registration choice**: the seeded admin is the main admin and the only one who adds or removes other admins (Admin -> Positions -> Admins). See `docs/HANDOVER.md`.

## Naming and structure decisions — strictly requested by the owner (v37)

These changes were **explicitly and strictly requested by the owner** of Ephaag Farms. They are deliberate product decisions, not accidents or clean-ups — **please do not revert them or bring the old names back** when editing the system.

| # | Old | New (what people now see) |
|---|-----|---------------------------|
| 1 | NYSC / "Corps" / "Corp member" / "Corper" | **NYSC AGROALLIED SAED** — it serves as the SAED training centre for agro-allied work. Used for the registration option, the login switch, the member's room and certificate flow, the TRC tab, payments, emails, exports and charts. |
| 2 | "Federal" governance / "top to bottom" tiers | **3EI Governance model** — our own governance structure, not a copy of the federal government. The top rank is shown as **"3EI Governance"** (loan final approval, positions, rank cards, analytics). Names only — how the system works did not change. |
| 3 | A separate **Processor** profile + a **Buyer** profile | **One profile: "Buyers/Processor".** The Processor profile no longer exists (no separate sign-up, room or login). Procurement assigns processing jobs to Buyers/Processor accounts, who work them under **Processing jobs** in their room. Old processor accounts were converted automatically. |
| 4 | Departments shown on the public home page | The company's departments are **internal only**. The public site no longer mentions or counts them (home page and the public logistics/service pages). |
| 5 | — | This note, so everyone knows the above were requested. |

**What was deliberately left alone, so nothing breaks.** Only the *names people read* changed. These internal identifiers are unchanged on purpose: database values and tables (role `corper`, rank value `Federal`, `corper_*` tables, `processor_jobs`), web and API addresses (`/dashboard/corper`, `/api/corpers`, `/api/processor/jobs`), the `processor` value kept in the database role check for old records, certificate numbers already issued (`EPH-NYSC-…`), and the NYSC logo image on certificates. Where a name is shown to a user it goes through one place: `frontend/src/utils/governance.js` and `frontend/src/utils/roleLabels.js` (and `backend/src/utils/governance.js`), so a future rename is a one-line change.

Older dated notes in `docs/` (for example `docs/CHANGES_*.md`) keep the names that were used at the time they were written.

## One-time setup

From the **root** folder (`ephaag-farms-project/`, not inside frontend or backend):

```bash
npm install
```

This installs both apps' dependencies in one go.

Then set up the backend's database connection:
```bash
cd backend
cp .env.example .env
```
Open `.env` and fill in `DATABASE_URL` (your PostgreSQL connection string) and
`JWT_SECRET` (any long random string). You'll need PostgreSQL installed and a
database created first — see `backend/README.md` if you haven't done this yet.

Then, from the **root** folder again, create the database tables:
```bash
npm run migrate
```

Seed the standardized crop prices (needed for the Buyer's Room catalog):
```bash
npm run seed:prices
```

Create an admin login (admin has no public registration form):
```bash
npm run seed:admin -- --email you@ephaagfarms.com --password change-this --name "Your Name"
```

## Running both together

From the **root** folder:

```bash
npm run dev
```

That's it — one terminal, one command. You'll see backend logs (blue) and
frontend logs (green) interleaved in the same window:

- Backend API: `http://localhost:4000`
- Frontend site: `http://localhost:5173`

Press `Ctrl+C` once to stop both.

## Current state

Real, working, and connected end-to-end (tested against a live database,
not just built): authentication, the full Farmer's Room, the full Loan
Office (apply → Unit Leader recommend → 3EI Governance approve → Finance disburse
→ repayment → verify — both the farmer-facing screens and the admin
Finance Department screens), the full Buyer's Room (catalog, cart,
checkout, standing commitment, order history), and the full Store
Department (order-linked receiving, running inventory pool, low-stock
flagging, order audit against stock before allocation, allocation to a
distributor with transactional stock deduction, a durable stock movement
ledger, and restocking via the generic Requests approval workflow).

Everything else — Procurement, Transport, Investor, RTC
content publishing, payments, file uploads — still runs on the module's own
`mockData.js` and hasn't been wired to the backend yet. That's the next
phase of work.

Each app also has its own README with more detail if you ever need to run
just one on its own (`frontend/README.md`, `backend/README.md`).

## Deploying

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for step-by-step instructions to
put this live on Render (free tier) with a Neon Postgres database —
useful for watching the app run for real instead of in a terminal while
you keep building.

## v29: foundations (step 1 of the gap-closing plan)
New: login protection, email/SMS queue (Amazon SES + SMS adapter), scheduled-job runner, permanent file storage (Cloudflare R2), one-command test suite and CI. Read `docs/FOUNDATIONS-CHANGES.md` for what changed and `docs/TESTING.md` for how to test. New environment variables are listed at the bottom of `backend/.env.example`. Run `npm install` again (new packages: bcrypt, helmet, express-rate-limit, AWS SDK, file-type).

## v32: Phase 2 (farmer shares payment) and deployment setup
Farmer share purchases now go through Paystack and the shared payment ledger (`docs/PHASE2-FARMER-SHARES.md`). Deployment is set up end to end: `DEPLOYMENT.md` (step by step, with a go-live checklist), `render.yaml` (every variable), a `Dockerfile` for other hosts, and `npm run preflight`, which checks your configuration before you go live and is also printed when the server boots in production.

## v33: Phase 3 (NYSC AGROALLIED SAED access fee on live Paystack)
NYSC AGROALLIED SAED payments now use the shared Paystack ledger, fee calculator and webhook; refunds are removed; the member ticks "non-refundable once paid"; manual confirmation asks Paystack first. See `docs/PHASE3-CORPS-FEE.md`.
