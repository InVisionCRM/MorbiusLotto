-- Migration: Add off-chain balance to players table
-- This enables fully off-chain betting like Stake.com

-- Add balance column (stored as NUMERIC to handle large values)
ALTER TABLE players 
ADD COLUMN IF NOT EXISTS balance NUMERIC(78, 0) DEFAULT 0 NOT NULL;

-- Create index for balance queries
CREATE INDEX IF NOT EXISTS idx_players_balance ON players(balance);

-- Update existing players to sync balance with contract reserves (if needed)
-- Note: This would need to be run manually or via a script to sync initial balances
