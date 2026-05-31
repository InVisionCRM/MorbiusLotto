-- 144_arcade_crash_v2.sql — MORBIUS Arcade: Crash (stateful rebuild).
--
-- Replaces the instant-settlement table from migration 143 with a proper
-- stateful schema. One row per round; the crash point is committed at /start
-- and revealed only after the round is finalized (cashed_out or crashed).
--
-- Flow:
--   POST /start   → INSERT status='active', debit bet, return serverSeedHash + startedAt
--   POST /cashout → server computes elapsed time → multiplierX100AtMs(elapsed)
--                   if multiplier >= crash_x100: crashed (no payout)
--                   else: cashed_out at that multiplier (credit payout)
--
-- A partial unique index ensures at most one active round per wallet so the
-- "you already have an active round" guard works at the DB level.

DROP TABLE IF EXISTS arcade_crash_rounds;

CREATE TABLE arcade_crash_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  -- Pre-determined crash point ×100 (e.g. 347 = 3.47×). Hidden from client
  -- until status changes from 'active'.
  crash_x100          INTEGER NOT NULL,
  -- Optional auto-cashout the player set ×100. If set the client fires
  -- /cashout when its animated counter reaches this value.
  auto_cashout_x100   INTEGER,
  -- Multiplier the player actually cashed out at ×100 (NULL if crashed).
  cashout_x100        INTEGER,
  -- 'active' | 'cashed_out' | 'crashed'
  status              VARCHAR(12) NOT NULL DEFAULT 'active',
  payout              BIGINT NOT NULL DEFAULT 0,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  house_edge_bp       INTEGER NOT NULL DEFAULT 100,
  -- Exact server-side start timestamp. Returned to the client so the
  -- animated counter syncs to the same origin the server uses on /cashout.
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active round per wallet at the DB level (defence-in-depth).
CREATE UNIQUE INDEX uniq_arcade_crash_active_per_wallet
  ON arcade_crash_rounds (wallet_address)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_arcade_crash_rounds_wallet
  ON arcade_crash_rounds (wallet_address, created_at DESC);

COMMENT ON TABLE arcade_crash_rounds IS
  'MORBIUS Arcade Crash — stateful round; crash point committed at start, revealed on finalize.';
