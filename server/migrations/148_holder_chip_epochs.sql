-- Migration 148: Holder & LP chip-reward epochs (replaces merkle drops at the runtime layer).
--
-- Model: each epoch snapshots one cohort (MORBIUS holders OR LP holders), then
-- credits chips directly to player_poker_chips via the existing poker_chip_ledger.
-- No merkle tree, no on-chain claim — the 1.25% / 1.5% MORBIUS that accumulates in
-- the MerkleClaim* contracts is rescued by the owner, sent to the hot wallet, and
-- mirrored as off-chain chips here (1 chip = 1 MORBIUS, per server/src/lib/poker-chip-scale.ts).
--
-- The MerkleClaimMorbius / MerkleClaimLP contracts stay deployed as the on-chain
-- fee vault. Only the off-chain distribution logic changes.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- holder_chip_epochs
-- One row per epoch per cohort. Two cohorts run on independent epoch_number sequences.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holder_chip_epochs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort                TEXT NOT NULL,
  epoch_number          INT NOT NULL,
  snapshot_block        BIGINT,
  total_holders         INT NOT NULL DEFAULT 0,
  total_basis_wei       NUMERIC(78, 0) NOT NULL DEFAULT 0,   -- sum of holder basis at snapshot (MORBIUS wei or LP MORBIUS-equivalent wei)
  morbius_pool_wei      NUMERIC(78, 0) NOT NULL DEFAULT 0,   -- MORBIUS rescued from MerkleClaim vault → backs the chip credits 1:1
  total_chips_credited  NUMERIC(78, 0) NOT NULL DEFAULT 0,   -- sum of credit deltas posted to player_poker_chips (whole chips)
  rescue_tx_hash        TEXT,                                 -- on-chain tx: MerkleClaim → owner (must be set before status=credited)
  topup_tx_hash         TEXT,                                 -- on-chain tx: owner → hot wallet (must be set before status=credited)
  min_holding_threshold NUMERIC NOT NULL DEFAULT 0,          -- plain MORBIUS units (e.g. 1000 for morbius cohort, 0 for lp)
  status                TEXT NOT NULL DEFAULT 'pending',
  cron_triggered        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot_at           TIMESTAMPTZ,
  credited_at           TIMESTAMPTZ,

  CONSTRAINT holder_chip_epochs_cohort_check
    CHECK (cohort IN ('morbius', 'lp')),
  CONSTRAINT holder_chip_epochs_status_check
    CHECK (status IN ('pending', 'snapshot', 'credited')),
  CONSTRAINT holder_chip_epochs_epoch_unique
    UNIQUE (cohort, epoch_number),
  -- Fail-fast: a 'credited' epoch must have both on-chain legs recorded.
  CONSTRAINT holder_chip_epochs_credited_has_tx
    CHECK (
      status <> 'credited'
      OR (rescue_tx_hash IS NOT NULL AND topup_tx_hash IS NOT NULL AND credited_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_holder_chip_epochs_cohort_status
  ON holder_chip_epochs (cohort, status, epoch_number DESC);

CREATE INDEX IF NOT EXISTS idx_holder_chip_epochs_created
  ON holder_chip_epochs (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- holder_chip_credits
-- One row per (epoch, wallet). Stores the snapshot basis and the chip credit posted.
-- ledger_id back-links to the immutable poker_chip_ledger row for full audit.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS holder_chip_credits (
  id              SERIAL PRIMARY KEY,
  epoch_id        UUID NOT NULL REFERENCES holder_chip_epochs(id) ON DELETE CASCADE,
  wallet_address  VARCHAR(42) NOT NULL,
  basis_wei       NUMERIC(78, 0) NOT NULL DEFAULT 0,   -- holder's MORBIUS (or LP MORBIUS-equivalent) wei at snapshot
  chips_credited  NUMERIC(78, 0) NOT NULL DEFAULT 0,   -- whole chips delta written to ledger
  ledger_id       UUID REFERENCES poker_chip_ledger(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT holder_chip_credits_wallet_lower
    CHECK (wallet_address = LOWER(wallet_address)),
  CONSTRAINT holder_chip_credits_nonneg
    CHECK (basis_wei >= 0 AND chips_credited >= 0),
  CONSTRAINT holder_chip_credits_epoch_wallet_unique
    UNIQUE (epoch_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_holder_chip_credits_wallet
  ON holder_chip_credits (wallet_address, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_holder_chip_credits_epoch
  ON holder_chip_credits (epoch_id);

COMMENT ON TABLE holder_chip_epochs IS
  'Chip-reward epochs for MORBIUS / LP holders. Replaces merkle_epochs + merkle_lp_epochs at the runtime layer.';
COMMENT ON COLUMN holder_chip_epochs.morbius_pool_wei IS
  'MORBIUS wei rescued from the MerkleClaim vault for this epoch. Backs chips_credited 1:1 (1 chip = 10^18 wei).';
COMMENT ON COLUMN holder_chip_epochs.rescue_tx_hash IS
  'PulseChain tx hash: rescue from MerkleClaim contract → owner wallet.';
COMMENT ON COLUMN holder_chip_epochs.topup_tx_hash IS
  'PulseChain tx hash: owner wallet → hot wallet (0x8f6Dc8FD8A5115fdec3CCbE36BE6cf9B28635F2e).';

COMMENT ON TABLE holder_chip_credits IS
  'Per-wallet chip credits applied during a holder/LP epoch. ledger_id back-links to poker_chip_ledger.';

COMMIT;
