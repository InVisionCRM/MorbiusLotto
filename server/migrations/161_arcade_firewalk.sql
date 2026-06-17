-- 161_arcade_firewalk.sql — MORBIUS Arcade: Firewalk (provably-fair crossing).
--
-- One row per round. Stateful like Chicken (154_arcade_chicken.sql): the row is
-- INSERTED at /start with status='active', UPDATED on each /step (the position
-- advances by the chosen pace, the multiplier jumps to that rung of the ladder),
-- then FINAL-UPDATED to status='settled' on a crumbling stone (won=false), a
-- cash-out (won=true) or clearing the last stone (won=true). The server seed is
-- only revealed once the round is settled — that's what makes it verifiable.
--
-- crumble_stones is a JSON array of the stone indices (1-based, in [1, stones])
-- that crumble. Every stone in [1, stones] is rolled from the HMAC byte stream
-- at /start (see arcade-firewalk.ts → deriveCrumbleStones): stone S crumbles
-- when bytesToFloat(stream((S-1)*4)) >= p (the per-heat safe probability). The
-- set NEVER leaves the server while the round is active. position is the count
-- of stones crossed so far (0 = on the starting ledge); the player advances by
-- choosing a pace each step (hop 1 / leap 2 / bound 3) — every stone in the
-- chosen leap must be safe or the round busts.

CREATE TABLE IF NOT EXISTS arcade_firewalk_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  -- Crumble chance per stone is (outcomes - safe) / outcomes:
  -- low 2/25 (8%), med 17/100 (17%), high 3/10 (30%).
  heat                TEXT NOT NULL CHECK (heat IN ('low', 'med', 'high')),
  -- Stones crossed so far (0 = none / on the starting ledge). On a bust this is
  -- the stone the walker fell through.
  position            INTEGER NOT NULL DEFAULT 0,
  -- Stone indices (1-based) that crumble. Derived from the HMAC stream at
  -- /start; sealed (never sent to the client) until the round settles.
  crumble_stones      JSONB NOT NULL,
  -- Current ×100 multiplier (100 = 1.00x, the starting value before any step).
  multiplier_x100     INTEGER NOT NULL DEFAULT 100,
  -- 'active' → still crossing; 'settled' → finished (won says how it ended).
  status              TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'settled')),
  -- TRUE on cash-out or a full crossing; FALSE on a crumble. Meaningless while active.
  won                 BOOLEAN NOT NULL DEFAULT FALSE,
  -- Final payout in chips (0 while active and on bust; bet * multiplier on win).
  payout              BIGINT NOT NULL DEFAULT 0,
  server_seed         TEXT NOT NULL,
  server_seed_hash    TEXT NOT NULL,
  client_seed         TEXT NOT NULL,
  nonce               INTEGER NOT NULL DEFAULT 0,
  house_edge_bp       INTEGER NOT NULL DEFAULT 200,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_arcade_firewalk_rounds_wallet
  ON arcade_firewalk_rounds (wallet_address, created_at DESC);

-- A wallet can have at most one active round at a time; prevents the UI from
-- orphaning a bet by starting a second crossing on top of the first.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_arcade_firewalk_active_per_wallet
  ON arcade_firewalk_rounds (wallet_address)
  WHERE status = 'active';

COMMENT ON TABLE arcade_firewalk_rounds IS
  'MORBIUS Arcade Firewalk — one row per round, stateful via position/multiplier; provably fair via committed server seed.';
