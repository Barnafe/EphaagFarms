-- Phase 10 (Purchasing): required attachments, annual department budgets, stage roles.
-- Phase 11 (Production): livestock farms and harvests, farm costs, profit per harvest.
-- Safe to run on every boot.

-- ---------------- Phase 10 ----------------
ALTER TABLE supplier_quotations ADD COLUMN IF NOT EXISTS file_url TEXT;     -- stored file id (private 'purchasing' category)
ALTER TABLE supplier_quotations ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE supplier_invoices ADD COLUMN IF NOT EXISTS file_name TEXT;

ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS budget_exceeded BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS budget_override_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS budget_override_at TIMESTAMPTZ;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS budget_override_note TEXT;

-- Which stage role (Procurement, Finance, CEO or Main admin) took each step.
ALTER TABLE purchase_request_history ADD COLUMN IF NOT EXISTS actor_role TEXT;

ALTER TABLE purchase_requests DROP CONSTRAINT IF EXISTS purchase_requests_status_check;
ALTER TABLE purchase_requests ADD CONSTRAINT purchase_requests_status_check CHECK (status IN (
  'pending_approval', 'rejected', 'approved', 'sourcing',
  'budget_approval_pending', 'po_pending_approval', 'po_approved',
  'payment_pending', 'awaiting_delivery', 'delivered',
  'goods_disputed', 'goods_received',
  'invoice_verification', 'final_payment_pending',
  'completed', 'cancelled'));

-- A rejected purchase order must not block raising a corrected one: one LIVE order per request.
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_request_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_one_live_per_request ON purchase_orders (request_id) WHERE status <> 'rejected';

-- Finance sets one annual budget per department. low_notified_at / exhausted_notified_at make each alert fire once per level.
CREATE TABLE IF NOT EXISTS department_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INT NOT NULL,
  department TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  warn_at_percent INT NOT NULL DEFAULT 80 CHECK (warn_at_percent BETWEEN 1 AND 100),
  set_by UUID REFERENCES users(id) ON DELETE SET NULL,
  low_notified_at TIMESTAMPTZ,
  exhausted_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year, department)
);

-- ---------------- Phase 11 ----------------
-- A company farm is either a crop farm or a livestock farm (kept simple: livestock harvests only, like crops).
ALTER TABLE company_farms ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'crop';
ALTER TABLE company_farms DROP CONSTRAINT IF EXISTS company_farms_kind_check;
ALTER TABLE company_farms ADD CONSTRAINT company_farms_kind_check CHECK (kind IN ('crop','livestock'));

-- What a harvest was worth (NGN), filled in when known, so profit per harvest is visible.
ALTER TABLE harvest_logs ADD COLUMN IF NOT EXISTS revenue NUMERIC(14,2) CHECK (revenue IS NULL OR revenue >= 0);

-- Costs per farm: inputs, labour and other. A cost can be charged to one harvest or left as a general farm cost.
CREATE TABLE IF NOT EXISTS farm_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES company_farms(id) ON DELETE CASCADE,
  harvest_id UUID REFERENCES harvest_logs(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('inputs','labour','other')),
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  incurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS farm_costs_farm_idx ON farm_costs (farm_id, incurred_on DESC);
CREATE INDEX IF NOT EXISTS farm_costs_harvest_idx ON farm_costs (harvest_id);
