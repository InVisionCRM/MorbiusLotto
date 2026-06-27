-- Migration 168: weekly + monthly VIP cashback (claimable, tier-scaled).
--
-- Adds a claimable cashback on top of rakeback:
--   weekly  = weekly_cashback_bps  × your rolling 7-day wager, claimable once / 7 days
--   monthly = monthly_cashback_bps × your rolling 30-day wager, claimable once / 30 days
-- Both are paid in chips through the existing VIP claim flow (reasons
-- vip_weekly_bonus / vip_monthly_bonus). Rates are conservative bps of turnover
-- and fully runtime-tunable — adjust vip_tier_config and it takes effect at the
-- next claim. (1 bp = 0.01%.)

BEGIN;

ALTER TABLE vip_tier_config
  ADD COLUMN IF NOT EXISTS weekly_cashback_bps  INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_cashback_bps INT NOT NULL DEFAULT 0;

ALTER TABLE vip_tier_config
  ADD CONSTRAINT vip_tier_config_cashback_range
  CHECK (weekly_cashback_bps  BETWEEN 0 AND 10000
     AND monthly_cashback_bps BETWEEN 0 AND 10000);

-- Seed conservative tier-scaled rates.
UPDATE vip_tier_config SET weekly_cashback_bps = 0,  monthly_cashback_bps = 0  WHERE tier_level = 0; -- Unranked
UPDATE vip_tier_config SET weekly_cashback_bps = 2,  monthly_cashback_bps = 5  WHERE tier_level = 1; -- Bronze
UPDATE vip_tier_config SET weekly_cashback_bps = 3,  monthly_cashback_bps = 8  WHERE tier_level = 2; -- Silver
UPDATE vip_tier_config SET weekly_cashback_bps = 5,  monthly_cashback_bps = 12 WHERE tier_level = 3; -- Gold
UPDATE vip_tier_config SET weekly_cashback_bps = 7,  monthly_cashback_bps = 16 WHERE tier_level = 4; -- Platinum
UPDATE vip_tier_config SET weekly_cashback_bps = 10, monthly_cashback_bps = 20 WHERE tier_level = 5; -- Diamond
UPDATE vip_tier_config SET weekly_cashback_bps = 12, monthly_cashback_bps = 25 WHERE tier_level = 6; -- Obsidian

-- Per-wallet claim cadence cursors (NULL = never claimed → eligible now).
ALTER TABLE player_vip_state
  ADD COLUMN IF NOT EXISTS last_weekly_claim_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_monthly_claim_at TIMESTAMPTZ;

COMMIT;
