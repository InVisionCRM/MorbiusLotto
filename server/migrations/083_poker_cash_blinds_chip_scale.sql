-- Migration 083: Normalize legacy cash poker table blinds to multiples of the default chip (10^15 wei).
-- Before chip-scaling, some tables used microscopic values (e.g. 10 / 20 wei) which are invalid for
-- wei-denominated buy-ins. Cash tables (non-tournament) with blinds below one chip are bumped to 10/20 chips.

UPDATE poker_tables t
SET
  small_blind = (10::numeric * 1000000000000000::numeric),
  big_blind = (20::numeric * 1000000000000000::numeric)
WHERE (t.tournament_mode IS NULL OR t.tournament_mode = FALSE)
  AND t.small_blind::numeric < 1000000000000000::numeric;
