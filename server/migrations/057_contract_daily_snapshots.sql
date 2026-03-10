-- Migration 057: Daily snapshots of on-chain contract cumulative stats.
-- Taken hourly via server scheduler; one row per (game, snapshot_date) via UPSERT.
-- Used to produce real daily-delta charts in the admin health dashboard.

CREATE TABLE IF NOT EXISTS contract_daily_snapshots (
  id               SERIAL PRIMARY KEY,
  snapshot_date    DATE          NOT NULL,
  game             VARCHAR(32)   NOT NULL, -- 'plinko' | 'keno' | 'lottery' | 'blackjack'
  total_wagered    NUMERIC(78,0) NOT NULL DEFAULT 0,
  total_payouts    NUMERIC(78,0) NOT NULL DEFAULT 0,
  contract_reserve NUMERIC(78,0) NOT NULL DEFAULT 0,
  captured_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE(snapshot_date, game)
);

CREATE INDEX IF NOT EXISTS idx_cds_date ON contract_daily_snapshots (snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_cds_game ON contract_daily_snapshots (game);
