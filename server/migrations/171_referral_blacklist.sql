-- Migration 171: referral blacklist (anti-abuse).
--
-- Lets an admin cut off a wallet's referral privileges when they are farming the
-- welcome bonus (create N fresh wallets, bind them to your code, collect N x
-- welcome_bonus_chips). A blacklisted wallet:
--   - can no longer have its code bound by NEW referees (bind() refuses), and
--   - stops accruing referral rewards from its existing referees.
--
-- Existing bindings are deliberately left in place so the history stays
-- auditable; the blacklist is what stops the money, not deletion.
--
-- clawed_back_chips records what was reversed off the referrer at blacklist
-- time (their earned referral_reward chips), so a blacklist is a single
-- reviewable row rather than a silent balance edit.

BEGIN;

CREATE TABLE IF NOT EXISTS referral_blacklist (
  wallet_address     VARCHAR(42) PRIMARY KEY,
  reason             TEXT,
  clawed_back_chips  NUMERIC(78, 0) NOT NULL DEFAULT 0,
  blacklisted_by     VARCHAR(42),
  blacklisted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT referral_blacklist_wallet_lower CHECK (wallet_address = LOWER(wallet_address)),
  CONSTRAINT referral_blacklist_clawback_nonneg CHECK (clawed_back_chips >= 0)
);

-- Admin views list the newest actions first.
CREATE INDEX IF NOT EXISTS idx_referral_blacklist_at
  ON referral_blacklist (blacklisted_at DESC);

COMMIT;
