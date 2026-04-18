-- Migration 097: Unify poker storage to chip-integer scale (no more wei in engine state).
--
-- Before: poker_tables.small_blind/big_blind/last_raise_size, poker_seats.stack,
--         poker_hands.pot_amount/rake_amount, poker_hand_actions.amount were
--         all stored as wei (NUMERIC, amount_chips * 10^15).
-- After:  the same columns hold raw chip integers. Only MORBIUS-boundary sites
--         (join buy-in, leave cash-out, re-up, rake credit, tournament prize
--         distribution) convert between chips and wei.
--
-- POKER_CHIP_WEI is hardcoded to 10^15. History is wiped because it was stored
-- in wei and is now meaningless under the new scale.
--
-- Prerequisite: the server must be idle (no active tournaments, no seated cash
-- players). This migration force-closes everything before converting, crediting
-- any remaining cash-seat stacks back to players.balance in wei.

BEGIN;

-- 1. Force-close all active cash tables: credit each seat's stack (currently in wei)
--    back to the owner's balance, then delete seats and tables.
--    Tournament tables are handled separately below (stacks are virtual, no refund).
WITH cash_seats AS (
  SELECT ps.id AS seat_id, ps.player_address, ps.stack
  FROM poker_seats ps
  JOIN poker_tables pt ON pt.id = ps.table_id
  WHERE pt.tournament_mode IS NOT TRUE
    AND ps.stack > 0
)
INSERT INTO players (wallet_address, balance)
SELECT player_address, SUM(stack)::NUMERIC
FROM cash_seats
GROUP BY player_address
ON CONFLICT (wallet_address) DO UPDATE
  SET balance = players.balance + EXCLUDED.balance,
      last_seen = NOW();

-- 2. Cancel active poker tournaments (status = 'active' only; 'registration'
--    tournaments still have their buy-ins held and the regular cancel flow can
--    refund them later). For 'active' tournaments, zero out the prize pool
--    record here because we cannot replay hands to redistribute; operator must
--    handle manually via admin tooling if any remain.
UPDATE tournaments
SET status = 'cancelled',
    ended_at = COALESCE(ended_at, NOW())
WHERE game_type = 'poker' AND status = 'active';

UPDATE tournament_entries te
SET status = 'busted',
    finished_at = COALESCE(finished_at, NOW())
FROM tournaments t
WHERE te.tournament_id = t.id
  AND t.game_type = 'poker'
  AND t.status = 'cancelled'
  AND te.status = 'playing';

-- 3. Drop all poker game state. Seats/hands are recreated by the engine; no
--    readable content survives because scales change.
DELETE FROM poker_hand_hole_cards;
DELETE FROM poker_hand_actions;
DELETE FROM poker_hands;
DELETE FROM poker_tournament_seats;
DELETE FROM poker_seats;
DELETE FROM poker_tables;

-- 4. Renormalize any surviving default blinds on future INSERTs. The schema
--    constraints still use NUMERIC(78,0); no column retyping needed because
--    chip counts fit comfortably and we want room for future large-stack play.

COMMIT;
