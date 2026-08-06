-- 188_uth_multi_tables.sql — MORBlotto: multiplayer Ultimate Texas Hold'em.
--
-- The third shared table, and its shape is a third one again:
--
--   * Craps has no acting player — everyone bets, one throw settles all.
--   * Blackjack is strictly turn-based — one player acts, the rest wait.
--   * Ultimate Hold'em is in between. Every seat plays its OWN hand against the
--     same dealer, on the SAME five community cards, and each seat's decision
--     is independent of the others'. Nobody waits for a turn; they simply have
--     their own clock on each street.
--
-- That middle shape is why the round lives here rather than per seat: the board
-- and the dealer's hole cards belong to the table and every seat is measured
-- against them, but the money and the Play decision belong to the seat.
--
-- Money is whole chips (poker_chips), like the solo game.

CREATE TABLE IF NOT EXISTS uth_multi_tables (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'waiting'  — nobody seated
  -- 'betting'  — antes may be posted
  -- 'dealing'  — a round is live; the street machine drives it
  status               VARCHAR(16) NOT NULL DEFAULT 'waiting',

  min_bet              BIGINT NOT NULL DEFAULT 100,
  max_bet              BIGINT NOT NULL DEFAULT 5000,

  -- Provably fair, same epoch scheme as the craps tables so one set of helpers
  -- serves both: commitment here, plaintext in the pending table until rotation,
  -- retired epochs archived so an old round never becomes unverifiable.
  server_seed_hash     TEXT NOT NULL,
  nonce_counter        INTEGER NOT NULL DEFAULT 0,
  seed_epoch           INTEGER NOT NULL DEFAULT 0,

  betting_started_at   TIMESTAMPTZ,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uth_multi_tables_status_chk
    CHECK (status IN ('waiting', 'betting', 'dealing')),
  CONSTRAINT uth_multi_tables_limits_chk
    CHECK (min_bet > 0 AND max_bet >= min_bet)
);

CREATE TABLE IF NOT EXISTS uth_multi_table_pending_seeds (
  table_id    UUID PRIMARY KEY REFERENCES uth_multi_tables(id) ON DELETE CASCADE,
  server_seed TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS uth_multi_revealed_seeds (
  table_id         UUID NOT NULL REFERENCES uth_multi_tables(id) ON DELETE CASCADE,
  seed_epoch       INTEGER NOT NULL,
  server_seed      TEXT NOT NULL,
  server_seed_hash TEXT NOT NULL,
  revealed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (table_id, seed_epoch)
);

CREATE TABLE IF NOT EXISTS uth_multi_seats (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id             UUID NOT NULL REFERENCES uth_multi_tables(id) ON DELETE CASCADE,
  position             SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 5),
  player_address       VARCHAR(42) NOT NULL,

  status               VARCHAR(16) NOT NULL DEFAULT 'active',

  -- The ante staged for the NEXT round. Unlike craps (where chips are live on
  -- the felt the moment they are placed), a Hold'em ante only becomes a wager
  -- when the round actually deals — so it is staged here and debited at deal.
  pending_ante         BIGINT NOT NULL DEFAULT 0,
  pending_trips        BIGINT NOT NULL DEFAULT 0,

  client_seed          TEXT NOT NULL,
  consecutive_timeouts INTEGER NOT NULL DEFAULT 0,
  joined_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uth_multi_seats_status_chk
    CHECK (status IN ('active', 'sitting_out')),
  UNIQUE (table_id, position),
  UNIQUE (table_id, player_address)
);

CREATE INDEX IF NOT EXISTS idx_uth_multi_seats_table ON uth_multi_seats (table_id);

-- One row per dealt round. The board and the dealer belong to the table.
CREATE TABLE IF NOT EXISTS uth_multi_rounds (
  id                UUID PRIMARY KEY,
  table_id          UUID NOT NULL REFERENCES uth_multi_tables(id) ON DELETE CASCADE,
  round_number      INTEGER NOT NULL,

  seed_epoch        INTEGER NOT NULL,
  nonce             INTEGER NOT NULL,

  -- 'preflop' | 'flop' | 'river' | 'settled'. Every seat is on the same street;
  -- what differs is whether that seat has already committed its Play bet.
  stage             VARCHAR(16) NOT NULL DEFAULT 'preflop',

  -- Full five-card board and the dealer's two, dealt up front from the sealed
  -- deck and revealed progressively. Storing them at deal time is what makes
  -- the round verifiable: nothing is chosen in response to how anyone bets.
  board             SMALLINT[] NOT NULL,
  dealer_cards      SMALLINT[] NOT NULL,

  -- Clock for the current street.
  street_started_at TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at        TIMESTAMPTZ,

  CONSTRAINT uth_multi_rounds_stage_chk
    CHECK (stage IN ('preflop', 'flop', 'river', 'settled')),
  UNIQUE (table_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_uth_multi_rounds_table
  ON uth_multi_rounds (table_id, created_at DESC);

-- Only one live round per table. Same partial-unique trick the solo arcade
-- games use to guarantee a single active hand per wallet.
CREATE UNIQUE INDEX IF NOT EXISTS idx_uth_multi_rounds_one_live
  ON uth_multi_rounds (table_id)
  WHERE stage <> 'settled';

-- One row per seat that was dealt into a round. This is where the money lives.
CREATE TABLE IF NOT EXISTS uth_multi_round_seats (
  round_id        UUID NOT NULL REFERENCES uth_multi_rounds(id) ON DELETE CASCADE,
  position        SMALLINT NOT NULL,
  player_address  VARCHAR(42) NOT NULL,

  hole_cards      SMALLINT[] NOT NULL,

  ante            BIGINT NOT NULL,
  blind           BIGINT NOT NULL,
  trips           BIGINT NOT NULL DEFAULT 0,
  play            BIGINT NOT NULL DEFAULT 0,

  -- NULL until this seat has acted on the current street; the street advances
  -- when every live seat has either bet Play or checked.
  acted_stage     VARCHAR(16),
  folded          BOOLEAN NOT NULL DEFAULT FALSE,

  -- Settlement, filled at showdown.
  result          VARCHAR(16),
  ante_payout     BIGINT NOT NULL DEFAULT 0,
  blind_payout    BIGINT NOT NULL DEFAULT 0,
  play_payout     BIGINT NOT NULL DEFAULT 0,
  trips_payout    BIGINT NOT NULL DEFAULT 0,
  total_payout    BIGINT NOT NULL DEFAULT 0,
  player_category VARCHAR(24),
  dealer_category VARCHAR(24),
  dealer_qualified BOOLEAN,

  PRIMARY KEY (round_id, position)
);

CREATE INDEX IF NOT EXISTS idx_uth_multi_round_seats_player
  ON uth_multi_round_seats (player_address);

COMMENT ON TABLE uth_multi_rounds IS
  'One dealt round. Board and dealer cards belong to the table; every seat plays its own hand against them.';
COMMENT ON COLUMN uth_multi_round_seats.acted_stage IS
  'The street this seat has already acted on. The table advances when every live seat has acted — nobody waits for a turn, they just have their own clock.';
