-- Ephaag Farms — initial schema
-- Run via `npm run migrate` (see src/db/migrate.js)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- Core identity
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role_type TEXT NOT NULL CHECK (role_type IN
    ('farmer','buyer','processor','transporter','distributor','investor','admin')),
  sex TEXT CHECK (sex IN ('male', 'female')),
  photo_url TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  state TEXT,
  lga TEXT,
  ward TEXT,
  unit TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Self-healing for databases created before these columns existed —
-- CREATE TABLE IF NOT EXISTS above is a no-op against an existing older
-- table, so without this, a pre-existing `users` table would silently be
-- missing sex/photo_url/email_verified and every INSERT referencing them
-- would fail at runtime. Safe to run repeatedly; each ADD COLUMN is a
-- no-op once the column exists.
ALTER TABLE users ADD COLUMN IF NOT EXISTS sex TEXT CHECK (sex IN ('male', 'female'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
-- Head-of-Department assignment (2026-08-13) — set by main admin only, via
-- the new Positions tool; a department name (Production/Procurement/
-- Transport/Store/Finance/Maintenance/TRC) or NULL. Only relevant for
-- role_type='admin' users, but not constrained to that at the DB level
-- (the controller enforces it) to keep the column simple.
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_head_of TEXT;
-- Email is no longer a hard requirement (see farmer registration wizard —
-- NIN/email/phone must never block someone from registering). A pre-existing
-- DB would still have the old NOT NULL, so drop it explicitly. Postgres
-- allows multiple NULLs in a UNIQUE column, so uniqueness still holds for
-- everyone who does have an email.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Email/SMS OTP codes issued during registration (account-creation
-- verification) — code is stored hashed, never in plaintext.
CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Forgot-password reset tokens, hashed at rest, single-use, short-lived.
CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the Farmer network carries the Federal/State/LGA/Ward/Unit rank
-- hierarchy — every other role is flat, so no ranks table for them.
CREATE TABLE IF NOT EXISTS farmer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank TEXT NOT NULL DEFAULT 'Member' CHECK (rank IN
    ('Member','Unit Leader','Ward Leader','LGA Coordinator','State Coordinator','Federal')),
  crops TEXT[] NOT NULL DEFAULT '{}',
  attendance_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  course_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  -- Section A: personal details (registration wizard, Phase 3)
  marital_status TEXT CHECK (marital_status IN ('single','married','divorced','widowed')),
  date_of_birth DATE,
  id_type TEXT,
  id_number TEXT,
  home_address TEXT,
  nationality TEXT DEFAULT 'Nigerian',
  -- Section B: farming details
  farm_type TEXT CHECK (farm_type IN ('livestock','crop_production','livestock_and_crops')),
  farm_size TEXT CHECK (farm_size IN ('0-1_hectares','2-4_hectares','5plus_hectares')),
  years_experience TEXT CHECK (years_experience IN ('1-5','6-10','11plus')),
  keeps_inventory_records BOOLEAN,
  annual_farm_income TEXT CHECK (annual_farm_income IN ('50k-100k','100k-400k','500k-1m','1mplus')),
  -- Section C: additional income (work / business / both) — the specific
  -- sub-fields differ per type, so kept as one flexible JSONB blob rather
  -- than a wide sparse set of columns.
  additional_income_type TEXT CHECK (additional_income_type IN ('work','business','both')),
  additional_income JSONB
);

-- Self-healing for DBs from before the Phase 3 registration wizard —
-- CREATE TABLE IF NOT EXISTS above is a no-op against an existing
-- farmer_profiles table, so without this, every INSERT referencing these
-- new columns would fail at runtime against an older local DB.
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS marital_status TEXT CHECK (marital_status IN ('single','married','divorced','widowed'));
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS id_type TEXT;
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS id_number TEXT;
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS home_address TEXT;
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS nationality TEXT DEFAULT 'Nigerian';
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS farm_type TEXT CHECK (farm_type IN ('livestock','crop_production','livestock_and_crops'));
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS farm_size TEXT CHECK (farm_size IN ('0-1_hectares','2-4_hectares','5plus_hectares'));
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS years_experience TEXT CHECK (years_experience IN ('1-5','6-10','11plus'));
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS keeps_inventory_records BOOLEAN;
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS annual_farm_income TEXT CHECK (annual_farm_income IN ('50k-100k','100k-400k','500k-1m','1mplus'));
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS additional_income_type TEXT CHECK (additional_income_type IN ('work','business','both'));
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS additional_income JSONB;

CREATE TABLE IF NOT EXISTS buyer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_type TEXT NOT NULL DEFAULT 'individual' CHECK (buyer_type IN ('individual','organization')),
  company_doc_url TEXT,
  organization_name TEXT,
  registered_address TEXT,
  standing_commitment_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  standing_commitment_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  standing_commitment_years INT
);

