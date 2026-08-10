-- Simulation Mode.
--
-- A simulated gateway/rack has no hardware behind it: the in-app simulator
-- generates its channel values and publishes them through the same telemetry
-- pipeline real gateways use. Both flags live on the existing studio tables so
-- a simulated node is stored, listed, mapped to machines and analysed exactly
-- like a physical one.

-- Marks a gateway or rack as virtual.
ALTER TABLE studio_devices ADD COLUMN IF NOT EXISTS simulated BOOLEAN NOT NULL DEFAULT false;

-- One entry per channel on the card, describing the signal to generate:
-- kind, unit, min/max, normal band, alert/danger limits, sample rate and
-- behaviour. Null for a card installed in a real rack.
ALTER TABLE studio_cards ADD COLUMN IF NOT EXISTS simulation JSONB;
