-- Phase 8: verified farmer identity (NIN through NIMC), locked NIMC fields, residential address with
-- an automatically detected unit, and a gate on sensitive features.
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_verified     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_verified_at  TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_hash         TEXT;     -- HMAC of the NIN (duplicate detection); the NIN itself is never stored
ALTER TABLE users ADD COLUMN IF NOT EXISTS nin_last4        TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nin_hash ON users(nin_hash) WHERE nin_hash IS NOT NULL;

-- farmer_profiles.home_address is the RESIDENTIAL address (changeable); permanent_address comes from NIMC (locked).
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS permanent_address      TEXT;
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS residential_community  TEXT;
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS residential_street     TEXT;
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS residential_lat        NUMERIC(9,6);
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS residential_lng        NUMERIC(9,6);
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS unit_match_method      TEXT;   -- gps | community | ward_only | typed | none
ALTER TABLE farmer_profiles ADD COLUMN IF NOT EXISTS unit_matched_at        TIMESTAMPTZ;

-- Official units with a location. The closest one to a farmer's address is the farmer's unit.
CREATE TABLE IF NOT EXISTS unit_catalog (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  state        TEXT NOT NULL,
  lga          TEXT NOT NULL,
  ward         TEXT NOT NULL,
  lat          NUMERIC(9,6),
  lng          NUMERIC(9,6),
  communities  TEXT[] NOT NULL DEFAULT '{}',    -- community / street names that belong to this unit
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  source       TEXT NOT NULL DEFAULT 'leader',  -- leader | admin | approved_proposal
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_catalog_identity ON unit_catalog (lower(state), lower(lga), lower(ward), lower(name));

-- Every automatic unit change, for the audit trail.
CREATE TABLE IF NOT EXISTS farmer_unit_changes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_state TEXT, from_lga TEXT, from_ward TEXT, from_unit TEXT,
  to_state   TEXT, to_lga   TEXT, to_ward   TEXT, to_unit   TEXT,
  method        TEXT NOT NULL,
  distance_km   NUMERIC(8,2),
  pending_loans_moved INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_unit_changes_user ON farmer_unit_changes(user_id);

-- One-time bootstrap: every unit that already has a Unit Leader becomes an official unit (no pin yet).
INSERT INTO unit_catalog (name, state, lga, ward, source)
SELECT DISTINCT u.unit, u.state, u.lga, u.ward, 'leader'
  FROM users u JOIN farmer_profiles fp ON fp.user_id = u.id
 WHERE fp.rank = 'Unit Leader' AND u.unit IS NOT NULL AND u.state IS NOT NULL AND u.lga IS NOT NULL AND u.ward IS NOT NULL
ON CONFLICT DO NOTHING;