-- Self-healing: buyer_type used to only allow 'company' — renamed to
-- 'organization' (also now covers what used to be listed separately as
-- government). A database from before this round would reject the new
-- value without this.
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS organization_name TEXT;
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS registered_address TEXT;
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS contact_person_name TEXT;
ALTER TABLE buyer_profiles DROP CONSTRAINT IF EXISTS buyer_profiles_buyer_type_check;
UPDATE buyer_profiles SET buyer_type = 'organization' WHERE buyer_type = 'company';
ALTER TABLE buyer_profiles ADD CONSTRAINT buyer_profiles_buyer_type_check
  CHECK (buyer_type IN ('individual','organization'));

-- 2026-09-01 spec: individual buyers give a delivery address at
-- registration (delivery location matters enough to collect upfront, not
-- just at checkout). The CAC/registration-document upload for organization
-- buyers was dropped from registration per the same spec — company_doc_url
-- is left in place (harmless, unused) rather than dropped, in case
-- document upload comes back later.
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS address TEXT;

-- Personal savings (Farmer's Room) — OLD placeholder model (min ₦25,000,
-- open-ended duration, 8% flat) kept only so a pre-existing DB doesn't
-- break; no longer written to by the app. Superseded 2026-08-09 by the
-- real monthly two-account model below (savings_deposits/savings_withdrawals),
-- per the user's detailed spec — see [[ephaag-farms-farmer-room-specs]] memory.
CREATE TABLE IF NOT EXISTS savings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  duration_years INT NOT NULL,
  interest_rate NUMERIC(5,2) NOT NULL DEFAULT 8.00,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  maturity_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','matured','paid_out')),
  paid_out_at TIMESTAMPTZ
);

-- Real monthly savings model (2026-08-09 spec): every deposit auto-splits
-- ₦500 to insurance + remainder to main. Deposit window is 1st-5th of the
-- month (enforced in the controller, not the DB, since "today" needs to be
-- evaluated at insert time). CHECK enforces the "must end in 500" rule at
-- the DB level too, as defense in depth for money math.
CREATE TABLE IF NOT EXISTS savings_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 2500 AND amount::bigint % 500 = 0),
  insurance_portion NUMERIC(12,2) NOT NULL DEFAULT 500,
  main_portion NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insurance-account funds are only ever moved by the company (admin creates
-- an already-'paid' row directly); main-account withdrawals are farmer-
-- requested then Finance-approved, since the spec's "due date" for main
-- withdrawals was never pinned down to an exact rule — see memory file.
CREATE TABLE IF NOT EXISTS savings_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_type TEXT NOT NULL CHECK (account_type IN ('main','insurance')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','paid','declined')),
  note TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_at TIMESTAMPTZ,
  handled_by UUID REFERENCES users(id)
);

-- Farmer feedback / concerns, submitted directly to admin.
CREATE TABLE IF NOT EXISTS farmer_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('challenge','maltreatment','suspicious_activity','recommendation','other')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS investor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  occupation TEXT,
  referral_code TEXT UNIQUE NOT NULL,
  referred_by_code TEXT,
  partner_status TEXT NOT NULL DEFAULT 'none' CHECK (partner_status IN ('none','pending','approved'))
);

