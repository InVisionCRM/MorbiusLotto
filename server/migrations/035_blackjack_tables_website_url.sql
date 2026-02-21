-- Migration 035: Add website_url to blackjack_tables for optional token/project website link.

ALTER TABLE blackjack_tables
  ADD COLUMN IF NOT EXISTS website_url TEXT;

COMMENT ON COLUMN blackjack_tables.website_url IS 'Optional website URL for the table token/project (shown in table token profile card)';
