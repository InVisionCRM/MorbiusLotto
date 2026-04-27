-- Per-winner on-chain payout tx hash. Set during distributePrizes Phase 2 for custom-token
-- (escrow) and on-chain Morbius tournaments. Null for chip/promo payouts that never touched chain.
-- Used by the results modal to render a "↗ tx" link so winners can verify the payout on-chain.

ALTER TABLE tournament_entries
  ADD COLUMN IF NOT EXISTS prize_payout_tx_hash TEXT DEFAULT NULL;

COMMENT ON COLUMN tournament_entries.prize_payout_tx_hash IS
  'Tx hash from sendEscrowPayout / sendMorbiusTournamentPayout. Null for off-chain payouts (chips/MORBIUS balance).';
