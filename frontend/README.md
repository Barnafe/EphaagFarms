# Ephaag Farms — Web Platform

Real, working React app (not a mockup) for the Ephaag Farms agricultural
value chain platform. Built module by module — see the status list below.

## Setup

```bash
npm install
npm run dev
```

Then open the local URL Vite prints (usually http://localhost:5173).

## Trying it out

This is a front-end-only build so far — there's no real backend yet, so
login is mocked:

- **Register** creates a mock account and logs you straight in.
- **Login (member)** lets you pick a role from a dropdown (this is a demo
  stand-in — the real system will read your role from your account).
- **Login (admin)** logs in as internal staff, landing on the Admin Hub.
- Several rooms (Farmer's Room, Loan Office, Transporter's Room) have a
  "Demo: view as" selector so you can see how the screen changes across
  ranks (Member → Federal) without needing multiple real accounts.

All data is mock data defined in each module's `mockData.js` — nothing
persists between page reloads yet. That comes with the real backend.

## Where things stand

**Built (real, working UI + logic):**
- The House — shell, auth, all 6 registration types, public site
- Farmer's Room, Loan Office
- Buyer's Room (catalog → cart → review → confirm order flow)
- Processor's Room, Transporter's Room (Driver view), Store Room (Distributor)
- Boys' Quarters (Investor) — plans, ROI, referrals, partner status
- Security Gate (Education/RTC) — seminars, courses, research, attendance flow
- Admin Hub + 6 departments: Procurement, Transport, Store, Finance, Maintenance,
  Production, RTC

**Not built yet:**
- Real backend/database (everything above is mock data + front-end logic)
- Real logo/video assets are wired in where provided; the homepage hero
  carousel is ready for 3 real video files (see `src/components/HeroCarousel.jsx`)

## Project structure

- `src/pages/` — public pages, auth pages, and the dashboard entry points
  for each role
- `src/modules/m{n}-{name}/` — each numbered "room" (Farmer's Room, Loan
  Office, etc.)
- `src/modules/admin-{name}-department/` — internal admin departments,
  reached via the Admin Hub, not the public registration roles
- `src/components/` — shared layout (Header, Footer, Layout) and the
  route guard
- `src/context/AuthContext.jsx` — mock auth, swap for real API calls later
- `src/utils/reference.js` — shared reference-ID generator (ORD-, LN-,
  INV-, SHP- prefixes) used across every trackable record
