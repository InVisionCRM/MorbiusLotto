-- 180_arcade_ultimate_holdem.sql — MORBIUS Arcade: Ultimate Texas Hold'em.
--
-- Multi-step session game, so the row is stateful like Three Card Poker
-- (163_arcade_three_card_poker.sql) but with up to three stages instead of one
-- decision. The row is INSERTED at /deal with stage='preflop' and the Ante,
-- Blind (= Ante) and optional Trips debited; each /action either advances the
-- stage (a check) or FINAL-UPDATEs it to stage='settled' (a Play bet, or a fold
-- at the river). The server seed is only revealed once the hand settles.
--
-- The whole deck is fixed at /deal behind server_seed_hash. Deal order:
--   hole_cards   = deck[0,1]      (returned at /deal — the player must see them)
--   dealer_cards = deck[2,3]      (sealed until settle)
--   board        = deck[4..8]     (flop 4,5,6 / turn 7 / river 8 — revealed a
--                                  street at a time as the player checks)
-- Storing all of it up front is what makes the hand verifiable: the cards were
-- committed before the player made a single decision.
--
-- Money is in chips (integer). ante / blind / trips / play are stakes;
-- *_payout columns are GROSS returns (stake included) credited on settle.

CREATE TABLE IF NOT EXISTS arcade_ultimate_holdem_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  -- Stakes (chips). blind always equals ante. trips is 0 when the side bet is
  -- off. play stays 0 until the player commits it (4x/3x pre-flop, 2x on the
  -- flop, 1x on the river) and stays 0 forever if they check down and fold.
  ante                BIGINT NOT NULL,
  blind               BIGINT NOT NULL,
  trips               BIGINT NOT NULL DEFAULT 0,
  play                BIGINT NOT NULL DEFAULT 0,
  -- Which multiple of the ante the Play bet was made at (4, 3, 2, 1, or 0).
  play_multiple       SMALLINT NOT NULL DEFAULT 0,
  -- Card indices (0..51).
  hole_cards          JSONB NOT NULL,   -- 2 player cards
  dealer_cards        JSONB NOT NULL,   -- 2 dealer cards, sealed until settle
  board               JSONB NOT NULL,   -- 5 community cards, sealed by street
  -- 'preflop' → dealt, no board shown; 'flop' → 3 board cards shown;
  -- 'river' → all 5 shown, last decision pending; 'settled' → resolved.
  stage               TEXT NOT NULL DEFAULT 'preflop'
                       CHECK (stage IN ('preflop', 'flop', 'river', 'settled')),
  folded              BOOLEAN NOT NULL DEFAULT FALSE,
  -- 'win' | 'loss' | 'push' | 'fold' on settle.
  result              TEXT,
  -- Paytable categories at showdown, for history rendering.
  player_category     TEXT,
  dealer_category     TEXT,
  dealer_qualified    BOOLEAN,
  -- GROSS chips returned per bucket on settle (stake included).
  ante_payout         BIGINT NOT NULL DEFAULT 0,
  blind_payout        BIGINT NOT NULL DEFAULT 0,
  play_payout         BIGINT NOT NULL DEFAULT 0,
  trips_payout        BIGINT NOT NULL DEFAULT 0,
  total_payout        BIGINT NOT NULL DEFAULT 0,
  -- TRUE when the player came out ahead (net > 0). Meaningless while active.
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

CREATE INDEX IF NOT EXISTS idx_arcade_ultimate_holdem_rounds_wallet
  ON arcade_ultimate_holdem_rounds (wallet_address, created_at DESC);

-- A wallet can have at most one hand in play; stops the UI from orphaning a
-- deal (and its already-debited Ante + Blind) by starting a second one on top.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_arcade_ultimate_holdem_active_per_wallet
  ON arcade_ultimate_holdem_rounds (wallet_address)
  WHERE status = 'active';

COMMENT ON TABLE arcade_ultimate_holdem_rounds IS
  'MORBIUS Arcade Ultimate Texas Hold''em — one row per hand, stateful (deal → check/bet per street → showdown); provably fair via committed server seed.';
