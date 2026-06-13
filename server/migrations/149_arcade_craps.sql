-- 149_arcade_craps.sql — MORBIUS Arcade: Craps (provably-fair multi-roll session).
--
-- Unlike the single-roll arcade games (Dice/Limbo/HiLo), a craps shooter session
-- can span many dice throws before resolving (come-out → point established →
-- many non-decisive rolls → 7-out or point hit). One serverSeed/clientSeed pair
-- covers the whole session; each roll consumes a monotonically-increasing
-- `nonce`. Both dice for a single roll come from the same nonce — die1 at
-- cursor 0 and die2 at cursor 4 of the HMAC byte stream.
--
-- Seed lifecycle (mirrors poker_hand_pending_seeds in CLAUDE.md):
--   * Session created → serverSeed generated, SHA-256 commitment published to
--     client. Plaintext lives in arcade_craps_session_pending_seeds until close
--     or rotation.
--   * Session closed or seed rotated → plaintext serverSeed moves to
--     arcade_craps_sessions.server_seed_revealed; the pending-seeds row is
--     deleted; a new serverSeed+commitment is issued if the session continues.
--   * /verify/:sessionId returns server_seed_revealed (or null while active)
--     plus every roll so anyone can re-derive the sequence.
--
-- Bankroll is the player's poker_chips balance (read live via
-- applyPokerChipDelta / getPokerChipBalance). The session row only tracks
-- per-zone open bets, phase, point, and seed state.

CREATE TABLE IF NOT EXISTS arcade_craps_sessions (
  id                   UUID PRIMARY KEY,
  -- Wallet is required — every chip move debits / credits this address.
  wallet_address       VARCHAR(42) NOT NULL,
  server_seed_hash     TEXT NOT NULL,
  -- Filled when the seed is rotated or the session closes. NULL while live.
  server_seed_revealed TEXT,
  client_seed          TEXT NOT NULL,
  -- Next roll's nonce. Starts at 0; incremented after every persisted roll.
  nonce_counter        INTEGER NOT NULL DEFAULT 0,
  phase                VARCHAR(16) NOT NULL DEFAULT 'COME_OUT',
  point                SMALLINT,
  bets                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  status               VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at            TIMESTAMPTZ,
  CONSTRAINT arcade_craps_sessions_phase_chk
    CHECK (phase IN ('COME_OUT', 'POINT')),
  CONSTRAINT arcade_craps_sessions_status_chk
    CHECK (status IN ('active', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_arcade_craps_sessions_wallet
  ON arcade_craps_sessions (wallet_address, created_at DESC);

-- Plaintext serverSeed hidden during active play. One row per active session.
CREATE TABLE IF NOT EXISTS arcade_craps_session_pending_seeds (
  session_id  UUID PRIMARY KEY
    REFERENCES arcade_craps_sessions(id) ON DELETE CASCADE,
  server_seed TEXT NOT NULL
);

-- Full roll history. (session_id, nonce) uniquely identifies a throw and is
-- what the verifier reproduces from the revealed seed.
CREATE TABLE IF NOT EXISTS arcade_craps_rolls (
  id            UUID PRIMARY KEY,
  session_id    UUID NOT NULL
    REFERENCES arcade_craps_sessions(id) ON DELETE CASCADE,
  nonce         INTEGER NOT NULL,
  die1          SMALLINT NOT NULL,
  die2          SMALLINT NOT NULL,
  sum           SMALLINT NOT NULL,
  phase_before  VARCHAR(16) NOT NULL,
  phase_after   VARCHAR(16) NOT NULL,
  point_before  SMALLINT,
  point_after   SMALLINT,
  wins          BIGINT NOT NULL,
  losses        BIGINT NOT NULL,
  is_point      BOOLEAN NOT NULL DEFAULT FALSE,
  is_seven_out  BOOLEAN NOT NULL DEFAULT FALSE,
  bets_before   JSONB NOT NULL,
  bets_after    JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, nonce)
);

CREATE INDEX IF NOT EXISTS idx_arcade_craps_rolls_session
  ON arcade_craps_rolls (session_id, nonce);

COMMENT ON TABLE arcade_craps_sessions IS
  'MORBIUS Arcade Craps — one row per shooter session; commitment lives here, plaintext seed in arcade_craps_session_pending_seeds until reveal.';
COMMENT ON TABLE arcade_craps_session_pending_seeds IS
  'Plaintext serverSeed hidden during active play; revealed and deleted on rotation or close.';
COMMENT ON TABLE arcade_craps_rolls IS
  'Per-throw history. (session_id, nonce) is the recipe input the verifier reproduces.';
