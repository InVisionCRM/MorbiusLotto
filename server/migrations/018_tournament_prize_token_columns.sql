-- Ensure prize_token columns exist (in case 016 was skipped or 017 was run before 016).
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS).

ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_token_address VARCHAR(42) DEFAULT NULL;
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS prize_token_decimals INT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_tournaments_prize_token ON tournaments(prize_token_address) WHERE prize_token_address IS NOT NULL;

COMMENT ON COLUMN tournaments.prize_token_address IS 'ERC-20 address for custom prize token; NULL = platform (MORBIUS) prize';
COMMENT ON COLUMN tournaments.prize_token_decimals IS 'Decimals of prize token for display; used when prize_token_address is set';
