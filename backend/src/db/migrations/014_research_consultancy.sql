-- Phase 7: Research (internal PDFs) and Consultancy (public booking -> approval with a price -> Paystack -> scheduling).
-- Safe to run on every boot.

-- Research is internal: a title, a summary and a PDF that only staff can download.
ALTER TABLE research ADD COLUMN IF NOT EXISTS file_url TEXT;        -- stored file id
ALTER TABLE research ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE research ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Consultancy requests can come from people without an account.
ALTER TABLE consultancy_requests ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE consultancy_requests ALTER COLUMN offering_id DROP NOT NULL;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS applicant_name TEXT;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS applicant_email TEXT;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS applicant_phone TEXT;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS organisation TEXT;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS topic TEXT;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS amount NUMERIC(14,2);
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS payment_terms TEXT;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS decided_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS decision_reason TEXT;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS paid_payment_id UUID;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS session_date DATE;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS session_time TEXT;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS session_place TEXT;     -- a place or a meeting link
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS consultant_note TEXT;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS scheduled_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE consultancy_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Older rows (member requests made before this phase) get a reference and a tracking token too.
UPDATE consultancy_requests SET reference = 'CNS-' || to_char(created_at, 'YYYYMMDD') || '-' || upper(substr(md5(id::text), 1, 4)) WHERE reference IS NULL;
UPDATE consultancy_requests SET access_token = md5(id::text || random()::text) || md5(random()::text) WHERE access_token IS NULL;
UPDATE consultancy_requests cr SET applicant_name = u.name, applicant_email = u.email, applicant_phone = u.phone
  FROM users u WHERE cr.user_id = u.id AND cr.applicant_name IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS consultancy_requests_reference_uq ON consultancy_requests (reference);
CREATE UNIQUE INDEX IF NOT EXISTS consultancy_requests_token_uq ON consultancy_requests (access_token);

ALTER TABLE consultancy_requests DROP CONSTRAINT IF EXISTS consultancy_requests_status_check;
ALTER TABLE consultancy_requests ADD CONSTRAINT consultancy_requests_status_check CHECK (status IN
  ('pending','rejected','awaiting_payment','ready','scheduled','completed','cancelled'));
CREATE INDEX IF NOT EXISTS consultancy_requests_status_idx ON consultancy_requests (status, created_at DESC);
