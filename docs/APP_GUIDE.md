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
- **Buyer** (`m4-buyer-room`) — a Jumia/Temu-style shopping flow: browse the
  product catalog (real photos when an admin has added one, an emoji icon
  fallback otherwise), add to cart, check out, track orders.
- **Processor** (`m6-processor-room`) — orders land here before moving to
  transport.
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
