-- 120_creator_fee_range.sql
--
-- Lets tournament creators choose their own creator-fee percent (0-15, integer steps).
-- Default stays 2 so creators who don't touch the UI get exactly current behavior.
-- Freerolls keep the 0% override applied at payout time (server-side; see tournament.service.ts).

-- 1. Backfill any NULL rows to 2 so the column matches what the live code has been emitting.
UPDATE tournaments
   SET creator_fee_percent = 2
 WHERE creator_fee_percent IS NULL;

-- 2. Set the column default to 2 (was 0 in migration 024).
ALTER TABLE tournaments
  ALTER COLUMN creator_fee_percent SET DEFAULT 2;

-- 3. Add a CHECK constraint enforcing 0..15. The server validates this too, but the DB
--    is the hard floor — even a buggy/bypassed API path cannot persist out-of-range values.
ALTER TABLE tournaments
  DROP CONSTRAINT IF EXISTS tournaments_creator_fee_range;

ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_creator_fee_range
  CHECK (creator_fee_percent IS NULL OR (creator_fee_percent BETWEEN 0 AND 15));
