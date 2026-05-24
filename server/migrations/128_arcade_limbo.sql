-- 128_arcade_limbo.sql — MORBIUS Arcade: Limbo (provably-fair multiplier game).
--
-- One row per round. The whole round is decided at /play time and inserted in
-- a single transaction alongside the chip moves, so a round is always either
-- (bet charged + result_multiplier set + payout applied) or nothing at all.
--
-- The HMAC float that drives `result_multiplier` is derived from
-- ProvablyFairService.hmacByteStream(serverSeed, clientSeed, nonce=0) cursor 0,
-- then mapped via   crashPoint = (1 - houseEdge) / r   (clamped at 1.00). The
-- server_seed is committed (hashed) and stored in the same insert, which is
-- what makes the round verifiable: anyone with the public seed + client_seed
-- can re-derive the exact result_multiplier.

CREATE TABLE IF NOT EXISTS arcade_limbo_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  -- Target multiplier × 100 (so 1.50x is stored as 150). Integer storage
  -- keeps the comparison exact — no floats on the bet/decision side.
  target_x100         INTEGER NOT NULL,
  -- Result multiplier × 100 (capped at 100,000,000 = 1,000,000.00x).
  result_x100         BIGINT NOT NULL,
  won                 BOOLEAN NOT NULL,
  payout              BIGINT NOT NULL,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  house_edge_bp       INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_limbo_rounds_wallet
  ON arcade_limbo_rounds (wallet_address, created_at DESC);

COMMENT ON TABLE arcade_limbo_rounds IS
  'MORBIUS Arcade Limbo — one row per round; provably fair via committed server seed.';
