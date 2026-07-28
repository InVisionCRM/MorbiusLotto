-- 176_dashboard_indexes.sql
--
-- Indexes for the admin financial dashboard (/activity), which aggregates over
-- global time ranges ("everything in the last 24h/7d/30d") rather than per
-- wallet. The existing indexes all lead with a non-time column:
--   poker_chip_ledger  (wallet_address, created_at)  — wrong leading column
--   player_deposits    (LOWER(wallet_address), created_at)
--   hot_withdrawal_jobs(status, created_at) WHERE status IN (pending…) — partial
-- so a platform-wide window scan could not use any of them. The dashboard polls
-- every 30s, so without these it would repeatedly seq-scan the ledger.
--
-- Additive and idempotent: indexes only, no data or schema change.

CREATE INDEX IF NOT EXISTS idx_poker_chip_ledger_created
  ON poker_chip_ledger (created_at DESC);

-- Serves the reason-filtered aggregates (bets/payouts/rakeback/referral/drop)
-- that make up the financial summary.
CREATE INDEX IF NOT EXISTS idx_poker_chip_ledger_reason_created
  ON poker_chip_ledger (reason, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_player_deposits_created
  ON player_deposits (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hot_withdrawal_jobs_created
  ON hot_withdrawal_jobs (created_at DESC);
