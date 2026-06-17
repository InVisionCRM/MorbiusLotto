-- 159_arcade_pachinko.sql — MORBIUS Arcade: Pachinko (provably-fair pin-drop).
--
-- Plinko-family drop with a CUSTOM pocket distribution (a rare center jackpot),
-- which is what distinguishes it from the binomial Plinko (147). One row per
-- drop; the whole round is decided at /play time and inserted in a single
-- transaction alongside the chip moves, so a drop is always either (bet charged
-- + pocket drawn + payout applied) or nothing at all — never half-settled,
-- never paid twice. Sibling of plinko_rounds (147) and arcade_dicex2_rounds (155).
--
-- Game shape: nine pockets across the bottom (index 4 is the jackpot gate).
-- Three risk levels (low/medium/high) each carry a pocket → multiplier_x100
-- table, all tuned to ≈96% RTP. The landing pocket is a single weighted draw:
--   f0 = bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, 0));
--   pocket = first index whose cumulative weight exceeds f0 × totalWeight.
-- The bounce `path` (PACHINKO_ROWS L/R steps, floats at cursor (row+1)*4) is a
-- COSMETIC reveal animation re-derived by the client; it does not pick the
-- pocket. The server_seed is committed (hashed) and stored in the same insert,
-- which is what makes the drop independently verifiable.

CREATE TABLE IF NOT EXISTS arcade_pachinko_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  -- 'low' | 'medium' | 'high' — selects the pocket multiplier table.
  risk                VARCHAR(8) NOT NULL,
  -- Landing pocket 0..8 (4 = center jackpot).
  pocket              INTEGER NOT NULL,
  -- The cosmetic L/R bounce path, JSON int array of 0 (left) / 1 (right).
  path                JSONB NOT NULL,
  -- Multiplier ×100 paid on the pocket (e.g. 152 = 1.52×, 505 = 5.05× jackpot).
  multiplier_x100     INTEGER NOT NULL,
  -- A drop "wins" when its payout strictly exceeds the bet (net positive).
  won                 BOOLEAN NOT NULL,
  payout              BIGINT NOT NULL,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  -- Nullable: this game's edge lives in the pocket tables, not a flat bp, so it
  -- is informational only (the realised per-risk RTP) when present.
  house_edge_bp       INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_pachinko_rounds_wallet
  ON arcade_pachinko_rounds (wallet_address, created_at DESC);

COMMENT ON TABLE arcade_pachinko_rounds IS
  'MORBIUS Arcade Pachinko — pin-drop with a custom pocket distribution (rare center jackpot); one row per drop; provably fair via committed server seed; settled in off-chain chips (player_poker_chips).';
