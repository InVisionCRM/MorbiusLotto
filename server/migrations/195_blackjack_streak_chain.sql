-- Migration 195: Blackjack win-streak chain bonus (owner request 2026-08-19).
--
-- Solo blackjack pays an escalating "chain" bonus on consecutive wins:
--   2 wins → 5%, 3 → 7%, 4 → 15%, 5 → 25%, 6 → 37%, 7+ → 50% of the hand's
-- total main bet, credited instantly on top of the normal payout (ledger
-- reason 'blackjack_streak_bonus' — deliberately NOT a `*_payout` suffix so
-- it neither offsets VIP net-loss rakeback nor counts as wager volume).
-- A loss resets the chain to zero; a push leaves it untouched. Tournament
-- games (total_bet_amount = 0) never touch the chain.
--
-- Each chain bonus also grants the same amount as VIP TIER-PROGRESS credit
-- (owner decision 2026-08-19): rows in vip_wager_credits are added to the
-- ledger-derived `*_bet` turnover when VipService computes lifetime wager,
-- so chains accelerate tier progression without fabricating ledger bets
-- (a synthetic `*_bet` debit would corrupt balances and rakeback net-loss).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- blackjack_win_streaks
-- One row per wallet: the CURRENT consecutive-win count in solo blackjack.
-- Only ever 0..N (losses reset to 0; pushes don't touch the row).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blackjack_win_streaks (
  wallet_address VARCHAR(42) PRIMARY KEY,
  streak         INT NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT blackjack_win_streaks_wallet_lower CHECK (wallet_address = LOWER(wallet_address)),
  CONSTRAINT blackjack_win_streaks_nonneg CHECK (streak >= 0)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- vip_wager_credits
-- Bonus VIP tier-progress credits, in WHOLE chips, granted outside real wagers
-- (currently only blackjack chain bonuses). VipService adds SUM(chips) per
-- wallet to the poker_chip_ledger-derived lifetime wager when resolving tiers.
-- Append-only.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vip_wager_credits (
  id             BIGSERIAL PRIMARY KEY,
  wallet_address VARCHAR(42) NOT NULL,
  chips          NUMERIC(78, 0) NOT NULL,
  reason         VARCHAR(40) NOT NULL,
  ref_type       VARCHAR(24),
  ref_id         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT vip_wager_credits_wallet_lower CHECK (wallet_address = LOWER(wallet_address)),
  CONSTRAINT vip_wager_credits_positive CHECK (chips > 0)
);

CREATE INDEX IF NOT EXISTS idx_vip_wager_credits_wallet
  ON vip_wager_credits (wallet_address);

COMMENT ON TABLE blackjack_win_streaks IS
  'Current consecutive-win count per wallet in solo blackjack. Drives the chain bonus ladder (5/7/15/25/37/50% of bet at 2..7+ wins) and the on-felt flame border.';
COMMENT ON TABLE vip_wager_credits IS
  'Bonus VIP tier-progress credits (whole chips) granted outside real wagers; summed into lifetime wager by VipService. Currently: blackjack chain bonuses.';

COMMIT;
