-- Add unique constraint on (table_id, player_address) to prevent duplicate seats
-- from concurrent join requests that race past the application-level check.
ALTER TABLE poker_seats
  ADD CONSTRAINT poker_seats_table_player_unique UNIQUE (table_id, player_address);
