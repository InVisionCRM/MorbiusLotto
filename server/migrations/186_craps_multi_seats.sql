-- 186_craps_multi_seats.sql — seats at a multiplayer craps table.
--
-- Craps rails hold far more players than a blackjack table, and because nobody
-- takes turns, seat count costs nothing in pacing — eight seats all bet during
-- the same window and all settle on the same throw.
--
-- Unlike blackjack_multi_seats there is no `pending_bet`: craps chips are live
-- on the felt the moment they are placed (debited immediately, exactly like the
-- solo game), because a place bet legitimately survives many throws. `bets`
-- holds the same per-zone JSON shape the solo game stores in
-- arcade_craps_sessions.bets, so one evaluator serves both.

CREATE TABLE IF NOT EXISTS craps_multi_seats (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id             UUID NOT NULL REFERENCES craps_multi_tables(id) ON DELETE CASCADE,
  position             SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 7),
  player_address       VARCHAR(42) NOT NULL,

  status               VARCHAR(16) NOT NULL DEFAULT 'active',

  -- Live chips on the felt, per zone. Same shape as arcade_craps_sessions.bets.
  bets                 JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- This player's contribution to the fairness of any throw they shoot.
  client_seed          TEXT NOT NULL,

  -- Missed betting windows in a row while holding no bets. Kicked at the limit
  -- so a dead seat does not hold the rail.
  consecutive_timeouts INTEGER NOT NULL DEFAULT 0,

  joined_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT craps_multi_seats_status_chk
    CHECK (status IN ('active', 'sitting_out')),
  UNIQUE (table_id, position),
  UNIQUE (table_id, player_address)
);

CREATE INDEX IF NOT EXISTS idx_craps_multi_seats_table
  ON craps_multi_seats (table_id);
CREATE INDEX IF NOT EXISTS idx_craps_multi_seats_player
  ON craps_multi_seats (player_address);

COMMENT ON COLUMN craps_multi_seats.bets IS
  'Live chips on the felt — debited at placement, not staged. A place bet survives throws, which is why craps has no pending_bet column.';
COMMENT ON COLUMN craps_multi_seats.client_seed IS
  'Mixed into every throw this player shoots, so holding the dice genuinely changes the outcome.';
