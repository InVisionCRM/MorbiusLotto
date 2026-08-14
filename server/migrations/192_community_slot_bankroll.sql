-- 192_community_slot_bankroll.sql — MORBlotto: PRC-20 token config + creator
-- bankroll for community slot machines (Phase 2 of real-money community slots).
--
-- The creator picks the machine's betting token and funds its bankroll — the
-- house money that will pay winners once real-money sessions arrive (Phase 3).
-- Funding follows the poker tournament escrow pattern exactly: the creator
-- calls addToPrizePool(bytes32 poolId, token, amount) on the Tournament Prize
-- Escrow, where poolId = keccak256(machine UUID) (same derivation as
-- tournament-id-bytes32.ts), and the server verifies the PrizePoolAdded event
-- on-chain before crediting a single base unit — never the client's claims.
-- Withdrawals leave through the same authorized-key escrow payout the poker
-- prizes use (utils/escrow-payout.ts).
--
-- Amounts are token base units (wei-scale): NUMERIC(78,0) holds a full
-- uint256, because 18-decimal balances overflow BIGINT immediately.

ALTER TABLE community_slot_machines
  ADD COLUMN IF NOT EXISTS token_address    VARCHAR(42),
  ADD COLUMN IF NOT EXISTS token_decimals   SMALLINT,
  ADD COLUMN IF NOT EXISTS token_symbol     VARCHAR(32),
  ADD COLUMN IF NOT EXISTS token_name       VARCHAR(64),
  -- A deposit was observed delivering less than its PrizePoolAdded amount —
  -- the token skims transfers. Warn-only (per product decision): the machine
  -- keeps working, the creator and players see the badge.
  ADD COLUMN IF NOT EXISTS token_fee_warning BOOLEAN NOT NULL DEFAULT FALSE,
  -- Creator bankroll in token base units. The DB is the ledger; the escrow
  -- pool is the vault. Phase 3's solvency rules (effective max bet =
  -- bankroll / (10 × win cap)) price against this number.
  ADD COLUMN IF NOT EXISTS bankroll NUMERIC(78,0) NOT NULL DEFAULT 0;

-- Every bankroll movement, append-only. A deposit row's tx_hash is UNIQUE so
-- one on-chain transfer can never be credited twice (the poker join flow's
-- "already used to join" rule, as a constraint).
CREATE TABLE IF NOT EXISTS community_slot_bankroll_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id     UUID NOT NULL REFERENCES community_slot_machines(id) ON DELETE CASCADE,
  kind           VARCHAR(16) NOT NULL,
  actor_address  VARCHAR(42) NOT NULL,
  amount         NUMERIC(78,0) NOT NULL,
  -- deposit: the creator's addToPrizePool tx (verified). withdrawal: the
  -- escrow payout tx the server sent.
  tx_hash        VARCHAR(66),
  -- deposit only, best-effort: escrow balance delta across the tx block came
  -- up short of the event amount — fee-on-transfer detected.
  fee_detected   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT community_slot_bankroll_events_kind_chk
    CHECK (kind IN ('deposit', 'withdrawal')),
  CONSTRAINT community_slot_bankroll_events_amount_chk
    CHECK (amount > 0)
);

-- Partial unique index rather than a plain UNIQUE(tx_hash): withdrawal rows
-- are inserted before their payout tx exists (hash backfilled on success),
-- and only deposits need the one-credit-per-tx guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_slot_bankroll_deposit_tx
  ON community_slot_bankroll_events (tx_hash)
  WHERE kind = 'deposit' AND tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_community_slot_bankroll_events_machine
  ON community_slot_bankroll_events (machine_id, created_at DESC);

COMMENT ON COLUMN community_slot_machines.bankroll IS
  'Creator bankroll in token base units — the DB ledger over the machine''s escrow pool (poolId = keccak256(machine UUID) on the Tournament Prize Escrow).';
COMMENT ON TABLE community_slot_bankroll_events IS
  'Append-only bankroll movements. Deposits are on-chain-verified PrizePoolAdded events; withdrawals are authorized-key escrow payouts.';
