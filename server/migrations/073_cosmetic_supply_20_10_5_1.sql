-- Migration 073: Tier supply caps — common 20, uncommon 10, rare 5, legendary 1
-- Only lowers max_supply where minted_count already fits the new cap (safe updates).

UPDATE cosmetic_items SET max_supply = 20 WHERE tier = 'common'    AND minted_count <= 20;
UPDATE cosmetic_items SET max_supply = 10 WHERE tier = 'uncommon'  AND minted_count <= 10;
UPDATE cosmetic_items SET max_supply = 5  WHERE tier = 'rare'      AND minted_count <= 5;
-- legendary expected already 1; align any stray values
UPDATE cosmetic_items SET max_supply = 1  WHERE tier = 'legendary' AND minted_count <= 1;
