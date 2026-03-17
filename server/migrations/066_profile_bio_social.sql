-- Add bio and social handles to player profiles
ALTER TABLE chat_display_names
  ADD COLUMN IF NOT EXISTS bio       TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS x_handle  VARCHAR(50)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tg_handle VARCHAR(50)  DEFAULT NULL;
