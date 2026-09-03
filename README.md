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
