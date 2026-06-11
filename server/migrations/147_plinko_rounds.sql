-- 147_plinko_rounds.sql — Server-side Plinko (chips, provably fair).
--
-- One row per ball. Like Keno (146) / Dice (132) the whole round is decided
-- at /play time and inserted in a single transaction alongside the chip moves,
-- so a ball is always either (bet charged + path drawn + payout applied) or
-- nothing at all — never half-settled, never paid twice.
--
-- Game shape (matches the existing 16-row board): the server draws a 16-step
-- left/right path; bucket = count of rights (binomial C(16,k)/2^16);
-- payout = bet × multiplier(risk, bucket).
--
-- The path is derived from
--   ProvablyFairService.drawPlinkoPath(serverSeed, clientSeed, nonce)
-- (4 HMAC-stream bytes per step, float < 0.5 = left — the same primitive the
-- lottery, blackjack and keno draws use). The server_seed is committed
-- (hashed) and stored in the same insert, which is what makes the ball
-- independently verifiable.

CREATE TABLE IF NOT EXISTS plinko_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  -- 'low' | 'medium' | 'high' (rendered as the GREEN/YELLOW/RED boards)
  risk                VARCHAR(8) NOT NULL,
  -- The 16 left/right steps, JSON int array of 0 (left) / 1 (right).
  path                JSONB NOT NULL,
  -- Landing bucket 0..16 = count of rights in `path`.
  bucket              INTEGER NOT NULL,
  -- Multiplier ×100 paid on the bucket (contract-verbatim basis points).
  multiplier_x100     INTEGER NOT NULL,
  payout              BIGINT NOT NULL,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plinko_rounds_wallet
  ON plinko_rounds (wallet_address, created_at DESC);

COMMENT ON TABLE plinko_rounds IS
  'Server-side Plinko — one row per ball; provably fair via committed server seed; settled in off-chain chips (player_poker_chips).';
