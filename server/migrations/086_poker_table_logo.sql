-- Add table logo (marketing branding) columns to poker_tables
ALTER TABLE poker_tables
  ADD COLUMN IF NOT EXISTS table_logo VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS table_logo_opacity REAL DEFAULT 0.12;
