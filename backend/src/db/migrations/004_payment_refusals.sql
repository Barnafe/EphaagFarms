-- Phase 1 hardening: payments that cannot be used are REFUSED automatically
-- (no Finance clear/reject step), and Finance only sees what is left to refund.

ALTER TABLE gateway_payments DROP CONSTRAINT IF EXISTS gateway_payments_status_check;
ALTER TABLE gateway_payments ADD CONSTRAINT gateway_payments_status_check
  CHECK (status IN ('initiated','pending','success','failed','abandoned','refused'));
ALTER TABLE gateway_payments ADD COLUMN IF NOT EXISTS refusal_reason  TEXT;   -- amount_mismatch | currency_mismatch | order_expired | order_cancelled | duplicate_payment | no_buyer_profile
ALTER TABLE gateway_payments ADD COLUMN IF NOT EXISTS refund_status   TEXT;   -- due | processing | refunded | failed
ALTER TABLE gateway_payments ADD COLUMN IF NOT EXISTS refund_reference TEXT;
ALTER TABLE gateway_payments ADD COLUMN IF NOT EXISTS refund_note     TEXT;
ALTER TABLE gateway_payments ADD COLUMN IF NOT EXISTS refund_at       TIMESTAMPTZ;
ALTER TABLE gateway_payments ADD COLUMN IF NOT EXISTS refunded_by     UUID;
ALTER TABLE gateway_payments DROP CONSTRAINT IF EXISTS gateway_payments_refund_status_check;
ALTER TABLE gateway_payments ADD CONSTRAINT gateway_payments_refund_status_check
  CHECK (refund_status IS NULL OR refund_status IN ('due','processing','refunded','failed'));
CREATE INDEX IF NOT EXISTS gateway_payments_refund_idx ON gateway_payments (refund_status) WHERE refund_status IS NOT NULL;

-- Same-items-same-amount detection at checkout.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS items_signature TEXT;
CREATE INDEX IF NOT EXISTS orders_signature_idx ON orders (buyer_id, items_signature, created_at DESC);

-- "Held" flags no longer exist: anything that was waiting for a Finance decision is
-- now handled by the automatic rules, so close what the earlier build left open.
UPDATE payment_flags SET status = 'cleared', resolved_at = now(),
       resolution_note = 'closed by the automatic payment rules (migration 004)'
 WHERE kind = 'held' AND status = 'open';
