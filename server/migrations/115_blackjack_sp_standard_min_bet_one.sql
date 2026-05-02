-- Lower single-player "Standard" tier minimum from 500 to 1 MORBIUS (wei).
-- Matches app/BLACKJACK/constants BET_TIERS.standard.MIN_BET.
UPDATE blackjack_sp_wager_tiers
SET
    min_bet = 1000000000000000000,
    updated_at = NOW()
WHERE slug = 'standard';
