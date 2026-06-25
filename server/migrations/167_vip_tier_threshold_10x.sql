-- Migration 167: raise VIP wager thresholds 10x.
--
-- Makes every tier 10x harder to reach than the original 166 seed
-- (the "amount you need to wager to get rewards"). Rakeback rates and
-- level-up bonuses are intentionally left unchanged.
--
-- Uses ABSOLUTE target values (not `* 10`) so the migration is idempotent —
-- re-running it sets the same numbers rather than compounding. Tier 0
-- (Unranked) stays at 0.

BEGIN;

UPDATE vip_tier_config SET min_lifetime_wager_chips = 10000,    updated_at = NOW() WHERE tier_level = 1; -- Bronze   (was 1,000)
UPDATE vip_tier_config SET min_lifetime_wager_chips = 100000,   updated_at = NOW() WHERE tier_level = 2; -- Silver   (was 10,000)
UPDATE vip_tier_config SET min_lifetime_wager_chips = 500000,   updated_at = NOW() WHERE tier_level = 3; -- Gold     (was 50,000)
UPDATE vip_tier_config SET min_lifetime_wager_chips = 2500000,  updated_at = NOW() WHERE tier_level = 4; -- Platinum (was 250,000)
UPDATE vip_tier_config SET min_lifetime_wager_chips = 10000000, updated_at = NOW() WHERE tier_level = 5; -- Diamond  (was 1,000,000)
UPDATE vip_tier_config SET min_lifetime_wager_chips = 50000000, updated_at = NOW() WHERE tier_level = 6; -- Obsidian (was 5,000,000)

COMMIT;
