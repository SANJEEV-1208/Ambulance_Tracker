-- Enable PostGIS and pgcrypto extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drivers table
CREATE TABLE IF NOT EXISTS drivers (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255)  NOT NULL,
  email         VARCHAR(255)  UNIQUE NOT NULL,
  phone         VARCHAR(20)   NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  vehicle_number VARCHAR(50)  NOT NULL,
  is_on_duty    BOOLEAN       NOT NULL DEFAULT FALSE,
  location      GEOGRAPHY(POINT, 4326),
  last_seen     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Spatial index for fast proximity queries
CREATE INDEX IF NOT EXISTS idx_drivers_location  ON drivers USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_drivers_on_duty   ON drivers(is_on_duty);
CREATE INDEX IF NOT EXISTS idx_drivers_email     ON drivers(email);