-- Farmer's Room "List product" — a farmer's own for-sale listings (their
-- own asking price/quantity, distinct from the company's standard_prices
-- buyers see in the catalog).
CREATE TABLE IF NOT EXISTS farmer_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('kg','tons','bags','tubers','crates','baskets')),
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','sold_out')),
  -- annual_declared_quantity/declaration_year (2026-08-11) are now DEPRECATED —
  -- the user clarified 2026-08-12 that declaring and listing are two
  -- different actions with two different forms, not one merged form.
  -- Columns kept (self-heal is additive-only, never drops real columns)
  -- but nothing writes to them anymore — see farmer_declarations below,
  -- which is where declarations live now.
  annual_declared_quantity NUMERIC(12,2),
  declaration_year INT NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE farmer_products ADD COLUMN IF NOT EXISTS annual_declared_quantity NUMERIC(12,2);
ALTER TABLE farmer_products ADD COLUMN IF NOT EXISTS declaration_year INT NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int;

-- Produce declarations (2026-08-12: split out from farmer_products —
-- declaring what you've harvested and listing it for sale are two
-- different actions on two different schedules, not one form). Crop is
-- validated server-side against the farmer's own farmer_profiles.crops
-- list at write time — never trust the client dropdown alone, per the
-- user's explicit "avoid confusion, admin needs correct data" concern.
CREATE TABLE IF NOT EXISTS farmer_declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  crop TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('kg','tons','bags','tubers','crates','baskets')),
  declaration_year INT NOT NULL DEFAULT EXTRACT(YEAR FROM now())::int,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Coordinator rank changes always go through Federal committee → CEO →
-- tech team, per the business rules — this table is the audit trail.
CREATE TABLE IF NOT EXISTS coordinator_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank TEXT NOT NULL,
  jurisdiction TEXT,
  approved_by TEXT,
  document_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Loans (Loan Office)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  farmer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  loan_type TEXT NOT NULL CHECK (loan_type IN ('aided','boost_cash','business_fast_cash')),
  interest_rate NUMERIC(5,2),
  amount NUMERIC(14,2) NOT NULL,
  repayment_months INTEGER,
  reason TEXT,
  deposit_required NUMERIC(14,2),
  deposit_paid_at TIMESTAMPTZ,
  deposit_verified BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','recommended','rejected','approved','disbursed')),
  recommended_by UUID REFERENCES users(id),
  rejection_reason TEXT,
  reapply_after DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Self-heal for pre-Phase-3 DBs: old loan_type values were 'aid'/'interest'.
-- Existing rows are remapped so the new CHECK constraint doesn't orphan them.
ALTER TABLE loans ADD COLUMN IF NOT EXISTS repayment_months INTEGER;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS deposit_required NUMERIC(14,2);
ALTER TABLE loans ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS deposit_verified BOOLEAN NOT NULL DEFAULT FALSE;
-- 2026-08-29: for 'aided' loans, `amount` is the actual disbursed amount
-- (2x what was requested) — this keeps the original ask on record too, for
-- the same dispute-defense reason the rest of this table is audited.
ALTER TABLE loans ADD COLUMN IF NOT EXISTS requested_amount NUMERIC(14,2);
ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_loan_type_check;
UPDATE loans SET loan_type = 'aided' WHERE loan_type = 'aid';
UPDATE loans SET loan_type = 'business_fast_cash' WHERE loan_type = 'interest';
ALTER TABLE loans ADD CONSTRAINT loans_loan_type_check CHECK (loan_type IN ('aided','boost_cash','business_fast_cash'));

CREATE TABLE IF NOT EXISTS loan_repayments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  method TEXT,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  verified BOOLEAN NOT NULL DEFAULT FALSE
);

