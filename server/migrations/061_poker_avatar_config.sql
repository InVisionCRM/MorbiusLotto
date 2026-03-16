-- Optional pixel-avatar config (skin, hair, eyes, etc.) for poker table display.
ALTER TABLE chat_display_names
  ADD COLUMN IF NOT EXISTS avatar_config JSONB;

COMMENT ON COLUMN chat_display_names.avatar_config IS 'Optional pixel-avatar config for poker table display';
