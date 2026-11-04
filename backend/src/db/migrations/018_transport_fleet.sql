-- Phase 12: Transport fleet (vehicles, drivers, trips, costs), delivery tracking with proof of delivery,
-- breakdowns that create maintenance requests, and budget rules for Maintenance and Transport costs.
-- Everything here is idempotent (CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number TEXT NOT NULL,
  name TEXT,
  vehicle_type TEXT NOT NULL DEFAULT 'truck',
  capacity_kg NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'available',
  odometer_km NUMERIC(12,1) NOT NULL DEFAULT 0,
  asset_id UUID REFERENCES maintenance_assets(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_plate_unique ON vehicles (upper(plate_number));
DO $$ BEGIN
  ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_status_check;
  ALTER TABLE vehicles ADD CONSTRAINT vehicles_status_check CHECK (status IN ('available','on_trip','in_maintenance','retired'));
  ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_type_check;
  ALTER TABLE vehicles ADD CONSTRAINT vehicles_type_check CHECK (vehicle_type IN ('truck','van','pickup','tricycle','motorbike','other'));
END $$;

-- Extra details for a driver (drivers themselves are users with role_type = 'transporter').
CREATE TABLE IF NOT EXISTS driver_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  licence_number TEXT,
  licence_expiry DATE,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A trip carries one or more orders (each order on a trip is one shipment).
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  driver_id UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'planned',
  odometer_start NUMERIC(12,1),
  odometer_end NUMERIC(12,1),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  replaces_trip_id UUID REFERENCES trips(id),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_status_check;
  ALTER TABLE trips ADD CONSTRAINT trips_status_check CHECK (status IN ('planned','en_route','completed','broken_down','cancelled'));
END $$;

ALTER TABLE shipments ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivery_code TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS code_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS code_locked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS picked_up_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS recipient_name TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivery_photo_id TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC(9,6);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC(9,6);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS gps_accuracy_m NUMERIC(10,1);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS gps_missing_reason TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS override_reason TEXT;
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS override_by UUID REFERENCES users(id);
ALTER TABLE shipments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS shipments_trip_idx ON shipments (trip_id);

-- A vehicle breakdown reported from a trip. It creates a maintenance request.
CREATE TABLE IF NOT EXISTS trip_breakdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  reported_by UUID REFERENCES users(id),
  description TEXT NOT NULL,
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  maintenance_request_id UUID REFERENCES maintenance_requests(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'report';
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES vehicles(id);
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES trips(id);

-- Transport costs. Fuel is a kind of cost (litres and odometer are kept for fuel).
CREATE TABLE IF NOT EXISTS vehicle_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  trip_id UUID REFERENCES trips(id),
  kind TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  litres NUMERIC(10,2),
  odometer_km NUMERIC(12,1),
  vendor TEXT,
  note TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  budget_status TEXT NOT NULL DEFAULT 'counted',
  budget_note TEXT,
  decided_by UUID REFERENCES users(id),
  decided_at TIMESTAMPTZ,
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$ BEGIN
  ALTER TABLE vehicle_expenses DROP CONSTRAINT IF EXISTS vehicle_expenses_kind_check;
  ALTER TABLE vehicle_expenses ADD CONSTRAINT vehicle_expenses_kind_check CHECK (kind IN ('fuel','toll','allowance','other'));
  ALTER TABLE vehicle_expenses DROP CONSTRAINT IF EXISTS vehicle_expenses_budget_check;
  ALTER TABLE vehicle_expenses ADD CONSTRAINT vehicle_expenses_budget_check CHECK (budget_status IN ('counted','held','rejected'));
END $$;

-- Budget rule for Maintenance costs: a cost that would overrun the budget waits for Finance and does not count until approved.
ALTER TABLE maintenance_expenses ADD COLUMN IF NOT EXISTS budget_status TEXT NOT NULL DEFAULT 'counted';
ALTER TABLE maintenance_expenses ADD COLUMN IF NOT EXISTS budget_note TEXT;
ALTER TABLE maintenance_expenses ADD COLUMN IF NOT EXISTS decided_by UUID REFERENCES users(id);
ALTER TABLE maintenance_expenses ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
ALTER TABLE maintenance_expenses ADD COLUMN IF NOT EXISTS part_id UUID REFERENCES maintenance_parts(id);
DO $$ BEGIN
  ALTER TABLE maintenance_expenses DROP CONSTRAINT IF EXISTS maintenance_expenses_budget_check;
  ALTER TABLE maintenance_expenses ADD CONSTRAINT maintenance_expenses_budget_check CHECK (budget_status IN ('counted','held','rejected'));
END $$;
ALTER TABLE maintenance_part_movements ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2);
