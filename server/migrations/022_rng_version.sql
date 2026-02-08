-- Add rng_version column to games table
-- Version 1 = legacy infinite deck (HMAC per card)
-- Version 2 = Fisher-Yates 52-card deck (Stake.com standard)
ALTER TABLE games ADD COLUMN IF NOT EXISTS rng_version INTEGER DEFAULT 1;
