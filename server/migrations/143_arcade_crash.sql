-- 143_arcade_crash.sql — MORBIUS Arcade: Crash.
--
-- One row per round. The crash point is committed at play time via the
-- provably-fair HMAC pipeline (server_seed_hash published, server_seed
-- revealed by the verify endpoint) so anyone can recompute the exact crash
-- multiplier independently and confirm it wasn't moved after the bet was
-- placed.
--
-- Crash is an instant-settlement game (like Limbo): the round is fully
-- resolved in a single atomic transaction — no stateful pick/cashout flow.
-- The player optionally sets an auto_cashout_x100 target; if the crash point
-- >= auto_cashout_x100 the player wins at that multiplier, otherwise they
-- lose the bet.

CREATE TABLE IF NOT EXISTS arcade_crash_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  -- Optional auto-cashout the player set, ×100 (e.g. 200 = 2.00x).
  -- NULL means the player watched with no target set, i.e. instant bust.
  auto_cashout_x100   INTEGER,
  -- Provably-fair crash point, ×100 (e.g. 347 = 3.47x, 100 = 1.00x).
  crash_x100          INTEGER NOT NULL,
  -- Multiplier the player cashed out at, ×100. Equal to auto_cashout_x100
  -- when won, equal to crash_x100 when lost (for the verify receipt). NULL
  -- when auto_cashout_x100 was NULL and player didn't set a target.
  cashout_x100        INTEGER,
  won                 BOOLEAN NOT NULL,
  payout              BIGINT NOT NULL DEFAULT 0,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  house_edge_bp       INTEGER NOT NULL DEFAULT 100,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_arcade_crash_rounds_wallet
  ON arcade_crash_rounds (wallet_address, created_at DESC);

COMMENT ON TABLE arcade_crash_rounds IS
  'MORBIUS Arcade Crash — one row per round; crash point committed and revealed for provably-fair verification.';
