-- Migration 072: Rebalance supply caps to match updated tier defaults
-- common: 250→50, uncommon: 50→25, rare: 15→5, legendary: stays 1
-- Only updates rows where minted_count allows it (won't drop below already-minted)

UPDATE cosmetic_items SET max_supply = 50  WHERE tier = 'common'    AND max_supply = 250 AND minted_count <= 50;
UPDATE cosmetic_items SET max_supply = 25  WHERE tier = 'uncommon'  AND max_supply = 50  AND minted_count <= 25;
UPDATE cosmetic_items SET max_supply = 5   WHERE tier = 'rare'      AND max_supply = 15  AND minted_count <= 5;
-- legendary is already 1, no change needed