-- Loan approval workflow v2 (2026-08-11 spec): inserts a Finance
-- verification stage between Unit Leader recommendation and Federal final
-- approval. pending -> recommended -> finance_verified -> approved ->
-- disbursed (rejected reachable from pending/recommended/finance_verified).
ALTER TABLE loans DROP CONSTRAINT IF EXISTS loans_status_check;
ALTER TABLE loans ADD CONSTRAINT loans_status_check CHECK (status IN
  ('pending','recommended','finance_verified','rejected','approved','disbursed'));
-- Boost Cash's deposit_required/deposit_paid_at/deposit_verified columns
-- on `loans` are now populated automatically FROM the linked
-- boost_cash_deposits row at application time (see below) rather than
-- being farmer-submitted after approval — kept as-is on `loans` since the
-- existing disbursement gate (`deposit_verified`) still reads them.

-- Boost Cash 25% deposit — now made and verified BEFORE a loan application
-- even exists (corrected 2026-08-11; originally built post-approval, see
-- [[ephaag-farms-farmer-room-specs]] memory for the full history). A
-- farmer declares an intended borrow amount, pays 25% of it, Finance
-- verifies, then — starting 1 month after verification — the farmer can
-- apply, consuming this deposit (one deposit funds exactly one loan).
CREATE TABLE IF NOT EXISTS boost_cash_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  intended_loan_amount NUMERIC(14,2) NOT NULL,
  deposit_amount NUMERIC(14,2) NOT NULL,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id),
  used_for_loan_id UUID REFERENCES loans(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutable audit trail for every loan status transition — explicit hard
-- requirement (user: "otherwise it will be a failed system if someone
-- falsefully claim something and if we cannot get clear data to defend").
-- Never updated or deleted, only appended to.
CREATE TABLE IF NOT EXISTS loan_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id UUID REFERENCES users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stored quarterly snapshots of the grading indices (2026-08-11 spec: the
-- system must store computed results, not just show a live number, so
-- admin can view/verify history). One row per farmer per calendar quarter
-- (quarters end Mar/Jun/Sep/Dec, per the user's own framing), upserted in
-- real time every time a relevant event happens (deposit, verified
-- repayment, attendance mark) — see indicesEngine.js.
CREATE TABLE IF NOT EXISTS farmer_index_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quarter_start DATE NOT NULL,
  savings_points NUMERIC(5,2) NOT NULL DEFAULT 0,
  repayment_points NUMERIC(5,2) NOT NULL DEFAULT 0,
  training_points NUMERIC(5,2) NOT NULL DEFAULT 0,
  funds_utilization_points NUMERIC(5,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (farmer_id, quarter_start)
);

-- Farmer investment shares — "Buy Share" (2026-08-13 spec, REWORKED
-- 2026-08-29 to explicitly reuse "the same investment terms and conditions
-- for ephaag" as the general Investor module, not the old
-- self-contained 1-5yr/20-45% schedule): a DIFFERENT product from the
-- Investor-role Monthly/Bulk plans (see investment_applications above),
-- but now uses the SAME linear ROI structure as the Investor Monthly plan
-- (10/20/30/40/50% cumulative over yrs 1-5, which is exactly 10%/year of
-- capital, simple not compound — see BUY_SHARE_ANNUAL_ROI_PCT in
-- farmerSharesController.js). Fixed ₦25,000 per share, ALWAYS a 5-year
-- capital lock (no more farmer-chosen term), interest on capital only is
-- withdrawable once per completed year starting after year 1. No payment
-- gateway is integrated yet (Paystack/Flutterwave planned) so purchase is
-- recorded as immediately active, same MVP pattern as loan
-- disbursement/order payment elsewhere.
CREATE TABLE IF NOT EXISTS farmer_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  farmer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 25000,
  duration_years INT NOT NULL CHECK (duration_years BETWEEN 1 AND 5),
  roi_pct NUMERIC(5,2) NOT NULL,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','renewed')),
  renewed_from_id UUID REFERENCES farmer_shares(id)
);

-- 2026-08-29 additive columns for the reworked model. `duration_years`
-- is now always 5 and `expires_at` is now the capital-unlock date
-- (kept, still meaningful); `roi_pct` is now always the flat annual rate.
-- `capital_withdrawn_at` is new; 'expired'/'renewed' statuses are retired
-- in favor of 'capital_withdrawn' but kept in the CHECK for old rows.
ALTER TABLE farmer_shares ADD COLUMN IF NOT EXISTS capital_withdrawn_at TIMESTAMPTZ;
ALTER TABLE farmer_shares DROP CONSTRAINT IF EXISTS farmer_shares_status_check;
ALTER TABLE farmer_shares ADD CONSTRAINT farmer_shares_status_check
  CHECK (status IN ('active','expired','renewed','capital_withdrawn'));

-- Annual interest withdrawals against a share's capital — "interest will
-- only and always be calculated base on the capital. Whether user didn't
-- withdraw the interest for the whole 5yrs, no other interest come from
-- interest" — i.e. simple interest, one entry per (share, year_number),
-- never compounding, never recalculated off a prior withdrawal.
CREATE TABLE IF NOT EXISTS share_interest_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL REFERENCES farmer_shares(id) ON DELETE CASCADE,
  year_number INT NOT NULL CHECK (year_number BETWEEN 1 AND 5),
  amount NUMERIC(12,2) NOT NULL,
  withdrawn_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (share_id, year_number)
);

-- Cross-department request/approval audit trail note: `coordinator_appointments`
-- (defined earlier in this file, near `loans`) was already in the schema
-- unused before the promotion tool started writing to it — reused as-is,
-- no new table needed.

-- ---------------------------------------------------------------------
-- Cross-department request/approval workflow (2026-08-12) — a generic,
-- paperless, SharePoint-style routing system any admin department can use:
-- the requester builds a chain of approvers (e.g. "Finance Head" ->
-- "Transport Head"), each approves in order, then an Admin final-approval
-- step is always auto-appended last. Requester can print the request with
-- its full approval trail once decided. Deliberately generic — not tied
-- to any one department's data model, since the user wants every
-- department (Transport/Procurement/Finance/Maintenance/Store/Production/
-- TRC) wired the same way.
CREATE TABLE IF NOT EXISTS department_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  attachment_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE department_requests ADD COLUMN IF NOT EXISTS attachment_url TEXT;

-- Steps are approved strictly in step_order; a step's approver_id is a
-- specific admin user chosen by the requester ("head of the department"),
-- except the always-final step which has approver_id NULL, meaning any
-- admin can act on it — that's the "then admin last approval" stage.
CREATE TABLE IF NOT EXISTS request_approval_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES department_requests(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  approver_id UUID REFERENCES users(id),
  label TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','skipped')),
  decided_by UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  note TEXT,
  UNIQUE (request_id, step_order)
);

-- ---------------------------------------------------------------------
-- Orders (Buyer's Room → Procurement → Processor → Store → Transport)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS standard_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop TEXT UNIQUE NOT NULL,
  unit TEXT NOT NULL,
  price NUMERIC(14,2) NOT NULL,
  last_reviewed DATE
);

-- 2026-08-30: split into two prices, per explicit spec — "the price the
-- farmers see from their portal should be different from the price buyers
-- see... company buys it and sets their own selling price." `buy_price` is
-- what a farmer is paid (farmer-visible only); `sell_price` is what a buyer
-- pays (buyer-visible only, drives order costing). The old single `price`
-- column is kept (unused by new code) rather than dropped, per the no-drop
-- convention — and both new columns backfill FROM it so existing catalog
-- data doesn't go blank on upgrade; a real margin then needs setting via
-- the new admin price editor (financeController.js) since `price` alone
-- can't tell us what that margin should be.
ALTER TABLE standard_prices ADD COLUMN IF NOT EXISTS buy_price NUMERIC(14,2);
ALTER TABLE standard_prices ADD COLUMN IF NOT EXISTS sell_price NUMERIC(14,2);
UPDATE standard_prices SET buy_price = price WHERE buy_price IS NULL;
UPDATE standard_prices SET sell_price = price WHERE sell_price IS NULL;

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivery_location TEXT NOT NULL,
  total NUMERIC(14,2) NOT NULL,
  paid_via TEXT NOT NULL DEFAULT 'upfront' CHECK (paid_via IN ('upfront','balance')),
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN
    ('paid','payment_confirmed','sourcing','processing','allocated','in_transit','delivered')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2026-09-01 spec: shopping-style checkout collects two contact numbers
-- and an email alongside the delivery address, so whoever's coordinating
-- delivery has a backup contact. Nullable at the DB level (self-healing
-- convention) — required-ness is enforced in orderController instead.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_phone_1 TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_phone_2 TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS contact_email TEXT;

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  crop TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  unit TEXT NOT NULL,
  size TEXT,
  line_total NUMERIC(14,2) NOT NULL
);

