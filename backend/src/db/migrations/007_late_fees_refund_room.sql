-- Share late fees, grace period and take-down; the one admin Refund room.

-- A share purchase that is not paid when it falls due stays payable with a late fee
-- (2% of the share amount per month, per whole day), which stops growing after one month;
-- then a 10-day grace period; then the purchase is taken down completely.
ALTER TABLE share_purchases ADD COLUMN IF NOT EXISTS late_fee        NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE share_purchases ADD COLUMN IF NOT EXISTS late_days       INT NOT NULL DEFAULT 0;
ALTER TABLE share_purchases ADD COLUMN IF NOT EXISTS late_notice_at  TIMESTAMPTZ;
ALTER TABLE share_purchases ADD COLUMN IF NOT EXISTS grace_notice_at TIMESTAMPTZ;
ALTER TABLE share_purchases ADD COLUMN IF NOT EXISTS final_notice_at TIMESTAMPTZ;
ALTER TABLE share_purchases ADD COLUMN IF NOT EXISTS closed_at       TIMESTAMPTZ;
ALTER TABLE share_purchases ADD COLUMN IF NOT EXISTS closed_reason   TEXT;

-- Refund room: the refund columns on gateway_payments now mean
--   refund_status 'due'      = needs attention (money arrived but could not be applied)
--   refund_status 'refunded' = returned to the payer through Paystack (full amount, with a reason)
--   refund_status 'failed'   = Paystack could not process it; try again or refund in the Paystack dashboard
-- There is no automatic refund any more.
