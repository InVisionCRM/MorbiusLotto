-- Add expires_at for on-chain withdrawal deadline: server only refunds after this time.
-- Pending rows with expires_at NULL (legacy) are not selected by the new cron query.
SET lock_timeout = '3s';
SET statement_timeout = '10s';

ALTER TABLE pending_withdrawals
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pending_withdrawals_expires_at
  ON pending_withdrawals (status, expires_at)
  WHERE status = 'pending';
