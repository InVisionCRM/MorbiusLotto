-- Roulette spin history cache.
-- Populated by the chain-analytics service scanning Spun events from the Roulette contract.
-- Used for the global feed, recent plays table, and leaderboard without re-scanning every request.

CREATE TABLE IF NOT EXISTS roulette_spins (
  id               BIGSERIAL PRIMARY KEY,
  spin_id          NUMERIC(78, 0) NOT NULL,          -- on-chain spinId
  player_address   TEXT NOT NULL,
  result           SMALLINT NOT NULL,                 -- winning pocket 0-36
  total_wagered    NUMERIC(78, 0) NOT NULL,           -- raw MORBIUS (18 decimals)
  gross_payout     NUMERIC(78, 0) NOT NULL,
  net_payout       NUMERIC(78, 0) NOT NULL,
  paid_with_pls    BOOLEAN NOT NULL DEFAULT FALSE,
  block_number     BIGINT NOT NULL,
  tx_hash          TEXT NOT NULL,
  block_timestamp  TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure no duplicate on-chain events are inserted
CREATE UNIQUE INDEX IF NOT EXISTS roulette_spins_spin_id_uidx
  ON roulette_spins (spin_id);

-- Fast lookups by player (recent plays, player stats)
CREATE INDEX IF NOT EXISTS roulette_spins_player_idx
  ON roulette_spins (player_address, block_number DESC);

-- Fast global feed scan
CREATE INDEX IF NOT EXISTS roulette_spins_block_idx
  ON roulette_spins (block_number DESC);
