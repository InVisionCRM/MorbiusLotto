-- Migration 166: VIP rewards (off-chain chip loyalty program).
--
-- MVP loyalty layer modelled on the standard crypto-casino VIP program
-- (xgame.io / Stake-style): wager-based tiers + rakeback, paid entirely in
-- off-chain chips through the existing player_poker_chips / poker_chip_ledger.
-- No new on-chain contract, no gas — rewards are credited via
-- applyPokerChipDelta() exactly like holder rewards (migration 148).
--
-- Wager volume is NOT stored here; it is derived on demand by summing the
-- negative `*_bet` deltas already recorded in poker_chip_ledger for every
-- house game (plinko_bet, keno_bet, blackjack_bet, video_poker_bet,
-- arcade_*_bet, …). 1 chip = 1 MORBIUS = 10^18 wei (poker-chip-scale.ts).
--
-- Two new ledger reasons are introduced by the service layer:
--   vip_rakeback   — a % of wager turnover since the player's last claim
--   vip_tier_bonus — one-time chip bonus granted when a new tier is reached

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- vip_tier_config
-- The tier ladder. tier_level 0 is the base ("no tier") rung. A player's tier
-- is the highest rung whose min_lifetime_wager_chips they have met. Fully
-- tunable at runtime — change a threshold / rakeback / bonus and it takes
-- effect on the next status read or claim. All chip amounts are WHOLE chips.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vip_tier_config (
  tier_level               INT PRIMARY KEY,
  tier_name                TEXT NOT NULL,
  min_lifetime_wager_chips NUMERIC(78, 0) NOT NULL DEFAULT 0,  -- lifetime wagered chips needed to reach this tier
  rakeback_bps             INT NOT NULL DEFAULT 0,             -- basis points of wager turnover returned as rakeback (100 bps = 1%)
  level_up_bonus_chips     NUMERIC(78, 0) NOT NULL DEFAULT 0,  -- one-time chip bonus granted on reaching this tier
  color                    TEXT NOT NULL DEFAULT '#9ca3af',    -- badge accent colour for the UI
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vip_tier_config_rakeback_range CHECK (rakeback_bps >= 0 AND rakeback_bps <= 10000),
  CONSTRAINT vip_tier_config_nonneg CHECK (min_lifetime_wager_chips >= 0 AND level_up_bonus_chips >= 0)
);

-- Seed the default ladder. Thresholds in whole chips (= MORBIUS). rakeback_bps
-- is intentionally conservative (a small fraction of the house edge on
-- turnover) so the program is sustainable; tune freely after launch.
INSERT INTO vip_tier_config
  (tier_level, tier_name, min_lifetime_wager_chips, rakeback_bps, level_up_bonus_chips, color)
VALUES
  (0, 'Unranked',         0,        0,  0,     '#9ca3af'),
  (1, 'Bronze',           1000,     5,  10,    '#cd7f32'),
  (2, 'Silver',           10000,    8,  50,    '#c0c0c0'),
  (3, 'Gold',             50000,    12, 250,   '#f5c542'),
  (4, 'Platinum',         250000,   16, 1500,  '#5fd0c5'),
  (5, 'Diamond',          1000000,  20, 7500,  '#5ea0ff'),
  (6, 'Obsidian',         5000000,  25, 50000, '#7c5cff')
ON CONFLICT (tier_level) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- player_vip_state
-- One row per wallet. Tracks the rakeback accrual cursor and the highest tier
-- whose level-up bonus has been paid, so neither is ever double-claimed.
--
-- Rakeback is FORWARD-LOOKING: it accrues from last_rakeback_claim_at, which is
-- initialised to the moment the player first interacts with the VIP system.
-- This deliberately avoids paying retroactive rakeback on wagering that
-- happened before the program existed.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS player_vip_state (
  wallet_address          VARCHAR(42) PRIMARY KEY,
  last_rakeback_claim_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- rakeback accrues on wager AFTER this instant
  highest_tier_awarded    INT NOT NULL DEFAULT 0,              -- highest tier whose level-up bonus has been paid
  lifetime_rakeback_chips NUMERIC(78, 0) NOT NULL DEFAULT 0,   -- running total of rakeback chips claimed
  lifetime_bonus_chips    NUMERIC(78, 0) NOT NULL DEFAULT 0,   -- running total of level-up bonus chips claimed
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT player_vip_state_wallet_lower CHECK (wallet_address = LOWER(wallet_address)),
  CONSTRAINT player_vip_state_nonneg CHECK (
    highest_tier_awarded >= 0
    AND lifetime_rakeback_chips >= 0
    AND lifetime_bonus_chips >= 0
  )
);

CREATE INDEX IF NOT EXISTS idx_player_vip_state_updated
  ON player_vip_state (updated_at DESC);

COMMENT ON TABLE vip_tier_config IS
  'VIP tier ladder: wager thresholds, rakeback rate (bps of turnover) and one-time level-up bonuses. Runtime-tunable.';
COMMENT ON TABLE player_vip_state IS
  'Per-wallet VIP accrual state: rakeback cursor + highest paid tier. Wager volume itself is derived from poker_chip_ledger.';
COMMENT ON COLUMN player_vip_state.last_rakeback_claim_at IS
  'Rakeback accrues on *_bet turnover recorded after this instant. Initialised to first VIP interaction (forward-looking).';

COMMIT;
