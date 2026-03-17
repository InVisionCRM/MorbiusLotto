-- Player follow/follower system
CREATE TABLE IF NOT EXISTS player_follows (
  follower_address  VARCHAR(42) NOT NULL,
  following_address VARCHAR(42) NOT NULL,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (follower_address, following_address),
  CHECK (LOWER(follower_address) != LOWER(following_address))
);

CREATE INDEX IF NOT EXISTS idx_player_follows_follower  ON player_follows (LOWER(follower_address));
CREATE INDEX IF NOT EXISTS idx_player_follows_following ON player_follows (LOWER(following_address));