-- Which farmer(s) fulfilled which order (an order can be split)
CREATE TABLE IF NOT EXISTS order_sourcing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  farmer_id UUID NOT NULL REFERENCES users(id),
  notified_rep TEXT
);

-- 2026-08-29: sourcing now consumes a specific listing/quantity, not just a
-- farmer name — needed so purchases can deduct against the farmer's
-- declared-inventory balance (see farmerController.declaredBalanceForCrop).
ALTER TABLE order_sourcing ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES farmer_products(id);
ALTER TABLE order_sourcing ADD COLUMN IF NOT EXISTS crop TEXT;
ALTER TABLE order_sourcing ADD COLUMN IF NOT EXISTS quantity_sourced NUMERIC(12,2);

CREATE TABLE IF NOT EXISTS processor_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  processor_id UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','processing','complete')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS distributor_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  distributor_id UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','confirmed'))
);

CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  driver_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','en_route','delivered')),
  proof_of_delivery_url TEXT
);

-- Farmer/processor/transporter payouts + buyer payment confirmation —
-- all Finance Department actions
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payee_type TEXT NOT NULL CHECK (payee_type IN ('farmer','processor','transporter')),
  payee_id UUID REFERENCES users(id),
  amount NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid'))
);

-- ---------------------------------------------------------------------
-- Investment (Boys' Quarters + Finance Dept "Investments" tab)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS investment_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  investor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('monthly','bulk')),
  amount NUMERIC(14,2) NOT NULL,
  duration_years INT NOT NULL,
  payment_mode TEXT NOT NULL DEFAULT 'auto' CHECK (payment_mode IN ('auto','manual')),
  agreement_file_url TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN
    ('submitted','agreement_pending','agreement_review','active','rejected'))
);

