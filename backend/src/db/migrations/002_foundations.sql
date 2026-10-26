-- Step 1 (foundations): shared settings, messaging queue, file registry,
-- scheduled-job log, login protection and the security log.
-- Fully idempotent: safe to run on every boot, on fresh and old databases.

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase 18: login protection
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version      INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until       TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS security_events (
  id          BIGSERIAL PRIMARY KEY,
  event_type  TEXT NOT NULL,
  user_id     UUID,
  ip          TEXT,
  detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_created_idx ON security_events (created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_type_idx    ON security_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_user_idx    ON security_events (user_id, created_at DESC);

-- Phase 15: file registry (every upload is a row; screens refer to files by id)
CREATE TABLE IF NOT EXISTS stored_files (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key      TEXT NOT NULL UNIQUE,
  visibility       TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public','private')),
  driver           TEXT NOT NULL DEFAULT 'local',
  original_name    TEXT,
  mime_type        TEXT NOT NULL,
  size_bytes       BIGINT NOT NULL,
  checksum_sha256  TEXT NOT NULL,
  category         TEXT NOT NULL,
  purpose          TEXT,
  uploaded_by      UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ,
  purge_after      TIMESTAMPTZ,
  purged_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS stored_files_purge_idx ON stored_files (purge_after) WHERE purged_at IS NULL AND deleted_at IS NOT NULL;

-- Phase 16: one outbox for every email and SMS
CREATE TABLE IF NOT EXISTS messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel          TEXT NOT NULL CHECK (channel IN ('email','sms')),
  to_address       TEXT NOT NULL,
  to_user_id       UUID,
  template         TEXT,
  subject          TEXT,
  body_html        TEXT,
  body_text        TEXT,
  attachments      JSONB,
  status           TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','sending','sent','failed','suppressed')),
  attempts         INT NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error       TEXT,
  provider_id      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS messages_due_idx ON messages (next_attempt_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS messages_created_idx ON messages (created_at DESC);
CREATE INDEX IF NOT EXISTS messages_provider_idx ON messages (provider_id);

CREATE TABLE IF NOT EXISTS email_suppressions (
  address     TEXT PRIMARY KEY,
  reason      TEXT NOT NULL,
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase 17: job log
CREATE TABLE IF NOT EXISTS job_runs (
  id           BIGSERIAL PRIMARY KEY,
  job_name     TEXT NOT NULL,
  trigger      TEXT NOT NULL DEFAULT 'schedule',
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','failed','skipped')),
  result       JSONB,
  error        TEXT
);
CREATE INDEX IF NOT EXISTS job_runs_name_idx ON job_runs (job_name, started_at DESC);

CREATE TABLE IF NOT EXISTS job_state (
  job_name     TEXT PRIMARY KEY,
  last_run_at  TIMESTAMPTZ,
  last_ok_at   TIMESTAMPTZ,
  last_alert_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id          BIGSERIAL PRIMARY KEY,
  source      TEXT NOT NULL,
  status      TEXT NOT NULL,        -- ok | bad_signature | error
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS webhook_events_idx ON webhook_events (source, created_at DESC);
