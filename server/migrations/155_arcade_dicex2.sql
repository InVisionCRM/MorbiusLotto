-- 155_arcade_dicex2.sql — MORBIUS Arcade: Dice x2 (provably-fair range / "in" dice).
--
-- Sibling of Dice (132). One row per round; the whole round is decided at /play
-- time and inserted in a single transaction alongside the chip moves, so a round
-- is always either (bet charged + roll set + payout applied) or nothing at all.
--
-- Where Dice stores a single roll-under `target_x100`, Dice x2 stores a *band*:
-- low_x100 (inclusive) .. high_x100 (exclusive), both ×100 on the 0.00–99.99
-- scale. Win iff   low_x100 <= roll_x100 < high_x100. The HMAC float that drives
-- `roll_x100` is derived from
-- ProvablyFairService.hmacByteStream(serverSeed, clientSeed, nonce=0) cursor 0,
-- then mapped via   rollX100 = floor(r * 10000). The server_seed is committed
-- (hashed) and stored in the same insert, which makes the round verifiable.

CREATE TABLE IF NOT EXISTS arcade_dicex2_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  -- Win band edges ×100 on the 0.00–99.99 scale. low inclusive, high exclusive.
  -- Integer storage keeps the win/lose comparison exact — no floats on the
  -- decision side. width = high_x100 - low_x100 ∈ [200, 9800].
  low_x100            INTEGER NOT NULL,
  high_x100           INTEGER NOT NULL,
  -- Dice face value ×100 (0..9999, covers 0.00 .. 99.99).
  roll_x100           INTEGER NOT NULL,
  -- Multiplier ×100 paid on a win. Constant given band width + house edge but
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

CREATE INDEX IF NOT EXISTS idx_arcade_dicex2_rounds_wallet
  ON arcade_dicex2_rounds (wallet_address, created_at DESC);

COMMENT ON TABLE arcade_dicex2_rounds IS
  'MORBIUS Arcade Dice x2 — range/"in" dice; one row per round; provably fair via committed server seed.';
