-- Phase 5: money in through Paystack (savings, loan repayments, Boost Cash deposits) and money out
-- through Paystack transfers (loan disbursement, savings and share withdrawals, ROI payouts).
CREATE TABLE IF NOT EXISTS bank_accounts (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bank_code       TEXT NOT NULL,
  bank_name       TEXT NOT NULL,
  account_number  TEXT NOT NULL,
  account_name    TEXT NOT NULL,          -- as confirmed by Paystack, not typed
  recipient_code  TEXT NOT NULL,          -- Paystack transfer recipient
  verified_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payouts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             TEXT NOT NULL CHECK (kind IN ('loan_disbursement','savings_withdrawal','share_interest','share_capital','roi_payout','produce_settlement')),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_id       UUID NOT NULL,                 -- the loan / withdrawal / ROI record being paid
  amount           NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  status           TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','held','processing','success','failed')),
  hold_reason      TEXT,                          -- no_bank_account | daily_cap
  hold_notified_at TIMESTAMPTZ,
  reference        TEXT NOT NULL UNIQUE,
  transfer_code    TEXT,
  failure_reason   TEXT,
  attempts         INT NOT NULL DEFAULT 0,
  meta             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  UNIQUE (kind, subject_id)                       -- one payout per thing: never paid twice
);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_payouts_user ON payouts(user_id);

ALTER TABLE savings_withdrawals DROP CONSTRAINT IF EXISTS savings_withdrawals_status_check;
ALTER TABLE savings_withdrawals ADD CONSTRAINT savings_withdrawals_status_check CHECK (status IN ('requested','approved','paid','declined'));

-- Boost Cash deposit: created when the farmer starts paying; it is "paid" only when Paystack confirms.
ALTER TABLE boost_cash_deposits ALTER COLUMN paid_at DROP NOT NULL;
ALTER TABLE boost_cash_deposits ALTER COLUMN paid_at DROP DEFAULT;
ALTER TABLE boost_cash_deposits ADD COLUMN IF NOT EXISTS gateway_reference TEXT;
UPDATE boost_cash_deposits SET paid_at = created_at WHERE paid_at IS NULL AND verified_at IS NOT NULL;

ALTER TABLE loan_repayments ADD COLUMN IF NOT EXISTS gateway_reference TEXT;
ALTER TABLE loan_repayments ADD COLUMN IF NOT EXISTS paid_via TEXT;   -- paystack | legacy
UPDATE loan_repayments SET paid_via = 'legacy' WHERE paid_via IS NULL;
