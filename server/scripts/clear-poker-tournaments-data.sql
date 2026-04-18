-- MANUAL / ONE-OFF ONLY — not part of the numbered migration chain.
--
-- Removes every poker Sit & Go (game_type = 'poker'): tournament rows, entries,
-- scheduled events, and linked poker_tables (tournament_mode / tournament_id).
-- Does NOT delete blackjack or other game_type tournaments.
--
-- Run:
--   I_UNDERSTAND_DELETE_ALL_POKER_TOURNAMENTS=YES node server/scripts/clear-poker-tournaments.js
-- or:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/scripts/clear-poker-tournaments-data.sql

BEGIN;

DELETE FROM poker_tables
WHERE tournament_id IS NOT NULL
   OR COALESCE(tournament_mode, FALSE) = TRUE;

DELETE FROM tournaments
WHERE game_type = 'poker';

COMMIT;
