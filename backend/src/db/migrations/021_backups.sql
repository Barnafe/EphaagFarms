-- Phase 20: a record of every nightly database backup (what was made, where it was stored, whether it worked).
CREATE TABLE IF NOT EXISTS backup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger TEXT NOT NULL DEFAULT 'schedule',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  object_key TEXT,
  bytes BIGINT,
  sha256 TEXT,
  primary_ok BOOLEAN,
  secondary_ok BOOLEAN,
  secondary_configured BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_old INT NOT NULL DEFAULT 0,
  error TEXT
);
DO $$ BEGIN
  ALTER TABLE backup_runs DROP CONSTRAINT IF EXISTS backup_runs_status_check;
  ALTER TABLE backup_runs ADD CONSTRAINT backup_runs_status_check CHECK (status IN ('running','ok','partial','failed'));
END $$;
CREATE INDEX IF NOT EXISTS backup_runs_started_idx ON backup_runs (started_at DESC);
