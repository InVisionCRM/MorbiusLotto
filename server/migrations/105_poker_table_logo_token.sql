-- Sponsored logos now carry token identity (address + name + symbol).
-- Renderer pulls live socials/logo from DexScreener using the address; we only persist
-- the minimum needed to identify the token across the 10-minute sponsorship window.

ALTER TABLE poker_tables
  ADD COLUMN IF NOT EXISTS table_logo_token_address VARCHAR(42) NULL,
  ADD COLUMN IF NOT EXISTS table_logo_token_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS table_logo_token_symbol TEXT NULL,
  ADD COLUMN IF NOT EXISTS table_logo_token_logo_url TEXT NULL;

ALTER TABLE poker_table_logo_purchases
  ADD COLUMN IF NOT EXISTS token_address VARCHAR(42) NULL,
  ADD COLUMN IF NOT EXISTS token_name TEXT NULL,
  ADD COLUMN IF NOT EXISTS token_symbol TEXT NULL;
