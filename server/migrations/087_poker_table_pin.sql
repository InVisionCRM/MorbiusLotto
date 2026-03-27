-- Add optional 4-digit PIN code for private poker tables
ALTER TABLE poker_tables ADD COLUMN pin_code VARCHAR(4) DEFAULT NULL;
