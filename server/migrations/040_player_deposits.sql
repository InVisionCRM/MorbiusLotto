-- Per-wallet deposit history, populated by incremental chain-analytics scans.
-- tx_hash is UNIQUE so re-scanning the same block range never double-logs.
SET lock_timeout = '3s';
SET statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS player_deposits (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT       NOT NULL,
  amount       NUMERIC(78, 0) NOT NULL,
  tx_hash      TEXT        NOT NULL UNIQUE,
  block_number BIGINT      NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_player_deposits_wallet
  ON player_deposits (LOWER(wallet_address), created_at DESC);
