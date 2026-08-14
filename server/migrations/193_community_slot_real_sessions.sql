-- 193_community_slot_real_sessions.sql — MORBlotto: real-money sessions for
-- community slot machines (Phase 3 of real-money community slots).
--
-- The denomination trick that makes this safe: SPINS STAY IN INTEGER CREDITS.
-- The cabinet math (and its float payout arithmetic) never touches wei-scale
-- numbers — a machine defines a credit_value (token base units per credit,
-- fixed alongside the token), deposits convert base units → credits at the
-- door, cashouts convert credits → base units on the way out, and every
-- number the math sees stays comfortably inside float53. A real spin settles
-- player ↔ bankroll symmetrically: the player's session loses the bet and
-- gains the payout in credits, the bankroll gains/loses the same amounts in
-- base units (× credit_value), all in one transaction.
--
-- Player money and house money share the machine's escrow pool (the vault);
-- these ledgers keep them separate. The creator's withdrawable bankroll never
-- includes player balances, so a full bankroll withdrawal can never touch a
-- player's funds.

-- Base units per credit. Set with the token (default: 0.001 token per
-- credit), locked once the machine has any verified deposit.
ALTER TABLE community_slot_machines
  ADD COLUMN IF NOT EXISTS credit_value NUMERIC(78,0);

-- A player can now hold TWO sessions per machine: the free play-credits one
-- (real = false, Phase 1 behavior unchanged) and a real-money one.
ALTER TABLE community_slot_sessions
  ADD COLUMN IF NOT EXISTS real BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE community_slot_sessions
  DROP CONSTRAINT IF EXISTS community_slot_sessions_machine_id_player_address_key;
ALTER TABLE community_slot_sessions
  ADD CONSTRAINT community_slot_sessions_machine_player_real_key
  UNIQUE (machine_id, player_address, real);

-- Player money movements, append-only — the player-side mirror of
-- community_slot_bankroll_events. Deposits are on-chain-verified
-- PrizePoolAdded events into the machine's pool; cashouts are authorized-key
-- escrow payouts. base_units and credits record both sides of the
-- conversion, so the ledger audits without re-deriving credit_value history.
CREATE TABLE IF NOT EXISTS community_slot_player_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id     UUID NOT NULL REFERENCES community_slot_machines(id) ON DELETE CASCADE,
  session_id     UUID NOT NULL REFERENCES community_slot_sessions(id) ON DELETE CASCADE,
  player_address VARCHAR(42) NOT NULL,
  kind           VARCHAR(16) NOT NULL,
  base_units     NUMERIC(78,0) NOT NULL,
  credits        NUMERIC(30,0) NOT NULL,
  -- deposit: the player's verified addToPrizePool tx. cashout: the escrow
  -- payout tx (backfilled after the send).
  tx_hash        VARCHAR(66),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT community_slot_player_events_kind_chk
    CHECK (kind IN ('deposit', 'cashout')),
  CONSTRAINT community_slot_player_events_amounts_chk
    CHECK (base_units > 0 AND credits > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_community_slot_player_deposit_tx
  ON community_slot_player_events (tx_hash)
  WHERE kind = 'deposit' AND tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_community_slot_player_events_machine
  ON community_slot_player_events (machine_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_slot_player_events_player
  ON community_slot_player_events (player_address, created_at DESC);

COMMENT ON COLUMN community_slot_machines.credit_value IS
  'Token base units per spin credit. Spins stay integer-credit; deposits/cashouts convert at this fixed rate. Locked once funded.';
COMMENT ON TABLE community_slot_player_events IS
  'Append-only player money movements: chain-verified deposits in, authorized-key escrow cashouts out, with both base-unit and credit amounts.';
