-- 132_arcade_dice.sql — MORBIUS Arcade: Dice (provably-fair roll-under).
--
-- One row per round. Like Limbo (128) the whole round is decided at /play time
-- and inserted in a single transaction alongside the chip moves, so a round is
-- always either (bet charged + roll set + payout applied) or nothing at all.
--
-- The HMAC float that drives `roll_x100` is derived from
-- ProvablyFairService.hmacByteStream(serverSeed, clientSeed, nonce=0) cursor 0,
-- then mapped via   rollX100 = floor(r * 10000). Win iff rollX100 < targetX100.
-- The server_seed is committed (hashed) and stored in the same insert, which
-- is what makes the round verifiable.

CREATE TABLE IF NOT EXISTS arcade_dice_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  -- Roll-under threshold ×100. 2.00 ↔ 200, 98.00 ↔ 9800. Integer storage
  -- keeps the win/lose comparison exact — no floats on the decision side.
  target_x100         INTEGER NOT NULL,
  -- Dice face value ×100 (0..9999, covers 0.00 .. 99.99).
  roll_x100           INTEGER NOT NULL,
  -- Multiplier ×100 paid on a win. Constant given target + house edge but
  -- denormalised here so the verifier doesn't have to re-derive it.
  multiplier_x100     INTEGER NOT NULL,
  won                 BOOLEAN NOT NULL,
  payout              BIGINT NOT NULL,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  house_edge_bp       INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_dice_rounds_wallet
  ON arcade_dice_rounds (wallet_address, created_at DESC);

COMMENT ON TABLE arcade_dice_rounds IS
  'MORBIUS Arcade Dice — one row per round; provably fair via committed server seed.';