CREATE TABLE IF NOT EXISTS investment_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES investment_applications(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  due_date DATE,
  paid_date DATE,
  reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'due' CHECK (status IN ('due','on_time','late','missed'))
);

-- Self-healing for the same reason as the users block above — these two
-- tables were created early in the investor module, then agreement_review/
-- agreement_file_url/reminder_sent/'due' status were added in a later
-- correction round. A database from before that correction would still be
-- missing them without this.
ALTER TABLE investment_applications ADD COLUMN IF NOT EXISTS agreement_file_url TEXT;
ALTER TABLE investment_applications DROP CONSTRAINT IF EXISTS investment_applications_status_check;
ALTER TABLE investment_applications ADD CONSTRAINT investment_applications_status_check
  CHECK (status IN ('submitted','agreement_pending','agreement_review','active','rejected'));

ALTER TABLE investment_payments ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE investment_payments ALTER COLUMN status SET DEFAULT 'due';
ALTER TABLE investment_payments DROP CONSTRAINT IF EXISTS investment_payments_status_check;
ALTER TABLE investment_payments ADD CONSTRAINT investment_payments_status_check
  CHECK (status IN ('due','on_time','late','missed'));

CREATE TABLE IF NOT EXISTS roi_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id UUID NOT NULL REFERENCES investment_applications(id) ON DELETE CASCADE,
  year_number INT NOT NULL,
  roi_percent NUMERIC(5,2) NOT NULL,
  roi_amount NUMERIC(14,2) NOT NULL,
  penalty_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  net_payout NUMERIC(14,2) NOT NULL,
  admin_approved BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_investor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bonus_percent NUMERIC(5,3) NOT NULL DEFAULT 0.005
);

