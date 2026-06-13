-- 151_arcade_towers.sql — MORBIUS Arcade: Towers (provably-fair climbing game).
--
-- One row per round. Stateful like Mines (130_arcade_mines.sql): the row is
-- INSERTED at /start with status='active', UPDATED on each /pick (picks JSONB
-- grows, floor advances), then FINAL-UPDATED to status='settled' on a bomb
-- (won=false), a cash-out (won=true) or a full 8-floor climb (won=true). The
-- server seed is only revealed once the round is settled — that's what makes
-- the round verifiable.
--
-- bomb_positions is a JSON array of exactly 8 tile indices — one bomb per
-- floor, index f in [0, tiles) where tiles depends on the difficulty (easy 4,
-- medium 3, hard 2). All 8 are derived from the HMAC byte stream at /start
-- (see arcade-towers.ts → deriveTowersBombs) and NEVER leave the server while
-- the round is active. picks is a chronological JSON array of the tile chosen
-- on each floor (picks[f] = tile picked on floor f; on a bust the last entry
-- equals bomb_positions[floor]).

CREATE TABLE IF NOT EXISTS arcade_towers_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  -- Tiles per floor: easy = 4, medium = 3, hard = 2 (always 1 bomb per floor).
  difficulty          TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  -- Floors completed so far (0 = none; 8 = full climb).
  floor               INTEGER NOT NULL DEFAULT 0,
  -- Exactly 8 tile indices, one bomb per floor. Derived from the HMAC stream
  -- at /start; sealed (never sent to the client) until the round settles.
  bomb_positions      JSONB NOT NULL,
  -- Chronological list of the tile picked on each floor (all safe while
  -- active; the final entry is the bomb iff the round busted).
  picks               JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Current ×100 multiplier (100 = 1.00x, the starting value before any pick).
  multiplier_x100     INTEGER NOT NULL DEFAULT 100,
  -- 'active' → still climbing; 'settled' → finished (won says how it ended).
  status              TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'settled')),
  -- TRUE on cash-out or a full climb; FALSE on a bomb. Meaningless while active.
  won                 BOOLEAN NOT NULL DEFAULT FALSE,
  -- Final payout in chips (0 while active and on bust; bet * multiplier on win).
  payout              BIGINT NOT NULL DEFAULT 0,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  house_edge_bp       INTEGER NOT NULL DEFAULT 100,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_arcade_towers_rounds_wallet
  ON arcade_towers_rounds (wallet_address, created_at DESC);

-- A wallet can have at most one active round at a time; this prevents the UI
-- from accidentally leaking chips by starting a second climb on top of the
-- first (which would orphan the original bet).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_arcade_towers_active_per_wallet
  ON arcade_towers_rounds (wallet_address)
  WHERE status = 'active';

COMMENT ON TABLE arcade_towers_rounds IS
  'MORBIUS Arcade Towers — one row per round, stateful via picks JSONB; provably fair via committed server seed.';
