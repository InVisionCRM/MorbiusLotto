-- 183_arcade_blackjack_variants.sql — MORBIUS Arcade: the blackjack variants.
--
-- Spanish 21, Double Exposure, Pontoon and Free Bet share one table: they are
-- the same game with different rules, so splitting them across four tables
-- would only duplicate every index and every query. `variant` says which
-- paytable settled the round, and the settle reads it from HERE rather than
-- from the request — a round can't be dealt on one game and paid on another.
--
-- Stateful, like Three Card Poker (163) and Ultimate Hold'em (180): the row is
-- INSERTED at /deal with status='active' and the bet debited, mutated by each
-- /action, then FINAL-UPDATEd to status='settled'. The server seed is revealed
-- only once the round settles.
--
-- The whole deck is fixed at /deal behind server_seed_hash. Spanish 21 filters
-- the four 10s out of that same committed 52-card shuffle, so a verifier only
-- needs to know the variant's removed ranks to reproduce the deal exactly.
--
-- `hands` is the live player state: an array of
--   { cards[], bet, freeBet, doubled, fromSplit, done, surrendered, busted }
-- It is JSONB because a round can hold anywhere from one hand to four after
-- splits, and each carries its own stake — including the house's free-bet
-- chips, which settle alongside the player's but are never paid out as stake.

CREATE TABLE IF NOT EXISTS arcade_blackjack_variant_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  variant             TEXT NOT NULL
                       CHECK (variant IN ('spanish21', 'double_exposure', 'pontoon', 'free_bet')),
  -- The opening bet on the first hand, in chips. Splits and doubles add more;
  -- `committed` is the authoritative total the player actually put up.
  bet                 BIGINT NOT NULL,
  committed           BIGINT NOT NULL DEFAULT 0,
  -- Live player hands (see the note above).
  hands               JSONB NOT NULL,
  -- Index of the hand awaiting a decision; NULL once every hand is done.
  active_hand         SMALLINT,
  -- How many splits have happened, against the variant's cap.
  split_count         SMALLINT NOT NULL DEFAULT 0,
  -- The dealer's cards. Both are dealt at /deal and sealed; how much of it the
  -- client is shown before the round ends depends on the variant (Double
  -- Exposure shows both, Pontoon shows neither).
  dealer_cards        JSONB NOT NULL,
  -- The full committed deck, and how far into it the round has drawn. Keeping
  -- the cursor here is what makes a resumed round deal the same next card.
  deck                JSONB NOT NULL,
  deck_cursor         SMALLINT NOT NULL DEFAULT 0,
  -- Per-hand settlement written at the end: outcome, staked, payout, bonus.
  results             JSONB,
  total_payout        BIGINT NOT NULL DEFAULT 0,
  dealer_total        SMALLINT,
  won                 BOOLEAN NOT NULL DEFAULT FALSE,
  status              TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'settled')),
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_arcade_bj_variant_rounds_wallet
  ON arcade_blackjack_variant_rounds (wallet_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_arcade_bj_variant_rounds_variant
  ON arcade_blackjack_variant_rounds (variant, created_at DESC);

-- One live round per wallet PER VARIANT: a player can have a Spanish 21 hand
-- and a Pontoon hand open in two tabs, but not two Spanish 21 hands — which is
-- what would strand an already-debited bet.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_arcade_bj_variant_active_per_wallet
  ON arcade_blackjack_variant_rounds (wallet_address, variant)
  WHERE status = 'active';

COMMENT ON TABLE arcade_blackjack_variant_rounds IS
  'MORBIUS Arcade blackjack variants (Spanish 21, Double Exposure, Pontoon, Free Bet) — one row per round, stateful; provably fair via committed server seed.';

COMMENT ON COLUMN arcade_blackjack_variant_rounds.variant IS
  'Which rule set settled this round. Read from here at settle time, never from the request.';
