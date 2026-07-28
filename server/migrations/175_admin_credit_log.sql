-- 175_admin_credit_log.sql
--
-- Audit trail for manual admin balance adjustments (credit/debit) applied from
-- the in-app admin dashboard (/activity). Every adjustment also writes a
-- poker_chip_ledger row via applyPokerChipDelta (reason 'admin_credit' /
-- 'admin_debit'); this table additionally records WHO performed it, the note,
-- and the resulting balance — the chip ledger alone does not capture the acting
-- admin. amount_wei is signed: positive = credit, negative = debit/clawback.

CREATE TABLE IF NOT EXISTS admin_credit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_address  VARCHAR(42) NOT NULL,
  target_address VARCHAR(42) NOT NULL,
  amount         NUMERIC(78, 0) NOT NULL,      -- signed, in whole MORBIUS (chip units)
  balance_after  NUMERIC(78, 0) NOT NULL,      -- target's chip balance after the adjustment
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (admin_address = LOWER(admin_address)),
  CHECK (target_address = LOWER(target_address)),
  CHECK (amount <> 0)
);

CREATE INDEX IF NOT EXISTS idx_admin_credit_log_target
  ON admin_credit_log (target_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_credit_log_admin
  ON admin_credit_log (admin_address, created_at DESC);
