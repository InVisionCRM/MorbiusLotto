-- Migration: ensure in-progress rows default to 'ongoing'
-- Fixes action flow when result was previously NULL.

ALTER TABLE games
  ALTER COLUMN result SET DEFAULT 'ongoing';

UPDATE games
SET result = 'ongoing'
WHERE result IS NULL;

ALTER TABLE game_hands
  ALTER COLUMN result SET DEFAULT 'ongoing';

UPDATE game_hands
SET result = 'ongoing'
WHERE result IS NULL;

