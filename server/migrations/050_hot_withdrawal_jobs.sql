-- Hot-wallet withdrawal queue: one row per withdrawal request.
-- Worker processes queued jobs one at a time (FOR UPDATE SKIP LOCKED).
-- Status: queued -> broadcasting -> pending_confirmation -> completed | failed
SET lock_timeout = '3s';
SET statement_timeout = '10s';

CREATE TABLE IF NOT EXISTS hot_withdrawal_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address    VARCHAR(42) NOT NULL,
  amount_wei        NUMERIC(78, 0) NOT NULL,
  net_to_user_wei   NUMERIC(78, 0) NOT NULL,
  fee_wei           NUMERIC(78, 0) NOT NULL DEFAULT 0,
  status            VARCHAR(32) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'broadcasting', 'pending_confirmation', 'completed', 'failed')),
  tx_hash           TEXT,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hot_withdrawal_jobs_status_created
  ON hot_withdrawal_jobs (status, created_at ASC)
  WHERE status IN ('queued', 'pending_confirmation');

CREATE INDEX IF NOT EXISTS idx_hot_withdrawal_jobs_wallet
  ON hot_withdrawal_jobs (LOWER(wallet_address), created_at DESC);
