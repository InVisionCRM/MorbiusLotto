-- Migration 169: referral program (off-chain chips).
--
-- A house-funded "refer a friend" layer on top of the VIP program:
--   - Every wallet gets a shareable referral CODE.
--   - A new player can BIND one referrer's code (once, while still new) and
--     receives a one-time welcome bonus in chips.
--   - Whenever a referee CLAIMS VIP rakeback, their referrer earns a % of that
--     rakeback (default 10%). This is house-funded — it is credited ON TOP of
--     the referee's reward, never deducted from it.
--
-- Everything pays out in chips through applyPokerChipDelta(), mirroring the VIP
-- program (migrations 166/168). Two new ledger reasons are introduced by the
-- service layer:
--   referral_welcome — one-time welcome bonus credited to a referee on binding
--   referral_reward  — a % of a referee's rakeback credited to their referrer
--
-- 1 chip = 1 MORBIUS = 10^18 wei (poker-chip-scale.ts). All chip amounts here
-- are WHOLE chips.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- referral_config — single tunable row (id is pinned to 1).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_config (
  id                   INT PRIMARY KEY DEFAULT 1,
  reward_bps           INT NOT NULL DEFAULT 1000,          -- referrer earns this bps of a referee's rakeback (1000 = 10%)
  welcome_bonus_chips  NUMERIC(78, 0) NOT NULL DEFAULT 100, -- one-time chips credited to a referee on binding (0 disables)
  max_bind_wager_chips NUMERIC(78, 0) NOT NULL DEFAULT 5000, -- a referee may only bind while their lifetime wager is at/below this (anti-poach)
  enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT referral_config_singleton CHECK (id = 1),
  CONSTRAINT referral_config_reward_range CHECK (reward_bps BETWEEN 0 AND 10000),
  CONSTRAINT referral_config_nonneg CHECK (welcome_bonus_chips >= 0 AND max_bind_wager_chips >= 0)
);

INSERT INTO referral_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- referral_codes — one shareable code per wallet (lazily created on first view).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_codes (
  wallet_address VARCHAR(42) PRIMARY KEY,
  code           TEXT NOT NULL UNIQUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT referral_codes_wallet_lower CHECK (wallet_address = LOWER(wallet_address)),
  CONSTRAINT referral_codes_code_upper CHECK (code = UPPER(code))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- referrals — the referee → referrer binding (one referrer per referee, ever).
-- total_reward_chips is the running sum the referrer has earned from THIS
-- referee's rakeback claims; welcome_bonus_chips is what the referee was paid.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  referee_address     VARCHAR(42) PRIMARY KEY,
  referrer_address    VARCHAR(42) NOT NULL,
  code                TEXT NOT NULL,
  welcome_bonus_chips NUMERIC(78, 0) NOT NULL DEFAULT 0,
  total_reward_chips  NUMERIC(78, 0) NOT NULL DEFAULT 0,
  bound_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT referrals_no_self CHECK (referee_address <> referrer_address),
  CONSTRAINT referrals_lower CHECK (
    referee_address = LOWER(referee_address) AND referrer_address = LOWER(referrer_address)
  ),
  CONSTRAINT referrals_nonneg CHECK (welcome_bonus_chips >= 0 AND total_reward_chips >= 0)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_address);

COMMENT ON TABLE referral_config IS
  'Single-row, runtime-tunable referral settings: referrer reward bps of referee rakeback, referee welcome bonus, max wager to bind.';
COMMENT ON TABLE referral_codes IS
  'One shareable referral code per wallet, created lazily when the wallet first opens the referrals page.';
COMMENT ON TABLE referrals IS
  'Referee → referrer binding (one per referee). total_reward_chips = lifetime referrer earnings from this referee''s rakeback.';

COMMIT;
