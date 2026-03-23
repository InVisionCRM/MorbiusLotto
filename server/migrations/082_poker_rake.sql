-- Migration 082: Add rake tracking to poker hands.
-- 5% rake is taken from each cash game pot and credited to the rake wallet.

ALTER TABLE poker_hands ADD COLUMN IF NOT EXISTS rake_amount NUMERIC(78, 0) NOT NULL DEFAULT 0;