-- ---------------------------------------------------------------------
-- RTC — Research, Training & Consultancy (Module 10)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS seminars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  event_date DATE NOT NULL,
  location TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seminar_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seminar_id UUID NOT NULL REFERENCES seminars(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attended BOOLEAN NOT NULL DEFAULT FALSE,
  sheet_file_url TEXT,
  marked_by UUID REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS course_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS consultancy_offerings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Self-healing: seminars/courses/consultancy_offerings all pre-date this
-- round's admin-publish build and never had created_at (needed for
-- newest-first sorting). Same class of gotcha as the users/investment
-- self-heals above — see READ FIRST.
ALTER TABLE seminars ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE courses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE consultancy_offerings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS course_progress_course_user_uq ON course_progress (course_id, user_id);

-- Consultancy requests — a farmer applying for a direct one-on-one
-- session, tied to a published consultancy offering. Must come after
-- consultancy_offerings above (foreign key) — this table used to sit
-- earlier in the file, before consultancy_offerings existed yet, which
-- broke migration on a fresh database. Caught and fixed by testing the
-- migration against a truly empty database, not just an old one.
CREATE TABLE IF NOT EXISTS consultancy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offering_id UUID NOT NULL REFERENCES consultancy_offerings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','scheduled','completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Production (company-owned farms) + Maintenance
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS company_farms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  state TEXT,
  crop TEXT,
  size_hectares NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','fallow'))
);

CREATE TABLE IF NOT EXISTS harvest_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES company_farms(id) ON DELETE CASCADE,
  crop TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  unit TEXT NOT NULL,
  harvested_at DATE NOT NULL DEFAULT CURRENT_DATE
);

