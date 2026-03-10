-- Migration 058: Hourly snapshots for admin charts (last 48h).
-- One row per (snapshot_hour, game). Prune rows older than 48h in app or cron.

CREATE TABLE IF NOT EXISTS contract_hourly_snapshots (
  id               SERIAL PRIMARY KEY,
  snapshot_hour    TIMESTAMPTZ   NOT NULL,
  game             VARCHAR(32)   NOT NULL,
  total_wagered    NUMERIC(78,0) NOT NULL DEFAULT 0,
  total_payouts    NUMERIC(78,0) NOT NULL DEFAULT 0,
  contract_reserve NUMERIC(78,0) NOT NULL DEFAULT 0,
  captured_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(snapshot_hour, game)
);

CREATE INDEX IF NOT EXISTS idx_chs_hour ON contract_hourly_snapshots (snapshot_hour DESC);
CREATE INDEX IF NOT EXISTS idx_chs_game ON contract_hourly_snapshots (game);
