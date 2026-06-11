-- 146_keno_rounds.sql — Server-side Stake-style Keno (chips, provably fair).
--
-- One row per round. Like Dice (132) / Limbo (128) the whole round is decided
-- at /play time and inserted in a single transaction alongside the chip moves,
-- so a round is always either (bet charged + draw set + payout applied) or
-- nothing at all — never half-settled, never paid twice.
--
-- Game shape (matches Stake): 40 tiles (1..40), player picks 1..10, the server
-- draws 10 distinct numbers, payout = bet × multiplier(risk, picks, hits).
--
-- The 10 drawn numbers are derived from
--   ProvablyFairService.drawKenoNumbers(serverSeed, clientSeed, nonce)
-- (a Fisher-Yates partial shuffle over 1..40 via the HMAC byte stream — the
-- same primitive the 6-of-55 lottery and the blackjack deck use). The
-- server_seed is committed (hashed) and stored in the same insert, which is
-- what makes the round independently verifiable.

CREATE TABLE IF NOT EXISTS keno_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  -- 'classic' | 'low' | 'medium' | 'high'
  risk                VARCHAR(8) NOT NULL,
  -- Player's chosen tiles (1..40), 1..10 of them. JSON int array.
  picks               JSONB NOT NULL,
  -- The 10 distinct numbers the server drew (1..40), in draw order.
  drawn               JSONB NOT NULL,
  -- How many picks landed in `drawn`.
  hits                INTEGER NOT NULL,
  -- Multiplier ×100 paid on the result (0 when the cell pays nothing).
  -- Stored ×100 so the chip payout is exact integer math; e.g. 3.96 ↔ 396.
  multiplier_x100     INTEGER NOT NULL,
  payout              BIGINT NOT NULL,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_keno_rounds_wallet
  ON keno_rounds (wallet_address, created_at DESC);

COMMENT ON TABLE keno_rounds IS
  'Server-side Stake-style Keno — one row per round; provably fair via committed server seed; settled in off-chain chips (player_poker_chips).';
