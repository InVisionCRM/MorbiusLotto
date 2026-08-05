-- 181_arcade_caribbean_stud.sql — MORBIUS Arcade: Caribbean Stud Poker.
--
-- Two-step session game (deal → call/fold), same shape as Three Card Poker
-- (163_arcade_three_card_poker.sql): the row is INSERTED at /deal with
-- status='active' and the Ante (+ optional 5+1 Bonus) debited, then
-- FINAL-UPDATEd to status='settled' on /decision. The server seed is only
-- revealed once the hand settles.
--
-- The whole deck is fixed at /deal behind server_seed_hash. Deal order:
--   player_cards = deck[0..4]   (returned at /deal)
--   dealer_cards = deck[5..9]   (deck[5] is the UP CARD, returned at /deal;
--                                the other four stay sealed until settle)
-- Storing all ten up front is what makes the hand verifiable — the dealer's
-- hand was fixed before the player chose to call or fold.
--
-- Money is in chips (integer). ante / call / bonus are stakes; *_payout columns
-- are GROSS returns (stake included) credited on settle. call is always exactly
-- 2 x ante when the player calls, and 0 on a fold.

CREATE TABLE IF NOT EXISTS arcade_caribbean_stud_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  ante                BIGINT NOT NULL,
  bonus               BIGINT NOT NULL DEFAULT 0,
  call_bet            BIGINT NOT NULL DEFAULT 0,
  -- Card indices (0..51).
  player_cards        JSONB NOT NULL,   -- 5 player cards
  dealer_cards        JSONB NOT NULL,   -- 5 dealer cards; [0] is the up card
  -- 'win' | 'loss' | 'push' | 'dealer_no_qualify' | 'fold' on settle.
  result              TEXT,
  player_category     TEXT,
  dealer_category     TEXT,
  dealer_qualified    BOOLEAN,
  -- GROSS chips returned per bucket on settle (stake included).
  ante_payout         BIGINT NOT NULL DEFAULT 0,
  call_payout         BIGINT NOT NULL DEFAULT 0,
  bonus_payout        BIGINT NOT NULL DEFAULT 0,
  total_payout        BIGINT NOT NULL DEFAULT 0,
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

CREATE INDEX IF NOT EXISTS idx_arcade_caribbean_stud_rounds_wallet
  ON arcade_caribbean_stud_rounds (wallet_address, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_arcade_caribbean_stud_active_per_wallet
  ON arcade_caribbean_stud_rounds (wallet_address)
  WHERE status = 'active';

COMMENT ON TABLE arcade_caribbean_stud_rounds IS
  'MORBIUS Arcade Caribbean Stud Poker — one row per hand, stateful (deal → call/fold); provably fair via committed server seed.';
