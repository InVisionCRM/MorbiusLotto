-- 145_arcade_roulette.sql — MORBIUS Arcade: Roulette (European, single-zero).
--
-- One row per spin. Multiple bets are stored as a JSONB array so the player
-- can cover several zones simultaneously — straight-up 35:1, dozens 2:1,
-- even-money red/black etc. — all settled in a single atomic transaction.
--
-- The result (0-36) is derived from HMAC-SHA256(serverSeed, clientSeed:nonce:0)
-- → bytesToFloat → floor(r * 37). Server seed is committed as sha256(serverSeed)
-- before the spin; revealed afterwards via the verify endpoint.

CREATE TABLE IF NOT EXISTS arcade_roulette_spins (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  -- Array of { type, amount, numbers? } objects — one entry per bet zone placed.
  bets                JSONB NOT NULL,
  total_bet           BIGINT NOT NULL,
  -- Winning pocket: 0 = zero, 1-36 = number.
  result              SMALLINT NOT NULL CHECK (result >= 0 AND result <= 36),
  -- Array parallel to `bets` — gross chips credited on a winning bet (0 on loss).
  payouts             JSONB NOT NULL,
  total_payout        BIGINT NOT NULL,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_roulette_spins_wallet
  ON arcade_roulette_spins (wallet_address, created_at DESC);

COMMENT ON TABLE arcade_roulette_spins IS
  'MORBIUS Arcade Roulette — one row per spin; European single-zero, result in 0-36.';
