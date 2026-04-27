-- Widen label: admin auto-labels can exceed VARCHAR(128) (theme name + stake range).

ALTER TABLE blackjack_sp_wager_tiers
  ALTER COLUMN label TYPE VARCHAR(512);