-- ---------------------------------------------------------------------
-- Store Department — Store's own running inventory pool, aggregated by
-- crop across every order ever received (NOT order-specific reservation).
-- `store_receipts` is the receiving-event ledger (one row per order_item,
-- Store's explicit "verified and stored it physically" action) that feeds
-- the pool; `store_inventory.quantity_on_hand` is the current derived
-- total, incremented on receipt and decremented on dispatch (see
-- storeController.js receiveOrder/allocate). Keeping both (event ledger +
-- running total) rather than only summing the ledger live lets dispatch
-- decrement independently of any one order's receipt, which is what makes
-- this a genuine shared pool instead of per-order tracking. Company-farm
-- harvests (harvest_logs above) are intended to feed this same pool once
-- Production is wired up.
CREATE TABLE IF NOT EXISTS store_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop TEXT UNIQUE NOT NULL,
  unit TEXT NOT NULL,
  quantity_on_hand NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reorder threshold per item, so the portal can flag "stock is low"
-- itself rather than someone having to watch numbers manually. Defaults
-- to 10 for any pre-existing rows.
ALTER TABLE store_inventory ADD COLUMN IF NOT EXISTS reorder_level NUMERIC(12,2) NOT NULL DEFAULT 10;

CREATE TABLE IF NOT EXISTS store_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID UNIQUE NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  crop TEXT NOT NULL,
  quantity_received NUMERIC(12,2) NOT NULL,
  unit TEXT NOT NULL,
  received_by UUID NOT NULL REFERENCES users(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Store Department audit trail — every physical stock change goes
-- through here, both inbound ("goods that comes, store verify and store
-- it physically and update the inventory") and outbound (an order
-- confirmed taken out of the store). Kept even though store_inventory
-- also holds the running total, so there's always a durable history of
-- who moved what and why — never just an in-place quantity update with
-- no trace (same principle as coordinator_appointments for HOD/rank
-- changes).
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crop TEXT NOT NULL,
  unit TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  quantity NUMERIC(12,2) NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('goods_received','order_allocated','adjustment')),
  order_id UUID REFERENCES orders(id),
  recorded_by UUID REFERENCES users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Store's audit of an order against physical/quality stock before it can
-- be allocated to a distributor ("store verify the quality against
-- available stock and be able to audit the order"). One row per order —
-- re-auditing (e.g. after a quality issue is fixed) upserts the same row
-- rather than piling up history, since only the current verdict controls
-- whether allocation is allowed.
CREATE TABLE IF NOT EXISTS order_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  verified BOOLEAN NOT NULL,
  note TEXT,
  audited_by UUID REFERENCES users(id),
  audited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maintenance_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'good' CHECK (status IN ('good','due','in_repair')),
  last_serviced DATE
);

-- 2026-09-02: farmer shares are no longer a fixed ₦25,000 product — a
-- farmer can buy a share for any amount from ₦2,500 upward (min enforced
-- in farmerSharesController.js, not here, since it can change without a
-- migration). Drop the old fixed default so it can't silently reapply on
-- a column that's meant to vary per purchase now.
ALTER TABLE farmer_shares ALTER COLUMN amount DROP DEFAULT;

-- 2026-09-02: the tiered rate schedule (10/30/35/40/45%) now stays flat
-- at 45% for every year after year 5 if a farmer leaves their share in
-- rather than withdrawing capital at the 5-year mark — so a share can
-- keep earning withdrawable yearly interest indefinitely past year 5.
-- The old CHECK capped year_number at 5, which would reject those later
-- withdrawals; widen it to any year 1+.
ALTER TABLE share_interest_withdrawals DROP CONSTRAINT IF EXISTS share_interest_withdrawals_year_number_check;
ALTER TABLE share_interest_withdrawals ADD CONSTRAINT share_interest_withdrawals_year_number_check
  CHECK (year_number >= 1);

-- RTC (Module 10) RENAMED 2026-09-02 to "Seminal" and narrowed to
-- training courses only, per explicit instruction: "this isn't gonna
-- contain consultancy and research anymore." research /
-- consultancy_offerings / consultancy_requests are kept (never dropped,
-- same non-destructive convention as the rest of this file) but are now
-- unused dead tables — rtcController.js no longer routes to them.
-- `seminars`/`seminar_attendance` are NOT part of that retirement:
-- they're a separate feature (physical seminar attendance-marking for
-- farmer leadership rank indices, see farmerController.js) that happens
-- to share this section of the file — left completely untouched.

-- Seminal content (2026-09-02) — this table used to be the plain,
-- always-free "Courses" list (title+description only). Now it's the
-- department's one and only content type: the company uploads a training
-- course with optional materials + an online hosting link, an admin
-- approves it, and only then do farmers see it and can attend/complete it.
-- Seminal additive columns. `approved` gates visibility to farmers — a
-- course is a draft the moment it's uploaded and only appears in
-- myCourses() once an admin approves it. `materials_url` is an optional
-- uploaded file (slides, PDF notes, etc — see uploadCourseMaterial in
-- middleware/upload.js), `online_link` is the optional hosting URL
-- farmers use to attend the course live, and `scheduled_at` is an
-- optional date/time for that live session; a course with no
-- `scheduled_at`/`online_link` is just self-paced materials+completion
-- tracking, same as the old plain-course model. Defaulting `approved` to
-- FALSE means every pre-existing course (which used to auto-publish with
-- no approval step at all) goes back to draft/unapproved on migration —
-- intentional, not a bug: the new business rule is that nothing reaches
-- farmers without an explicit approval, including old rows.
ALTER TABLE courses ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS materials_url TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS online_link TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
