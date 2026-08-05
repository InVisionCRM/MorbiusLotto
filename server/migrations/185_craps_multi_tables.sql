-- 185_craps_multi_tables.sql — MORBlotto: multiplayer craps (shared felt).
--
-- Why craps needs its own table shape rather than reusing blackjack_multi_*:
--
--   * Blackjack is turn-based. One player acts, everyone waits, the round ends.
--     Craps has no acting player — the whole table bets at once on the same
--     felt, and a single throw settles all of them independently.
--   * A blackjack round starts and finishes. The craps come-out/point cycle
--     survives across throws and across rounds; the point is TABLE state that
--     outlives any one roll.
--   * Craps has a shooter. The dice belong to one seat until they seven out,
--     then they pass. Blackjack has no equivalent.
--
-- Money is poker_chips, same as the solo game (applyPokerChipDelta). Amounts
-- here are whole chips (BIGINT), matching arcade_craps_* rather than the wei
-- NUMERIC(78,0) the blackjack multi tables use — the solo craps engine works in
-- whole chips and the multiplayer game runs the exact same evaluator.
--
-- Provably fair: the TABLE holds the server seed, the SHOOTER supplies the
-- client seed. That makes holding the dice mean something real — your seed is
-- genuinely mixed into every throw you make, and the verifier can prove it.

CREATE TABLE IF NOT EXISTS craps_multi_tables (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'waiting'  — nobody seated, or too few to run
  -- 'betting'  — betting window open, chips can be placed and picked up
  -- 'rolling'  — window closed, waiting on the shooter's throw
  status               VARCHAR(16) NOT NULL DEFAULT 'waiting',

  -- The shared come-out / point cycle. Survives every roll and every shooter
  -- change; only a seven-out or a made point resets it.
  phase                VARCHAR(16) NOT NULL DEFAULT 'COME_OUT',
  point                SMALLINT,

  -- Seat holding the dice. NULL when the table has no shooter yet.
  shooter_position     SMALLINT,

  -- Per-zone limits, read from the bet-limits registry at table creation so an
  -- admin change does not silently rewrite a live table's posted numbers.
  min_bet              BIGINT NOT NULL DEFAULT 5,
  max_bet              BIGINT NOT NULL DEFAULT 10000,

  -- Commitment for the CURRENT seed epoch. Plaintext hides in
  -- craps_multi_table_pending_seeds until the seed rotates.
  server_seed_hash     TEXT NOT NULL,
  -- Rolls are numbered within a seed epoch; the verifier replays
  -- (server_seed, shooter_client_seed, nonce) to reproduce any throw.
  nonce_counter        INTEGER NOT NULL DEFAULT 0,
  seed_epoch           INTEGER NOT NULL DEFAULT 0,

  betting_started_at   TIMESTAMPTZ,
  roll_started_at      TIMESTAMPTZ,

  theme_kind           VARCHAR(16) NOT NULL DEFAULT 'image',
  theme_id             VARCHAR(64) NOT NULL DEFAULT 'default',
  theme_config         JSONB,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT craps_multi_tables_status_chk
    CHECK (status IN ('waiting', 'betting', 'rolling')),
  CONSTRAINT craps_multi_tables_phase_chk
    CHECK (phase IN ('COME_OUT', 'POINT')),
  -- A point exists if and only if the table is in the POINT phase. This is the
  -- invariant the whole game rests on, so the database refuses to hold a
  -- come-out with a live point or a point phase without one.
  CONSTRAINT craps_multi_tables_point_chk
    CHECK ((phase = 'POINT' AND point IS NOT NULL) OR (phase = 'COME_OUT' AND point IS NULL)),
  CONSTRAINT craps_multi_tables_limits_chk
    CHECK (min_bet > 0 AND max_bet >= min_bet)
);

-- Plaintext server seed for the live epoch. Deleted and revealed on rotation.
CREATE TABLE IF NOT EXISTS craps_multi_table_pending_seeds (
  table_id    UUID PRIMARY KEY REFERENCES craps_multi_tables(id) ON DELETE CASCADE,
  server_seed TEXT NOT NULL
);

-- Revealed seeds, one row per retired epoch, so old rolls stay verifiable
-- forever even though the table keeps running.
CREATE TABLE IF NOT EXISTS craps_multi_revealed_seeds (
  table_id     UUID NOT NULL REFERENCES craps_multi_tables(id) ON DELETE CASCADE,
  seed_epoch   INTEGER NOT NULL,
  server_seed  TEXT NOT NULL,
  server_seed_hash TEXT NOT NULL,
  revealed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (table_id, seed_epoch)
);

COMMENT ON TABLE craps_multi_tables IS
  'Multiplayer craps: one row per shared felt. phase/point are table-wide; one throw settles every seat against them.';
COMMENT ON COLUMN craps_multi_tables.shooter_position IS
  'Seat holding the dice. Their client seed is mixed into every throw, so the role is real and verifiable, not cosmetic.';
COMMENT ON TABLE craps_multi_revealed_seeds IS
  'Retired seed epochs. A live table rotates its seed without ever going un-verifiable.';
