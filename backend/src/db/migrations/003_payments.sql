-- Step 2 / Phase 1: gateway payments ledger (shared by orders, shares, corps,
-- investors, savings ... in later phases), flags, order history.

CREATE TABLE IF NOT EXISTS gateway_payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference        TEXT NOT NULL UNIQUE,
  type             TEXT NOT NULL,                 -- order | share | commitment | corps_fee | investment | consultancy | savings | repayment | boost_deposit
  user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  subject_id       UUID,                          -- the order / purchase / etc. this pays for
  net_amount       NUMERIC(14,2) NOT NULL,        -- what EPHAAG should receive (the listed price)
  fee_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_amount     NUMERIC(14,2) NOT NULL,        -- what the payer is charged (net + fee)
  currency         TEXT NOT NULL DEFAULT 'NGN',
  provider         TEXT NOT NULL DEFAULT 'paystack',
  status           TEXT NOT NULL DEFAULT 'initiated'
                   CHECK (status IN ('initiated','pending','success','failed','abandoned')),
  provider_ref     TEXT,                          -- Paystack's transaction id
  channel          TEXT,                          -- card | bank_transfer ...
  paid_amount      NUMERIC(14,2),                 -- what Paystack says was paid
  paid_at          TIMESTAMPTZ,
  authorization_url TEXT,
  recorded         BOOLEAN NOT NULL DEFAULT FALSE, -- Finance's "recorded in the books" tick
  recorded_by      UUID,
  recorded_at      TIMESTAMPTZ,
  meta             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gateway_payments_type_idx    ON gateway_payments (type, created_at DESC);
CREATE INDEX IF NOT EXISTS gateway_payments_subject_idx ON gateway_payments (subject_id);
CREATE INDEX IF NOT EXISTS gateway_payments_user_idx    ON gateway_payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gateway_payments_pending_idx ON gateway_payments (created_at) WHERE status IN ('initiated','pending');

CREATE TABLE IF NOT EXISTS payment_flags (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id   UUID NOT NULL REFERENCES gateway_payments(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('held','review')),
  reason       TEXT NOT NULL,               -- amount_mismatch | currency_mismatch | late_payment | double_payment | large_order ...
  detail       TEXT,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','cleared','rejected')),
  resolved_by  UUID,
  resolved_at  TIMESTAMPTZ,
  resolution_note TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payment_flags_open_idx ON payment_flags (status, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_flags_payment_idx ON payment_flags (payment_id);

-- Immutable history: who did what, and when.
CREATE TABLE IF NOT EXISTS order_events (
  id          BIGSERIAL PRIMARY KEY,
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event       TEXT NOT NULL,
  actor_id    UUID,
  actor_role  TEXT,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events (order_id, created_at);

-- Orders: payment fields and the new statuses.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS goods_total       NUMERIC(14,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fee_amount        NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS amount_charged    NUMERIC(14,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS expires_at        TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at           TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS held              BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at       TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_by       UUID;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (status IN
  ('awaiting_payment','payment_failed','cancelled','expired','refunded',
   'paid','payment_confirmed','sourcing','processing','allocated','in_transit','delivered'));
CREATE INDEX IF NOT EXISTS orders_awaiting_idx ON orders (expires_at) WHERE status = 'awaiting_payment';

-- Standing commitment: funded through Paystack from now on. Balances typed in
-- before this change stay as they are and are listed for Finance as "legacy".
ALTER TABLE buyer_profiles ADD COLUMN IF NOT EXISTS commitment_funded_at TIMESTAMPTZ;
