-- Migration 028: Add logo_url, ticker, iframe_url to blackjack_tables for per-table token profile (Morbius.io/Norbius.io iframe).

ALTER TABLE blackjack_tables
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS ticker VARCHAR(20),
  ADD COLUMN IF NOT EXISTS iframe_url TEXT;

COMMENT ON COLUMN blackjack_tables.logo_url IS 'Optional token logo URL (overrides DexScreener)';
COMMENT ON COLUMN blackjack_tables.ticker IS 'Optional token ticker/symbol (e.g. MORBIUS)';
COMMENT ON COLUMN blackjack_tables.iframe_url IS 'Morbius.io/Norbius.io Geicko iframe URL for token chart';
