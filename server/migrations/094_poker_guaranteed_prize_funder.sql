-- Track who funded the initial guaranteed prize pool for zero buy-in poker SNGs
-- (creator balance vs platform promo wallet). Used to refund prize_pool on cancel / under-min.

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS guaranteed_prize_funder_address TEXT NULL;

COMMENT ON COLUMN tournaments.guaranteed_prize_funder_address IS
  'For poker freerolls (buy_in_amount=0): wallet that was debited for initial prize_pool. NULL means creator_address was debited. Refunds go here (or creator if NULL).';
