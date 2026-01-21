-- Migration: Change BIGINT columns to NUMERIC to support large wei values
-- PostgreSQL BIGINT max: 2^63 - 1 (9,223,372,036,854,775,807)
-- 100 ETH in wei: 100000000000000000000 (exceeds BIGINT limit)

-- Change game_sessions columns
ALTER TABLE game_sessions 
  ALTER COLUMN total_bet TYPE NUMERIC(78, 0),
  ALTER COLUMN total_win TYPE NUMERIC(78, 0);

-- Change games columns
ALTER TABLE games 
  ALTER COLUMN total_bet_amount TYPE NUMERIC(78, 0),
  ALTER COLUMN total_payout TYPE NUMERIC(78, 0);

-- Change game_hands columns
ALTER TABLE game_hands 
  ALTER COLUMN bet_amount TYPE NUMERIC(78, 0),
  ALTER COLUMN payout TYPE NUMERIC(78, 0);

-- Change settlements column
ALTER TABLE settlements 
  ALTER COLUMN amount TYPE NUMERIC(78, 0);

-- NUMERIC(78, 0) can store up to 10^78, which is more than enough for any wei amount
-- (Ethereum max supply is ~120M ETH = 1.2e26 wei, well within NUMERIC(78, 0))
