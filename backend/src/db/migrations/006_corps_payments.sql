-- Step 2 / Phase 3: corps access fee on the shared Paystack ledger.
-- `amount` stays the ACCESS FEE (what Finance books as income). The processing fee and the
-- total charged are recorded separately so the books match the Paystack payout.
ALTER TABLE corper_payments ADD COLUMN IF NOT EXISTS processing_fee NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE corper_payments ADD COLUMN IF NOT EXISTS total_charged  NUMERIC(14,2);
-- "This fee is non-refundable once paid": the member must tick, and the time is stored.
ALTER TABLE corper_payments ADD COLUMN IF NOT EXISTS non_refundable_accepted_at TIMESTAMPTZ;
-- Manual confirmation while Paystack could not be reached: reason mandatory, flagged for review.
ALTER TABLE corper_payments ADD COLUMN IF NOT EXISTS manual_reason TEXT;
ALTER TABLE corper_payments ADD COLUMN IF NOT EXISTS confirmed_unverified BOOLEAN NOT NULL DEFAULT FALSE;
