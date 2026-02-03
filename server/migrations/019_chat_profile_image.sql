-- Add profile image URL to chat display names (user avatar tied to wallet)

ALTER TABLE chat_display_names
  ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

COMMENT ON COLUMN chat_display_names.profile_image_url IS 'Optional profile image URL or data URL for nav/chat avatar';
