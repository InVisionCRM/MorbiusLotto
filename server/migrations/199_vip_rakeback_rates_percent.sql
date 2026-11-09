-- Migration 199: tier rakeback rates 500–2500 bps (Bronze 5% → Obsidian 25%
-- of net loss).
--
-- RUN ONLY AFTER the server code that reads vip_rakeback_rate_history
-- (migration 198) is deployed and live. Run against older code, players
-- claiming would get these rates on losses from before this switch.
--
-- Losses before this moment keep the previous rate: the previous rates are
-- recorded in vip_rakeback_rate_history with effective_until = NOW(), and
-- VipService pays each player's open claim window at the previous rate up to
-- now and these rates after it.
--
-- Fails without changing anything if it has already run or if the current
-- rates are not the expected 0/5/8/12/16/20/25.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM vip_rakeback_rate_history) THEN
    RAISE EXCEPTION 'vip_rakeback_rate_history already has rows: migration 199 has already been applied';
  END IF;
  IF (SELECT array_agg(rakeback_bps ORDER BY tier_level) FROM vip_tier_config) IS DISTINCT FROM ARRAY[0, 5, 8, 12, 16, 20, 25] THEN
    RAISE EXCEPTION 'vip_tier_config.rakeback_bps is not 0,5,8,12,16,20,25: refusing to switch';
  END IF;
END $$;

INSERT INTO vip_rakeback_rate_history (tier_level, rakeback_bps, effective_until)
SELECT tier_level, rakeback_bps, NOW() FROM vip_tier_config;

UPDATE vip_tier_config
SET rakeback_bps = rakeback_bps * 100,
    updated_at   = NOW();

COMMIT;
