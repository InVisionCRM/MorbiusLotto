-- Provably-fair instant lottery plays: server-generated draws for verification.
-- Indexer still inserts chain events into instant_lottery_plays; this table stores
-- server_seed_hash, client_seed, nonce, winning_numbers for provably-fair verification.
SET lock_timeout = '3s';
SET statement_timeout = '10s';

CREATE TABLE IF NOT EXISTS instant_lottery_plays_pf (
  id BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,
  wager NUMERIC(78, 0) NOT NULL,
  player_numbers INT[] NOT NULL,
  winning_numbers INT[] NOT NULL,
  match_count SMALLINT NOT NULL,
  gross_payout NUMERIC(78, 0) NOT NULL,
  net_payout NUMERIC(78, 0) NOT NULL,
  server_seed_hash VARCHAR(64) NOT NULL,
  server_seed VARCHAR(64),
  client_seed VARCHAR(255) NOT NULL DEFAULT 'default',
  nonce BIGINT NOT NULL,
  tx_hash VARCHAR(66),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_instant_lottery_plays_pf_nonce
  ON instant_lottery_plays_pf (wallet_address, nonce);
CREATE INDEX IF NOT EXISTS idx_instant_lottery_plays_pf_tx
  ON instant_lottery_plays_pf (tx_hash) WHERE tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_instant_lottery_plays_pf_wallet
  ON instant_lottery_plays_pf (LOWER(wallet_address));
