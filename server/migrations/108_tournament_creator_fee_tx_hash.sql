-- Capture the on-chain tx hash of the creator-fee payout so the creator dashboard can
-- surface a verifiable link / copyable hash. Set during distributePrizes Phase 2 when the
-- recipient address matches the tournament's creator. Null for off-chain (chip) tournaments.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS creator_fee_tx_hash TEXT DEFAULT NULL;

COMMENT ON COLUMN tournaments.creator_fee_tx_hash IS
  'Tx hash from sendEscrowPayout / sendMorbiusTournamentPayout for the creator-fee transfer.';
