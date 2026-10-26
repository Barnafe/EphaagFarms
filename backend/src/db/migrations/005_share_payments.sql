-- Step 2 / Phase 2: farmer shares paid through the shared Paystack ledger.
-- A purchase records the goods total, the fee and the total charged separately;
-- each share's capital stays exactly the share price (₦25,000).
ALTER TABLE share_purchases DROP CONSTRAINT IF EXISTS share_purchases_status_check;
ALTER TABLE share_purchases ADD CONSTRAINT share_purchases_status_check
  CHECK (status IN ('pending','paid','failed','expired','cancelled'));
ALTER TABLE share_purchases ADD COLUMN IF NOT EXISTS fee_amount     NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE share_purchases ADD COLUMN IF NOT EXISTS amount_charged NUMERIC(14,2);
ALTER TABLE share_purchases ADD COLUMN IF NOT EXISTS expires_at     TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS share_purchases_expiry_idx ON share_purchases (expires_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS share_purchases_dup_idx ON share_purchases (farmer_id, quantity, created_at DESC);
