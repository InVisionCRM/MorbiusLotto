-- Migration 043: Cumulative reward rollup for Merkle drop epochs
--
-- Adds tracking for:
--   - superseded_by_epoch_id: when a snapshot row's unclaimed rewards are rolled
--     into a newer epoch, this points to that epoch. The row is no longer claimable
--     on its own; the user should claim from the superseding epoch instead.
--   - claimed_at: future use — mark when a wallet confirms an on-chain claim.
--   - new_reward_amount: the freshly deposited MORBIUS for this epoch (admin deposits this).
--   - rollup_amount: the total unclaimed MORBIUS rolled up from prior epochs.
--     total_reward_amount = new_reward_amount + rollup_amount (sum of all Merkle leaves).

ALTER TABLE merkle_snapshots
  ADD COLUMN IF NOT EXISTS superseded_by_epoch_id INT REFERENCES merkle_epochs(id),
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

ALTER TABLE merkle_epochs
  ADD COLUMN IF NOT EXISTS new_reward_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rollup_amount NUMERIC DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_merkle_snapshots_superseded
  ON merkle_snapshots(superseded_by_epoch_id)
  WHERE superseded_by_epoch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_merkle_snapshots_claimable
  ON merkle_snapshots(epoch_id, wallet_address)
  WHERE superseded_by_epoch_id IS NULL AND claimed_at IS NULL;
