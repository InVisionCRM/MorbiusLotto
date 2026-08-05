-- 187_craps_multi_rolls.sql — throw history at a shared craps table.
--
-- Two tables because a throw has two halves that are genuinely different:
--
--   craps_multi_rolls      — what the dice did. One row per throw. Table-wide:
--                            the dice, the phase transition, who shot, and the
--                            exact seed recipe needed to reproduce it.
--   craps_multi_roll_seats — what it cost or paid each player. One row per
--                            seat that had chips on the felt for that throw.
--
-- Keeping them apart is what lets the verifier answer "were the dice honest?"
-- (one row, no player data) separately from "was I paid correctly?" (your row).

CREATE TABLE IF NOT EXISTS craps_multi_rolls (
  id                   UUID PRIMARY KEY,
  table_id             UUID NOT NULL REFERENCES craps_multi_tables(id) ON DELETE CASCADE,

  -- Reproduction recipe: HMAC(server_seed of this epoch, shooter_client_seed, nonce).
  seed_epoch           INTEGER NOT NULL,
  nonce                INTEGER NOT NULL,
  shooter_position     SMALLINT,
  shooter_address      VARCHAR(42),
  shooter_client_seed  TEXT NOT NULL,

  die1                 SMALLINT NOT NULL,
  die2                 SMALLINT NOT NULL,
  sum                  SMALLINT NOT NULL,

  phase_before         VARCHAR(16) NOT NULL,
  phase_after          VARCHAR(16) NOT NULL,
  point_before         SMALLINT,
  point_after          SMALLINT,
  is_point             BOOLEAN NOT NULL DEFAULT FALSE,
  is_seven_out         BOOLEAN NOT NULL DEFAULT FALSE,

  -- Whether the dice passed to a new shooter on this throw.
  dice_passed          BOOLEAN NOT NULL DEFAULT FALSE,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A nonce is only unique within a seed epoch; together they identify a throw.
  UNIQUE (table_id, seed_epoch, nonce)
);

CREATE INDEX IF NOT EXISTS idx_craps_multi_rolls_table
  ON craps_multi_rolls (table_id, created_at DESC);

CREATE TABLE IF NOT EXISTS craps_multi_roll_seats (
  roll_id        UUID NOT NULL REFERENCES craps_multi_rolls(id) ON DELETE CASCADE,
  position       SMALLINT NOT NULL,
  player_address VARCHAR(42) NOT NULL,
  bets_before    JSONB NOT NULL,
  bets_after     JSONB NOT NULL,
  wins           BIGINT NOT NULL DEFAULT 0,
  losses         BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (roll_id, position)
);

CREATE INDEX IF NOT EXISTS idx_craps_multi_roll_seats_player
  ON craps_multi_roll_seats (player_address);

COMMENT ON TABLE craps_multi_rolls IS
  'One row per throw at a shared table — the dice and the phase change, independent of anyone''s money.';
COMMENT ON TABLE craps_multi_roll_seats IS
  'One row per seat with chips down for a throw. Every seat settles independently against the same dice.';
