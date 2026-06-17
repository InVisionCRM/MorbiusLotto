-- 162_arcade_heist.sql — MORBIUS Arcade: Heist (provably-fair vault cracking).
--
-- Push-your-luck pick-a-door (Mines/Towers family) themed as a vault heist. One
-- row per round. Stateful like Towers (151_arcade_towers.sql): the row is
-- INSERTED at /start with status='active' and the bet debited, UPDATED on each
-- /step (picks JSONB grows, room advances, multiplier compounds), then
-- FINAL-UPDATED to status='settled' on an alarm (won=false), an escape/cashout
-- (won=true) or a full clear of every room (won=true). The server seed is only
-- revealed once the round is settled — that's what makes the round verifiable.
--
-- alarm_doors is a JSON array of arrays — alarm_doors[r] is the sorted list of
-- door indices wired to the alarm in room r (Sneaky/Standard = 1 alarm of 3-4
-- doors, Daring = 2 alarms of 3 doors). All rooms are derived from the HMAC byte
-- stream at /start (see arcade-heist.ts → deriveAlarmDoors) and NEVER leave the
-- server while the round is active. picks is a chronological JSON array of the
-- door chosen in each room (picks[r] = door picked in room r; on a bust the last
-- entry is one of alarm_doors[room]).

CREATE TABLE IF NOT EXISTS arcade_heist_rounds (
  id                  UUID PRIMARY KEY,
  wallet_address      VARCHAR(42) NOT NULL,
  bet                 BIGINT NOT NULL,
  -- Sneaky = 4 doors / 1 alarm, Standard = 3 doors / 1 alarm, Daring = 3 doors / 2 alarms.
  difficulty          TEXT NOT NULL CHECK (difficulty IN ('sneaky', 'standard', 'daring')),
  -- Rooms cleared so far (0 = none; the difficulty's room count = full clear).
  room                INTEGER NOT NULL DEFAULT 0,
  -- One sorted alarm-door array per room. Derived from the HMAC stream at
  -- /start; sealed (never sent to the client) until the round settles.
  alarm_doors         JSONB NOT NULL,
  -- Chronological list of the door picked in each room (all safe while active;
  -- the final entry is an alarm door iff the round busted).
  picks               JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Current ×100 multiplier (100 = 1.00x, the starting value before any pick).
  multiplier_x100     INTEGER NOT NULL DEFAULT 100,
  -- 'active' → still cracking; 'settled' → finished (won says how it ended).
  status              TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'settled')),
  -- TRUE on escape or a full clear; FALSE on an alarm. Meaningless while active.
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

CREATE INDEX IF NOT EXISTS idx_arcade_heist_rounds_wallet
  ON arcade_heist_rounds (wallet_address, created_at DESC);

-- A wallet can have at most one active round at a time; this prevents the UI
-- from accidentally leaking chips by starting a second heist on top of the
-- first (which would orphan the original bet).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_arcade_heist_active_per_wallet
  ON arcade_heist_rounds (wallet_address)
  WHERE status = 'active';

COMMENT ON TABLE arcade_heist_rounds IS
  'MORBIUS Arcade Heist — one row per round, stateful via picks JSONB; provably fair via committed server seed.';
