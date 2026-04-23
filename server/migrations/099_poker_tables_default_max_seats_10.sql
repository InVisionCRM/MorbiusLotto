-- Default new cash tables to 10 seats (UI cap); existing rows unchanged.
ALTER TABLE poker_tables ALTER COLUMN max_seats SET DEFAULT 10;
