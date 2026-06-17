-- 163_arcade_three_card_poker.sql — MORBIUS Arcade: Three Card Poker.
--
-- Two-step session game (deal → play/fold), so the row is stateful like Chicken
-- (154_arcade_chicken.sql): the row is INSERTED at /deal with status='active'
-- and the Ante (+ optional Pair Plus) debited; then FINAL-UPDATED to
-- status='settled' on the /decision call (play or fold). The server seed is
-- only revealed once the round settles — that's what makes the hand verifiable.
--
-- The deck is a provably-fair Fisher-Yates shuffle (pf.fisherYatesShuffle →
-- 52 indices 0..51). player_cards = deck[0,1,2], dealer_cards = deck[3,4,5].
-- Both are sealed behind server_seed_hash at /deal. player_cards is returned at
-- /deal (the player must see their hand to decide); dealer_cards never leaves
-- the server until the round settles.
--
-- Money is in chips (integer). ante / play / pair_plus are stakes;
-- *_payout columns are GROSS returns (stake included) credited on settle.

CREATE TABLE IF NOT EXISTS arcade_three_card_poker_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  -- Stakes (chips). ante is always > 0; pair_plus is 0 when the side bet is off;
  -- play is 0 until the player chooses 'play' on /decision (it equals ante).
  ante                BIGINT NOT NULL,
  pair_plus           BIGINT NOT NULL DEFAULT 0,
  play                BIGINT NOT NULL DEFAULT 0,
  -- The three player card indices (0..51), set at /deal.
  player_cards        JSONB NOT NULL,
  -- The three dealer card indices (0..51). Sealed at /deal; only meaningful for
  -- settlement / verify once the round is settled.
  dealer_cards        JSONB NOT NULL,
  -- 'play_win' | 'play_loss' | 'push' | 'dealer_no_qualify' | 'fold' on settle.
  result              TEXT,
  -- GROSS chips returned per bucket on settle (stake included).
  ante_payout         BIGINT NOT NULL DEFAULT 0,
  pairplus_payout     BIGINT NOT NULL DEFAULT 0,
  total_payout        BIGINT NOT NULL DEFAULT 0,
  -- TRUE when the player came out ahead (net > 0). Meaningless while active.
  won                 BOOLEAN NOT NULL DEFAULT FALSE,
  -- 'active' → dealt, awaiting decision; 'settled' → resolved.
  status              TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'settled')),
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_arcade_three_card_poker_rounds_wallet
  ON arcade_three_card_poker_rounds (wallet_address, created_at DESC);

-- A wallet can have at most one active hand at a time; prevents the UI from
-- orphaning a deal by starting a second hand on top of the first.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_arcade_three_card_poker_active_per_wallet
  ON arcade_three_card_poker_rounds (wallet_address)
  WHERE status = 'active';

COMMENT ON TABLE arcade_three_card_poker_rounds IS
  'MORBIUS Arcade Three Card Poker — one row per hand, stateful (deal → play/fold); provably fair via committed server seed.';
