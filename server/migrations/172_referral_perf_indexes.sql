-- Migration 172: indexes for the referral admin/anti-abuse queries.
--
-- referrals has a PK on referee_address only, so every "who did this wallet
-- refer" lookup (the admin inspector, the welcome-bonus clawback, and the
-- reward-total rollup used at blacklist time) was a sequential scan keyed on
-- referrer_address. Index it.
--
-- The blacklist is consulted on every bind() and on every referral reward
-- accrual via blacklistedAmong(); its PK already serves the = ANY() lookup, so
-- no extra index is needed there.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_referrals_referrer
  ON referrals (referrer_address);

-- Lifetime-wager and clawback paths filter the chip ledger by wallet + reason.
CREATE INDEX IF NOT EXISTS idx_poker_chip_ledger_wallet_reason
  ON poker_chip_ledger (wallet_address, reason);

COMMIT;
