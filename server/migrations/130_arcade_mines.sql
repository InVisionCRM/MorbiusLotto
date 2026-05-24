-- 130_arcade_mines.sql — MORBIUS Arcade: Mines (provably-fair grid game).
--
-- One row per round. Unlike Limbo (single-shot, settled at /play), Mines is
-- stateful: the row is INSERTED at /start with status='active', UPDATED on
-- each /pick (picks JSONB grows), then FINAL-UPDATED to 'cashed_out' or
-- 'busted' on /cashout or a bomb reveal. The server seed is only revealed
-- once the round is finalized — that's what makes the round verifiable.
--
-- bombs_grid is a sorted JSON array of 1..24 unique cell indices in [0,25),
-- derived from a Fisher-Yates partial shuffle over the HMAC byte stream
-- (see arcade-mines.ts → deriveBombGrid). picks is a chronological JSON array
-- of revealed cell indices (subset of [0,25) that does NOT intersect bombs_grid
-- while the round is active; on bust the last pick will be in bombs_grid).

CREATE TABLE IF NOT EXISTS arcade_mines_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  bombs               INTEGER NOT NULL,
  -- 1..24 unique cell indices, sorted ascending. Derived from the HMAC stream.
  bombs_grid          JSONB NOT NULL,
  -- Chronological list of revealed cell indices (all safe while active; the
  -- final entry is a bomb iff status = 'busted').
  picks               JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Current ×100 multiplier (100 = 1.00x, the starting value before any pick).
  multiplier_x100     INTEGER NOT NULL DEFAULT 100,
  -- 'active' → still picking; 'cashed_out' → player banked the win; 'busted'
  -- → revealed a bomb and lost the bet. Once final, no more updates.
  status              TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'cashed_out', 'busted')),
  -- Final payout in chips (0 while active and on bust; bet * multiplier on cashout).
  payout              BIGINT NOT NULL DEFAULT 0,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  house_edge_bp       INTEGER NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_arcade_mines_rounds_wallet
  ON arcade_mines_rounds (wallet_address, created_at DESC);

-- A wallet can have at most one active round at a time; this prevents the UI
-- from accidentally leaking chips by starting a second round on top of the
-- first (which would orphan the original bet).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_arcade_mines_active_per_wallet
  ON arcade_mines_rounds (wallet_address)
  WHERE status = 'active';

COMMENT ON TABLE arcade_mines_rounds IS
  'MORBIUS Arcade Mines — one row per round, stateful via picks JSONB; provably fair via committed server seed.';
