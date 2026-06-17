-- 165_arcade_cipher.sql — MORBIUS Arcade: Cipher (provably-fair Mastermind).
--
-- One row per round. Stateful like Chicken (154_arcade_chicken.sql): the row is
-- INSERTED at /start with status='active' and the bet debited, UPDATED on each
-- /guess (the guess + its exact/partial feedback is appended, guess_count and
-- best_exact advance), then FINAL-UPDATED to status='settled' when the code is
-- cracked (won=true, crack-ladder payout), the player banks the secured value
-- (/cashout, won=true), or the last guess is spent without a crack (won=false).
--
-- The secret `code` is a JSON array of symbol indices (0-based) derived from the
-- HMAC byte stream at /start (see arcade-cipher.ts → deriveSecretCode: one
-- 4-byte slice per peg at cursor = peg*4, symbol = floor(bytesToFloat * symbols)).
-- It is sealed behind `server_seed_hash` — neither the code nor the server seed
-- ever leaves the server while the round is active; only per-guess peg feedback
-- does. The server seed (and thus the verifiable code) is revealed only once the
-- round settles, which is what makes the round provably fair.
--
-- `guesses` is a JSON array of { guess: number[], exact: int, partial: int } —
-- the full guess history with its computed feedback, so a refresh can resume the
-- board and a verifier can re-score every guess against the revealed code.

CREATE TABLE IF NOT EXISTS arcade_cipher_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  -- easy 4×5 / 8 tries, medium 4×6 / 7 tries, hard 5×6 / 7 tries.
  difficulty          TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  -- The secret code: JSON array of symbol indices (0-based). Derived from the
  -- HMAC stream at /start; sealed (never sent to the client) until the round settles.
  code                JSONB NOT NULL,
  -- Guess history: JSON array of { guess:int[], exact:int, partial:int }.
  guesses             JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Count of submitted guesses so far.
  guess_count         INTEGER NOT NULL DEFAULT 0,
  -- Best exact-peg count achieved across all guesses (drives the secured value).
  best_exact          INTEGER NOT NULL DEFAULT 0,
  -- TRUE only when the full code was cracked. Meaningless while active.
  cracked             BOOLEAN NOT NULL DEFAULT FALSE,
  -- ×100 multiplier the round paid (crack-ladder on a crack, secure ladder on a
  -- bank, 0 on a bust). 0 while active.
  multiplier_x100     INTEGER NOT NULL DEFAULT 0,
  -- 'active' → still guessing; 'settled' → finished (won says how it ended).
  status              TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'settled')),
  -- TRUE on a crack or a bank; FALSE on a bust. Meaningless while active.
  won                 BOOLEAN NOT NULL DEFAULT FALSE,
  -- Final payout in chips (0 while active and on bust).
  payout              BIGINT NOT NULL DEFAULT 0,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  house_edge_bp       INTEGER NOT NULL DEFAULT 200,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_arcade_cipher_rounds_wallet
  ON arcade_cipher_rounds (wallet_address, created_at DESC);

-- A wallet can have at most one active round at a time; prevents the UI from
-- orphaning a bet by starting a second code on top of the first.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_arcade_cipher_active_per_wallet
  ON arcade_cipher_rounds (wallet_address)
  WHERE status = 'active';

COMMENT ON TABLE arcade_cipher_rounds IS
  'MORBIUS Arcade Cipher — one row per round, stateful via guesses/best_exact; provably fair via committed server seed (secret code revealed only at settle).';
