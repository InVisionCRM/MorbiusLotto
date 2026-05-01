-- Idempotent join for custom PRC-20 buy-in: one escrow deposit tx credits at most one entry.
ALTER TABLE tournament_entries
  ADD COLUMN IF NOT EXISTS escrow_join_tx_hash TEXT NULL;

COMMENT ON COLUMN tournament_entries.escrow_join_tx_hash IS
  'Verified TournamentPrizeEscrow addToPrizePool tx for custom-token buy-in poker joins; globally unique when set.';

CREATE UNIQUE INDEX IF NOT EXISTS tournament_entries_escrow_join_tx_unique
  ON tournament_entries (LOWER(escrow_join_tx_hash))
  WHERE escrow_join_tx_hash IS NOT NULL;
