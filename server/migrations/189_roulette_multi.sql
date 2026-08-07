-- 189_roulette_multi.sql — MORBlotto: multiplayer roulette (shared wheel).
--
-- The fourth shared table, and the simplest of them. Its shape is craps
-- without the state machine:
--
--   * Craps carries a come-out/point cycle that survives throws, and a shooter
--     who holds the dice until they seven out. Roulette has neither. Every spin
--     is independent, the wheel remembers nothing, and no seat has a special
--     role in the outcome.
--   * Blackjack and Ultimate Hold'em deal each seat its own cards. Roulette
--     deals nothing — one pocket settles every bet on the felt at once.
--
-- So there is no phase, no point, and no shooter column here. What is left is
-- the part every shared table needs: a seed epoch, seats, and a per-spin record
-- split into what the wheel did and what it cost each player.
--
-- Money is whole chips (poker_chips), like the solo game, and the settlement
-- runs through the same resolveRoulettePayouts the solo game uses.
--
-- Provably fair: the TABLE holds the server seed and a SEAT supplies the client
-- seed, rotating spin to spin (see roulette_multi_tables.seed_position). Nobody
-- holds a wheel the way a shooter holds dice, so the contribution rotates
-- instead — every player at the table feeds the randomness in turn, and the
-- verifier can prove which one fed any given spin.

CREATE TABLE IF NOT EXISTS roulette_multi_tables (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'waiting'  — nobody seated
  -- 'betting'  — the window is open, chips can go down and come back up
  -- 'spinning' — window closed, the wheel is turning
  status               VARCHAR(16) NOT NULL DEFAULT 'waiting',

  -- Per-zone limits, read from the bet-limits registry at creation so an admin
  -- change never silently rewrites a live table's posted numbers.
  min_bet              BIGINT NOT NULL DEFAULT 5,
  max_bet              BIGINT NOT NULL DEFAULT 10000,
  -- A whole-felt ceiling as well as a per-zone one: roulette lets you cover
  -- nearly every pocket, and twenty maxed zones is a different exposure from
  -- one maxed zone.
  max_total_bet        BIGINT NOT NULL DEFAULT 50000,

  -- Commitment for the CURRENT seed epoch; the plaintext hides in
  -- roulette_multi_table_pending_seeds until the seed rotates.
  server_seed_hash     TEXT NOT NULL,
  nonce_counter        INTEGER NOT NULL DEFAULT 0,
  seed_epoch           INTEGER NOT NULL DEFAULT 0,

  -- Which seat's client seed feeds the NEXT spin. NULL when nobody is seated.
  seed_position        SMALLINT,

  betting_started_at   TIMESTAMPTZ,
  spin_started_at      TIMESTAMPTZ,

  theme_kind           VARCHAR(16) NOT NULL DEFAULT 'image',
  theme_id             VARCHAR(64) NOT NULL DEFAULT 'default',
  theme_config         JSONB,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT roulette_multi_tables_status_chk
    CHECK (status IN ('waiting', 'betting', 'spinning')),
  CONSTRAINT roulette_multi_tables_limits_chk
    CHECK (min_bet > 0 AND max_bet >= min_bet AND max_total_bet >= max_bet)
);

-- Plaintext server seed for the live epoch. Deleted and revealed on rotation.
CREATE TABLE IF NOT EXISTS roulette_multi_table_pending_seeds (
  table_id    UUID PRIMARY KEY REFERENCES roulette_multi_tables(id) ON DELETE CASCADE,
  server_seed TEXT NOT NULL
);

-- Retired epochs, so old spins stay verifiable forever even though the table
-- keeps running.
CREATE TABLE IF NOT EXISTS roulette_multi_revealed_seeds (
  table_id         UUID NOT NULL REFERENCES roulette_multi_tables(id) ON DELETE CASCADE,
  seed_epoch       INTEGER NOT NULL,
  server_seed      TEXT NOT NULL,
  server_seed_hash TEXT NOT NULL,
  revealed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (table_id, seed_epoch)
);

