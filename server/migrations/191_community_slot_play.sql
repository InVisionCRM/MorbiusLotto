-- 191_community_slot_play.sql — MORBlotto: server-authoritative play for
-- community slot machines (Phase 1 of real-money community slots).
--
-- Until now a community machine's spins were rolled in the browser against a
-- localStorage balance — fine for a toy, disqualifying for money. From this
-- migration on, a "server play" session rolls every spin server-side with the
-- same provably-fair commitment scheme as the instant arcade games
-- (arcade_seed_pairs, migration 173): the wallet's pre-committed seed pair is
-- consumed at a sequential nonce inside the same transaction that debits the
-- bet, and the spin — reel stops, cascades, wild placement, bonus outcome —
-- is derived entirely from that HMAC stream through the SAME cabinet-math
-- code the builder and the cabinets run (server/src/lib/vendor/cabinet-math.js).
--
-- Balances here are integer play credits for Phase 1. The columns are
-- NUMERIC(30,0) on purpose: Phase 3 re-denominates sessions into PRC-20 base
-- units (wei-scale), which overflow BIGINT, and nobody wants that migration.

-- Per-(machine, player) balance + persistent feature state (sticky wilds,
-- walking wilds survive across spins, exactly as the builder plays them).
CREATE TABLE IF NOT EXISTS community_slot_sessions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id     UUID NOT NULL REFERENCES community_slot_machines(id) ON DELETE CASCADE,
  player_address VARCHAR(42) NOT NULL,
  balance        NUMERIC(30,0) NOT NULL,
  feature_state  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (machine_id, player_address)
);

CREATE INDEX IF NOT EXISTS idx_community_slot_sessions_player
  ON community_slot_sessions (player_address);

-- One row per spin: the amounts and the seed recipe. The full step-by-step
-- result is NOT stored — it re-derives exactly from (server_seed, client_seed,
-- nonce, def version), which is the entire point of provably-fair.
CREATE TABLE IF NOT EXISTS community_slot_spins (
  id               UUID PRIMARY KEY,
  machine_id       UUID NOT NULL REFERENCES community_slot_machines(id) ON DELETE CASCADE,
  session_id       UUID NOT NULL REFERENCES community_slot_sessions(id) ON DELETE CASCADE,
  player_address   VARCHAR(42) NOT NULL,

  bet              NUMERIC(30,0) NOT NULL,
  -- GROSS credits returned for the whole round, bonus included, win cap applied.
  payout           NUMERIC(30,0) NOT NULL DEFAULT 0,
  base_payout      NUMERIC(30,0) NOT NULL DEFAULT 0,
  bonus_kind       VARCHAR(16),
  bonus_payout     NUMERIC(30,0) NOT NULL DEFAULT 0,

  scatter          SMALLINT NOT NULL DEFAULT 0,
  chain            SMALLINT NOT NULL DEFAULT 0,
  slam             SMALLINT NOT NULL DEFAULT 1,

  -- Reproduction recipe. draws = how many 4-byte HMAC floats the whole round
  -- consumed (base spin + bonus), so a verifier knows the stream length.
  -- def_version pins WHICH revision of the machine's def rolled this spin —
  -- creators can edit their machines, and verification must replay history,
  -- not the current draft.
  seed_pair_id     UUID,
  server_seed_hash TEXT NOT NULL,
  client_seed      TEXT NOT NULL,
  nonce            INTEGER NOT NULL,
  draws            INTEGER NOT NULL,
  def_version      INTEGER NOT NULL,
  -- Feature state AS IT STOOD when the spin started. Sticky/walking-wild
  -- machines mutate state across spins, so re-deriving spin N needs the state
  -- spin N-1 left behind — without this a verifier could only replay whole
  -- sessions from the first spin.
  feature_state_before JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_slot_spins_machine
  ON community_slot_spins (machine_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_slot_spins_player
  ON community_slot_spins (player_address, created_at DESC);

-- Def history: one row per revision of a machine's definition. Written on
-- create and on every update, so a spin's def_version always resolves to the
-- exact math that rolled it even after the creator edits the machine.
CREATE TABLE IF NOT EXISTS community_slot_machine_defs (
  machine_id  UUID NOT NULL REFERENCES community_slot_machines(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  machine_def JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (machine_id, version)
);

-- Current def revision + the per-spin payout ceiling (industry-standard
-- "max win 5000× bet" cap; makes worst-case exposure exact for the Phase 3
-- bankroll/solvency rules and tames unbounded cascade-ladder corners now).
ALTER TABLE community_slot_machines
  ADD COLUMN IF NOT EXISTS def_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE community_slot_machines
  ADD COLUMN IF NOT EXISTS win_cap_x INTEGER NOT NULL DEFAULT 5000;

COMMENT ON TABLE community_slot_sessions IS
  'Server-authoritative play sessions for community slot machines — integer play credits in Phase 1, PRC-20 base units from Phase 3.';
COMMENT ON TABLE community_slot_spins IS
  'One row per server-rolled spin: amounts + the provably-fair seed recipe. Result re-derives from the recipe; it is not stored.';
COMMENT ON TABLE community_slot_machine_defs IS
  'Immutable def revisions so historical spins verify against the math that actually rolled them.';
COMMENT ON COLUMN community_slot_spins.draws IS
  'Number of 4-byte HMAC floats consumed by the whole round (stops, cascade refills, wild placement, bonus rolls).';
