-- Pending deposits: credit players.balance only after N block confirmations (reorg protection).
-- Status: pending_confirmation -> credited
SET lock_timeout = '3s';
SET statement_timeout = '10s';

CREATE TABLE IF NOT EXISTS pending_deposits (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address         VARCHAR(42) NOT NULL,
  amount_wei             NUMERIC(78, 0) NOT NULL,
  tx_hash                TEXT NOT NULL UNIQUE,
  block_number           BIGINT,
  confirmations_required INT NOT NULL DEFAULT 12,
  status                 VARCHAR(32) NOT NULL DEFAULT 'pending_confirmation'
    CHECK (status IN ('pending_confirmation', 'credited')),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_deposits_status
  ON pending_deposits (status)
  WHERE status = 'pending_confirmation';

CREATE INDEX IF NOT EXISTS idx_pending_deposits_wallet
  ON pending_deposits (LOWER(wallet_address), created_at DESC);
