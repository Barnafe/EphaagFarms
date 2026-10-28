-- Phase 4: investor payments through Paystack.
-- After Finance's final approval an application waits in 'awaiting_payment' until the one-time
-- (bulk) or first monthly payment is verified; only then does it become 'active'.
ALTER TABLE investment_applications DROP CONSTRAINT IF EXISTS investment_applications_status_check;
ALTER TABLE investment_applications ADD CONSTRAINT investment_applications_status_check
  CHECK (status IN ('submitted','agreement_pending','agreement_review','awaiting_payment','active','rejected'));

ALTER TABLE investment_applications ADD COLUMN IF NOT EXISTS card_auth_code      TEXT;   -- Paystack's reusable token (never the card number)
ALTER TABLE investment_applications ADD COLUMN IF NOT EXISTS card_last4          TEXT;
ALTER TABLE investment_applications ADD COLUMN IF NOT EXISTS card_brand          TEXT;
ALTER TABLE investment_applications ADD COLUMN IF NOT EXISTS card_email          TEXT;
ALTER TABLE investment_applications ADD COLUMN IF NOT EXISTS card_saved_at       TIMESTAMPTZ;
ALTER TABLE investment_applications ADD COLUMN IF NOT EXISTS activated_at        TIMESTAMPTZ;
ALTER TABLE investment_applications ADD COLUMN IF NOT EXISTS activation_reference TEXT;

ALTER TABLE investment_payments ADD COLUMN IF NOT EXISTS gateway_reference        TEXT;
ALTER TABLE investment_payments ADD COLUMN IF NOT EXISTS paid_via                 TEXT;   -- paystack | auto_charge | offline
ALTER TABLE investment_payments ADD COLUMN IF NOT EXISTS auto_charge_attempted_at TIMESTAMPTZ;
ALTER TABLE investment_payments ADD COLUMN IF NOT EXISTS auto_charge_error        TEXT;
