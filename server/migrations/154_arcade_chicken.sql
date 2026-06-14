-- 154_arcade_chicken.sql — MORBIUS Arcade: Chicken (provably-fair lane crossing).
--
-- One row per round. Stateful like Towers (151_arcade_towers.sql): the row is
-- INSERTED at /start with status='active', UPDATED on each /step (lane advances,
-- multiplier compounds), then FINAL-UPDATED to status='settled' on a bumper
-- (won=false), a cash-out (won=true) or a full crossing of every lane
-- (won=true). The server seed is only revealed once the round is settled —
-- that's what makes the round verifiable.
--
-- bumper_lanes is a JSON array of the lane indices (0-based) that hide a bumper.
-- Every lane in [0, lanes) is rolled from the HMAC byte stream at /start (see
-- arcade-chicken.ts → deriveChickenBumpers): lane L is a bumper when
-- floor(bytesToFloat(stream(L*4)) * outcomes) < bumpers. The set NEVER leaves
-- the server while the round is active. lane is the count of lanes crossed so
-- far (0 = on the curb); on a bust it equals the bumper lane that caught the
-- chicken.

CREATE TABLE IF NOT EXISTS arcade_chicken_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  -- Bumper chance per lane is bumpers/outcomes: easy 1/10, medium 1/6, hard 3/10.
  difficulty          TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  -- Lanes crossed so far (0 = none / on the curb).
  lane                INTEGER NOT NULL DEFAULT 0,
  -- Lane indices (0-based) that hide a bumper. Derived from the HMAC stream at
  -- /start; sealed (never sent to the client) until the round settles.
  bumper_lanes        JSONB NOT NULL,
  -- Current ×100 multiplier (100 = 1.00x, the starting value before any step).
  multiplier_x100     INTEGER NOT NULL DEFAULT 100,
  -- 'active' → still crossing; 'settled' → finished (won says how it ended).
  status              TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'settled')),
  -- TRUE on cash-out or a full crossing; FALSE on a bumper. Meaningless while active.
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

CREATE INDEX IF NOT EXISTS idx_arcade_chicken_rounds_wallet
  ON arcade_chicken_rounds (wallet_address, created_at DESC);

-- A wallet can have at most one active round at a time; prevents the UI from
-- orphaning a bet by starting a second crossing on top of the first.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_arcade_chicken_active_per_wallet
  ON arcade_chicken_rounds (wallet_address)
  WHERE status = 'active';

COMMENT ON TABLE arcade_chicken_rounds IS
  'MORBIUS Arcade Chicken — one row per round, stateful via lane/multiplier; provably fair via committed server seed.';