CREATE TABLE IF NOT EXISTS roulette_multi_seats (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id             UUID NOT NULL REFERENCES roulette_multi_tables(id) ON DELETE CASCADE,
  position             SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 7),
  player_address       VARCHAR(42) NOT NULL,

  status               VARCHAR(16) NOT NULL DEFAULT 'active',

  -- Chips on the felt for the CURRENT window, as the array shape the solo game
  -- already validates: [{ type, amount, numbers[] }]. An array rather than a
  -- keyed map because roulette zones are not a fixed set — a straight on 17 and
  -- a split on 17/18 are different bets that no single key could name.
  bets                 JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- This player's contribution to any spin made while it is their turn to feed
  -- the wheel.
  client_seed          TEXT NOT NULL,

  -- Betting windows missed in a row with nothing on the felt. Kicked at the
  -- limit so a dead seat does not hold a chair on a busy table.
  consecutive_timeouts INTEGER NOT NULL DEFAULT 0,

  joined_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT roulette_multi_seats_status_chk
    CHECK (status IN ('active', 'sitting_out')),
  UNIQUE (table_id, position),
  UNIQUE (table_id, player_address)
);

CREATE INDEX IF NOT EXISTS idx_roulette_multi_seats_table
  ON roulette_multi_seats (table_id);
CREATE INDEX IF NOT EXISTS idx_roulette_multi_seats_player
  ON roulette_multi_seats (player_address);

-- What the wheel did. One row per spin, table-wide, independent of anyone's
-- money — so "was the wheel honest?" can be answered without touching a single
-- player's row.
CREATE TABLE IF NOT EXISTS roulette_multi_spins (
  id                   UUID PRIMARY KEY,
  table_id             UUID NOT NULL REFERENCES roulette_multi_tables(id) ON DELETE CASCADE,

  -- Reproduction recipe: HMAC(server_seed of this epoch, seed_client_seed, nonce).
  seed_epoch           INTEGER NOT NULL,
  nonce                INTEGER NOT NULL,
  seed_position        SMALLINT,
  seed_address         VARCHAR(42),
  seed_client_seed     TEXT NOT NULL,

  -- The pocket, 0-36 (European single-zero).
  result               SMALLINT NOT NULL CHECK (result BETWEEN 0 AND 36),

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- A nonce is only unique within a seed epoch; together they identify a spin.
  UNIQUE (table_id, seed_epoch, nonce)
);

CREATE INDEX IF NOT EXISTS idx_roulette_multi_spins_table
  ON roulette_multi_spins (table_id, created_at DESC);

-- What it cost or paid each seat. One row per seat that had chips down.
CREATE TABLE IF NOT EXISTS roulette_multi_spin_seats (
  spin_id        UUID NOT NULL REFERENCES roulette_multi_spins(id) ON DELETE CASCADE,
  position       SMALLINT NOT NULL,
  player_address VARCHAR(42) NOT NULL,
  -- The bets exactly as they stood when the window closed, so a settled spin
  -- can be re-checked against what was actually on the felt.
  bets           JSONB NOT NULL,
  staked         BIGINT NOT NULL DEFAULT 0,
  -- GROSS chips returned (stake included), so wins - staked is the net.
  returned       BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (spin_id, position)
);

CREATE INDEX IF NOT EXISTS idx_roulette_multi_spin_seats_player
  ON roulette_multi_spin_seats (player_address);

COMMENT ON TABLE roulette_multi_tables IS
  'Multiplayer roulette: one row per shared wheel. No phase and no shooter — every spin is independent and one pocket settles every seat.';
COMMENT ON COLUMN roulette_multi_tables.seed_position IS
  'Whose client seed feeds the next spin. Rotates seat to seat, because no one holds a wheel the way a shooter holds dice.';
COMMENT ON COLUMN roulette_multi_seats.bets IS
  'Chips on the felt for the current window, in the solo game''s array shape so one validator and one evaluator serve both.';
COMMENT ON TABLE roulette_multi_spins IS
  'One row per spin — the pocket and the seed recipe, independent of anyone''s money.';
