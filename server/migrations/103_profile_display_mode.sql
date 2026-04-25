-- Adds a per-player preference for what shows at poker/blackjack seats:
--   'avatar' (default) — render the procedural Morbius avatar
--   'photo'            — render the uploaded profileImageUrl
-- Chat continues to use profile_image_url unconditionally regardless of this flag.

ALTER TABLE chat_display_names
  ADD COLUMN IF NOT EXISTS profile_display_mode TEXT NOT NULL DEFAULT 'avatar'
    CHECK (profile_display_mode IN ('avatar', 'photo'));

COMMENT ON COLUMN chat_display_names.profile_display_mode IS
  'Render preference at poker/blackjack seats: avatar (default) or photo (uses profile_image_url).';
