-- Store the on-chain tx hash for completed withdrawals (set via /api/withdraw/confirm).
-- Also allow nullable block_number on player_deposits for client-notified deposits.
SET lock_timeout = '3s';
SET statement_timeout = '10s';

ALTER TABLE pending_withdrawals
  ADD COLUMN IF NOT EXISTS tx_hash TEXT;

-- Allow client-notified deposits to omit block_number (chain scan will have it; client won't)
ALTER TABLE player_deposits
  ALTER COLUMN block_number DROP NOT NULL;
