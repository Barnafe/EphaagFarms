# Ephaag Farms — Full Project

One repo, two apps, run together with one install and one command — set up
as an npm workspace so you don't need two terminals.

```
ephaag-farms-project/
├── package.json  ← ties both apps together (npm workspaces)
├── frontend/     ← React app (Vite + Tailwind) — the actual website/dashboards
└── backend/      ← Express + PostgreSQL API — not yet connected to the frontend
```

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
Office (apply → Unit Leader recommend → Federal approve → Finance disburse
→ repayment → verify — both the farmer-facing screens and the admin
Finance Department screens), the full Buyer's Room (catalog, cart,
checkout, standing commitment, order history), and the full Store
Department (order-linked receiving, running inventory pool, low-stock
flagging, order audit against stock before allocation, allocation to a
distributor with transactional stock deduction, a durable stock movement
ledger, and restocking via the generic Requests approval workflow).

Everything else — Procurement, Processor, Transport, Investor, RTC
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

## v33: Phase 3 (corps access fee on live Paystack)
Corps payments now use the shared Paystack ledger, fee calculator and webhook; refunds are removed; the member ticks "non-refundable once paid"; manual confirmation asks Paystack first. See `docs/PHASE3-CORPS-FEE.md`.
