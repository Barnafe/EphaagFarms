-- Late monthly investment payments: reminders 2 days before, daily notices after, and a 2% penalty
-- on the overdue share's capital for each month it stays unpaid, deducted from the ROI payout.
ALTER TABLE investment_payments ADD COLUMN IF NOT EXISTS reminder2_sent_at       TIMESTAMPTZ;
ALTER TABLE investment_payments ADD COLUMN IF NOT EXISTS last_overdue_notice_on  DATE;

CREATE TABLE IF NOT EXISTS investment_late_penalties (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id   UUID NOT NULL REFERENCES investment_applications(id) ON DELETE CASCADE,
  payment_id       UUID NOT NULL REFERENCES investment_payments(id) ON DELETE CASCADE,
  period_no        INT NOT NULL,                 -- 1 = first 30 days overdue, 2 = next 30 days, ...
  base_amount      NUMERIC(14,2) NOT NULL,       -- the capital of the overdue share
  percent          NUMERIC(5,2) NOT NULL,
  amount           NUMERIC(14,2) NOT NULL,
  charged_on       DATE NOT NULL DEFAULT CURRENT_DATE,
  deducted_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_id, period_no)
);
CREATE INDEX IF NOT EXISTS idx_late_penalties_app ON investment_late_penalties(application_id);

ALTER TABLE roi_records ADD COLUMN IF NOT EXISTS penalty_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
