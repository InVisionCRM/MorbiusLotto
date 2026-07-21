-- 172_arcade_pai_gow_poker.sql — MORBIUS Arcade: Pai Gow Poker rounds.
--
-- Two-step session game (mirrors Three Card Poker / Chicken): /deal INSERTs a
-- status='active' row and debits the whole bet; /decision records the player's
-- chosen split, sets the dealer by the house way, settles to 'settled' and
-- credits the payout. The deck (and therefore the dealer's hand + server seed)
-- stays sealed behind server_seed_hash until the hand settles.
--
-- Cards are stored as deck indices 0..51 (rank = idx%13 + 2, suit = idx/13),
-- the shared provably-fair encoding. Player = deck[0..6], dealer = deck[7..13].

CREATE TABLE IF NOT EXISTS arcade_pai_gow_poker_rounds (
  id                UUID PRIMARY KEY,
  wallet_address    VARCHAR(42) NOT NULL,
  bet               BIGINT NOT NULL,

  -- Dealt hands (7 indices each), fixed at /deal.
  player_cards      JSONB NOT NULL,
  dealer_cards      JSONB NOT NULL,

  -- Chosen / house-way splits (indices), filled at /decision.
  player_low        JSONB,   -- 2 cards
  player_high       JSONB,   -- 5 cards
  dealer_low        JSONB,   -- 2 cards (dealer house way)
  dealer_high       JSONB,   -- 5 cards

  result            TEXT CHECK (result IS NULL OR result IN ('win', 'push', 'loss')),
  total_payout      BIGINT NOT NULL DEFAULT 0,
  won               BOOLEAN NOT NULL DEFAULT FALSE,

  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'settled')),

  -- Provably-fair commitment. server_seed is committed as its hash at /deal and
  -- only revealed at settle.
  server_seed       TEXT NOT NULL,
  server_seed_hash  TEXT NOT NULL,
  client_seed       TEXT NOT NULL,
  nonce             INTEGER NOT NULL DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at        TIMESTAMPTZ
);

-- Caller history + recent feeds order by wallet then time.
CREATE INDEX IF NOT EXISTS idx_arcade_pai_gow_poker_rounds_wallet
  ON arcade_pai_gow_poker_rounds (wallet_address, created_at DESC);

-- Recent/leaderboard scans over settled rows.
CREATE INDEX IF NOT EXISTS idx_arcade_pai_gow_poker_rounds_settled
  ON arcade_pai_gow_poker_rounds (created_at DESC)
  WHERE status = 'settled';

-- At most one active (dealt, unsettled) hand per wallet — the DB backstop for
-- the row-lock in /decision, so a double-tapped /deal can't double-spend.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_arcade_pai_gow_poker_active_per_wallet
  ON arcade_pai_gow_poker_rounds (wallet_address)
  WHERE status = 'active';

COMMENT ON TABLE arcade_pai_gow_poker_rounds IS
  'MORBIUS Arcade Pai Gow Poker rounds. Cards are deck indices 0..51; player=deck[0..6], dealer=deck[7..13]. Win both hands = 1:1 minus 5% commission, win one = push, lose both = loss; copies go to the dealer.';
