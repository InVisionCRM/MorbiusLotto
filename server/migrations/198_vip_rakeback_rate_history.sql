-- Migration 198: per-tier rakeback rate history (internal).
--
-- RUN BEFORE deploying the server code that reads it. On its own it changes
-- nothing: with no rows, VipService pays rakeback exactly as before.
--
-- Each row says: this tier paid `rakeback_bps` on net loss up to
-- `effective_until`. When a player's claim window spans one or more of these
-- boundaries, VipService pays each stretch of the window at the rate that was
-- in force for it, and the stretch after the last boundary at the tier's
-- current vip_tier_config.rakeback_bps. Nothing here is exposed by the API.
--
-- effective_until is millisecond precision on purpose: node-pg reads
-- timestamps into JS Dates (milliseconds), and VipService passes those Dates
-- back as the window bounds. A microsecond value would come back truncated,
-- moving the boundary up to 1 ms earlier than the one recorded here.

BEGIN;

CREATE TABLE IF NOT EXISTS vip_rakeback_rate_history (
  tier_level      INT            NOT NULL REFERENCES vip_tier_config (tier_level),
  rakeback_bps    INT            NOT NULL,
  effective_until TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY (tier_level, effective_until),
  CONSTRAINT vip_rakeback_rate_history_range CHECK (rakeback_bps >= 0 AND rakeback_bps <= 10000)
);

COMMIT;
