-- Instant Lottery 6-of-55: store play results for leaderboard and per-player stats.
-- Populated by chain indexer (InstantLotteryResult events). One row per play.
SET lock_timeout = '3s';
SET statement_timeout = '10s';

-- Single row: last scanned block for incremental indexing
CREATE TABLE IF NOT EXISTS instant_lottery_scan (
  id INT PRIMARY KEY DEFAULT 1,
  last_scanned_block BIGINT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT instant_lottery_scan_single_row CHECK (id = 1)
);

INSERT INTO instant_lottery_scan (id, last_scanned_block, updated_at)
VALUES (1, NULL, NOW())
ON CONFLICT (id) DO NOTHING;

-- One row per on-chain InstantLotteryResult (tx_hash is unique)
CREATE TABLE IF NOT EXISTS instant_lottery_plays (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,
  wager NUMERIC(78, 0) NOT NULL,
  gross_payout NUMERIC(78, 0) NOT NULL,
  net_payout NUMERIC(78, 0) NOT NULL,
  block_number BIGINT,
  tx_hash VARCHAR(66) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instant_lottery_plays_wallet ON instant_lottery_plays (LOWER(wallet_address));
CREATE INDEX IF NOT EXISTS idx_instant_lottery_plays_block ON instant_lottery_plays (block_number);
