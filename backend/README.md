# Ephaag Farms — Backend

Real Express + PostgreSQL API. This is the foundation piece — auth and the
full database schema are built and working; the rest of the API (loans,
orders, procurement, finance, RTC, etc.) gets wired up module by module next,
matching how the frontend was built.

## Setup

1. Install PostgreSQL locally (or use a hosted one — Supabase, Railway, Neon
   all work fine) and create a database:
   ```bash
   createdb ephaag_farms
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment template and fill in real values:
   ```bash
   cp .env.example .env
   ```
   At minimum, set `DATABASE_URL` to your Postgres connection string and
   `JWT_SECRET` to a long random string.

4. Run the migration to create all tables:
   ```bash
   npm run migrate
   ```

5. Start the server:
   ```bash
   npm run dev
   ```
   The API runs on `http://localhost:4000` by default.

## What's built so far

- **Full database schema** (`src/db/migrations/001_init.sql`) — every table
  needed across all 10 modules and 7 departments, matching the ERDs designed
  earlier: users + role profiles, loans, orders, processor jobs, distributor
  allocations, shipments, payments, investments, RTC content, company farms,
  maintenance assets, store inventory/receipts, stock movements, and order
  audits.
- **Authentication** — real registration (with role-specific profile rows
  created in the same transaction), login, password hashing (bcrypt), and
  JWT-based sessions.
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/auth/me` (requires `Authorization: Bearer <token>`)
- **Farmer's Room, Loan Office, and Buyer's Room** — fully wired, both the
  member-facing and admin sides (see the top-level README for what's covered).
- **Store Department** (`src/routes/store.js` + `src/controllers/storeController.js`)
  — company inventory end to end:
  - `GET /api/store/inventory` / `PATCH /api/store/inventory/:id/reorder-level`
    / `GET /api/store/movements` — running stock levels, editable low-stock
    reorder thresholds, and a durable in/out movement history.
  - `GET /api/store/receiving-queue` / `POST /api/store/orders/:id/receive`
    — processed orders awaiting physical receipt; the actual quantity
    received (not the order's original ask) is what enters the pool, one
    receipt per order item.
  - `GET /api/store/queue` — orders ready for allocation, each with a
    stock-sufficiency breakdown against the pool and its current audit
    verdict.
  - `POST /api/store/orders/:id/audit` — Store's pass/fail check against
    stock and quality; allocation is blocked until this passes.
  - `POST /api/store/orders/:id/allocate` — assigns a distributor, deducts
    the pool transactionally (never below zero), and logs the movement.
  - `GET /api/store/allocations/me` / `POST /api/store/allocations/:id/confirm`
    — the distributor's own confirm-pickup screen.
  - `POST /api/store/restock-requests` — low-stock restocking reuses the
    existing generic Requests approval workflow (`/api/requests`) rather
    than a separate system: tags Procurement/Finance HODs, Admin final
    approval is auto-appended, and the request can be printed once approved.
  - `backend/store_test.py` exercises the full flow end to end against a
    real database — receiving with shrinkage, audit gating, the allocation
    safety net against a secretly-insufficient pool, low-stock flagging,
    and the full restock approval chain.

## Not built yet

Procurement, Processor, Transport, Investor, RTC content publishing,
payments, and file uploads still need their frontend wired to whatever the
backend already supports (some of these controllers already exist — see the
route files under `src/routes/` for what's actually implemented versus
still pending). Store is fully wired end to end; it's the template to
follow for the rest.

## Connecting the frontend

Auth is already wired — the frontend's `AuthContext.jsx` calls these
endpoints directly. Each remaining department gets wired the same way as
its backend controllers land.
