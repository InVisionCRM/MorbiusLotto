-- 153_drop_arcade_craps_bankroll.sql
-- Fix: craps "can't place chips" — session creation was failing.
--
-- Root cause (proven via live-DB dry-run of the route's own INSERT):
--   arcade_craps_sessions carried an orphaned `bankroll BIGINT NOT NULL` column
--   (no default) left over from the Phase-1 self-bankroll engine. The chip-wallet
--   rewrite (commit b2c0bafc) moved bankroll to the player's poker_chips balance,
--   and migration 149 defines the table WITHOUT bankroll. But DBs provisioned
--   under the old schema still carry the column. Because the current
--   POST /api/arcade/craps/session INSERT never writes `bankroll`, every new
--   session creation violated the NOT NULL constraint (Postgres 23502), so
--   createSession() threw, sessionId stayed null, and every chip click fell into
--   the `if (!sessionId)` guard → "Not connected". No current server code reads
--   or writes this column (verified by grep across server/src + lib).
--
-- Fix: drop the orphan column so the live schema matches migration 149.

BEGIN;

ALTER TABLE arcade_craps_sessions DROP COLUMN IF EXISTS bankroll;

COMMIT;
