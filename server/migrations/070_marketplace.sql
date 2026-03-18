-- Migration 070: Add supply caps to cosmetic_items + player marketplace

-- ─── 1. Add supply tracking columns to cosmetic_items ────────────────────────

ALTER TABLE cosmetic_items
  ADD COLUMN IF NOT EXISTS max_supply   INT     NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS minted_count INT     NOT NULL DEFAULT 0;

-- ─── 2. Update existing items with correct tier / price / supply ───────────────
-- Prices: common=50k PLS/1k Morbius, uncommon=250k/10k, rare=750k/25k, legendary=3M/100k
-- Supply: common=250, uncommon=50, rare=15, legendary=1

INSERT INTO cosmetic_items (item_key, display_name, tier, price_pls, price_morbius, max_supply, is_active) VALUES
  -- Skin colors
  ('skin_rosy',        'Rosy Skin',            'common',    50000,   1000,   250, true),
  ('skin_mauve',       'Mauve Skin',           'common',    50000,   1000,   250, true),
  ('skin_purple_gray', 'Dusk Skin',            'common',    50000,   1000,   250, true),
  ('skin_slate',       'Slate Skin',           'common',    50000,   1000,   250, true),
  ('skin_night',       'Night Skin',           'common',    50000,   1000,   250, true),
  ('skin_neon_green',  'Neon Green',           'uncommon',  250000,  10000,  50,  true),
  ('skin_sky_blue',    'Sky Blue',             'uncommon',  250000,  10000,  50,  true),
  ('skin_crimson',     'Crimson',              'uncommon',  250000,  10000,  50,  true),
  ('skin_hot_pink',    'Hot Pink',             'uncommon',  250000,  10000,  50,  true),
  ('skin_ice',         'Ice Skin',             'uncommon',  250000,  10000,  50,  true),
  ('skin_light_pink',  'Cotton Candy',         'uncommon',  250000,  10000,  50,  true),
  ('skin_ghost',       'Ghost White',          'uncommon',  250000,  10000,  50,  true),
  ('skin_olive',       'Dark Olive',           'uncommon',  250000,  10000,  50,  true),
  ('skin_gold',        'Gold Skin',            'rare',      750000,  25000,  15,  true),
  ('skin_silver',      'Silver Skin',          'rare',      750000,  25000,  15,  true),
  ('skin_void',        'Void Black',           'rare',      750000,  25000,  15,  true),
  ('skin_violet',      'Violet',               'rare',      750000,  25000,  15,  true),
  ('skin_navy',        'Deep Navy',            'rare',      750000,  25000,  15,  true),
  ('skin_orange_red',  'Phoenix',              'legendary', 3000000, 100000, 1,   true),
  ('skin_magenta',     'Magenta',              'legendary', 3000000, 100000, 1,   true),
  ('skin_cyan',        'Cyan',                 'legendary', 3000000, 100000, 1,   true),
  ('skin_yellow',      'Canary',               'legendary', 3000000, 100000, 1,   true),
  ('skin_chartreuse',  'Toxic Green',          'legendary', 3000000, 100000, 1,   true),
  -- Hair styles
  ('hair_style_spiky',      'Spiky',           'common',    50000,   1000,   250, true),
  ('hair_style_messy',      'Messy',           'common',    50000,   1000,   250, true),
  ('hair_style_pigtails',   'Pigtails',        'uncommon',  250000,  10000,  50,  true),
  ('hair_style_mullet',     'Mullet',          'rare',      750000,  25000,  15,  true),
  ('hair_style_mohawk',     'Mohawk',          'legendary', 3000000, 100000, 1,   true),
  ('hair_style_dreadlocks', 'Dreadlocks',      'legendary', 3000000, 100000, 1,   true),
  -- Hair colors (common)
  ('hair_color_ash',         'Ash Brown',      'common',    50000,   1000,   250, true),
  ('hair_color_ash2',        'Ash Blonde',     'common',    50000,   1000,   250, true),
  ('hair_color_dirty_blond', 'Dirty Blonde',   'common',    50000,   1000,   250, true),
  ('hair_color_sandy',       'Sandy',          'common',    50000,   1000,   250, true),
  ('hair_color_caramel',     'Caramel',        'common',    50000,   1000,   250, true),
  ('hair_color_honey',       'Honey',          'common',    50000,   1000,   250, true),
  ('hair_color_ginger',      'Ginger',         'common',    50000,   1000,   250, true),
  ('hair_color_chestnut',    'Chestnut',       'common',    50000,   1000,   250, true),
  ('hair_color_dk_brown',    'Dark Chocolate', 'common',    50000,   1000,   250, true),
  ('hair_color_espresso',    'Espresso',       'common',    50000,   1000,   250, true),
  ('hair_color_walnut',      'Walnut',         'common',    50000,   1000,   250, true),
  ('hair_color_mocha',       'Mocha',          'common',    50000,   1000,   250, true),
  ('hair_color_truffle',     'Truffle',        'common',    50000,   1000,   250, true),
  ('hair_color_oak',         'Oak',            'common',    50000,   1000,   250, true),
  ('hair_color_toffee',      'Toffee',         'common',    50000,   1000,   250, true),
  ('hair_color_wheat',       'Wheat',          'common',    50000,   1000,   250, true),
  -- Hair colors (uncommon)
  ('hair_color_vivid_red',  'Vivid Red',       'uncommon',  250000,  10000,  50,  true),
  ('hair_color_vivid_blue', 'Vivid Blue',      'uncommon',  250000,  10000,  50,  true),
  ('hair_color_vivid_grn',  'Vivid Green',     'uncommon',  250000,  10000,  50,  true),
  ('hair_color_vivid_purp', 'Vivid Purple',    'uncommon',  250000,  10000,  50,  true),
  -- Accessories
  ('acc_glasses',   'Glasses',                 'common',    50000,   1000,   250, true),
  ('acc_earrings',  'Earrings',                'common',    50000,   1000,   250, true),
  ('acc_aviators',  'Aviators',                'uncommon',  250000,  10000,  50,  true),
  ('acc_wayfarers', 'Wayfarers',               'uncommon',  250000,  10000,  50,  true),
  ('acc_headband',  'Headband',                'uncommon',  250000,  10000,  50,  true),
  ('acc_round',     'Round Glasses',           'rare',      750000,  25000,  15,  true),
  ('acc_cyberpunk', 'Cyberpunk Visor',         'legendary', 3000000, 100000, 1,   true),
  -- Hats
  ('hat_bandana',  'Bandana',                  'common',    50000,   1000,   250, true),
  ('hat_cowboy',   'Cowboy Hat',               'uncommon',  250000,  10000,  50,  true),
  ('hat_top_hat',  'Top Hat',                  'rare',      750000,  25000,  15,  true),
  ('hat_crown',    'Crown',                    'legendary', 3000000, 100000, 1,   true),
  -- Necklaces
  ('neck_silver',  'Silver Chain',             'common',    50000,   1000,   250, true),
  ('neck_pearl',   'Pearl',                    'uncommon',  250000,  10000,  50,  true),
  ('neck_gold',    'Gold Chain',               'rare',      750000,  25000,  15,  true),
  ('neck_pendant', 'Pendant',                  'legendary', 3000000, 100000, 1,   true),
  -- Shirt colors (common)
  ('shirt_dark_red',    'Dark Red',            'common',    50000,   1000,   250, true),
  ('shirt_maroon',      'Maroon',              'common',    50000,   1000,   250, true),
  ('shirt_orange',      'Orange',              'common',    50000,   1000,   250, true),
  ('shirt_burnt',       'Burnt Orange',        'common',    50000,   1000,   250, true),
  ('shirt_yellow',      'Yellow',              'common',    50000,   1000,   250, true),
  ('shirt_gold',        'Gold',                'common',    50000,   1000,   250, true),
  ('shirt_forest',      'Forest',              'common',    50000,   1000,   250, true),
  ('shirt_dark_green',  'Dark Green',          'common',    50000,   1000,   250, true),
  ('shirt_teal',        'Teal',                'common',    50000,   1000,   250, true),
  ('shirt_navy',        'Navy',                'common',    50000,   1000,   250, true),
  ('shirt_dark_navy',   'Dark Navy',           'common',    50000,   1000,   250, true),
  ('shirt_cyan',        'Cyan',                'common',    50000,   1000,   250, true),
  ('shirt_dark_purple', 'Dark Purple',         'common',    50000,   1000,   250, true),
  ('shirt_deep_purple', 'Deep Purple',         'common',    50000,   1000,   250, true),
  ('shirt_magenta',     'Magenta',             'common',    50000,   1000,   250, true),
  ('shirt_dark_pink',   'Dark Pink',           'common',    50000,   1000,   250, true),
  -- Shirt colors (uncommon)
  ('shirt_purple',   'Purple',                 'uncommon',  250000,  10000,  50,  true),
  ('shirt_hot_pink', 'Hot Pink',               'uncommon',  250000,  10000,  50,  true),
  -- Patterns (legendary, 1 of 1)
  ('pattern_tiger',        'Tiger Pattern',        'legendary', 3000000, 100000, 1, true),
  ('pattern_zebra',        'Zebra Pattern',        'legendary', 3000000, 100000, 1, true),
  ('pattern_leopard',      'Leopard Pattern',      'legendary', 3000000, 100000, 1, true),
  ('pattern_camo',         'Camo Pattern',         'legendary', 3000000, 100000, 1, true),
  ('pattern_rainbow',      'Rainbow Pattern',      'legendary', 3000000, 100000, 1, true),
  ('pattern_galaxy',       'Galaxy Pattern',       'legendary', 3000000, 100000, 1, true),
  ('pattern_checkerboard', 'Checkerboard Pattern', 'legendary', 3000000, 100000, 1, true),
  -- Feature (rare, 15 max — up to 15 players can have custom token avatars)
  ('feature_custom_bg', 'Custom Token Avatar',     'rare',      750000,  25000,  15, true)
ON CONFLICT (item_key) DO UPDATE SET
  display_name  = EXCLUDED.display_name,
  tier          = EXCLUDED.tier,
  price_pls     = EXCLUDED.price_pls,
  price_morbius = EXCLUDED.price_morbius,
  max_supply    = EXCLUDED.max_supply,
  is_active     = EXCLUDED.is_active;

-- ─── 3. Marketplace listings table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS market_listings (
  id             BIGSERIAL PRIMARY KEY,
  seller_address VARCHAR(42)  NOT NULL,
  item_key       VARCHAR(100) NOT NULL REFERENCES cosmetic_items(item_key),
  price_morbius  NUMERIC(20,0) NOT NULL,           -- human-readable token units
  status         VARCHAR(20)  NOT NULL DEFAULT 'active', -- active | sold | cancelled
  listed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  sold_at        TIMESTAMPTZ,
  buyer_address  VARCHAR(42),
  tx_hash        VARCHAR(66)                        -- on-chain tx of the sale
);

-- One active listing per (seller, item) at a time
CREATE UNIQUE INDEX IF NOT EXISTS market_listings_active_unique
  ON market_listings (seller_address, item_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS market_listings_status_idx  ON market_listings (status);
CREATE INDEX IF NOT EXISTS market_listings_item_idx    ON market_listings (item_key);
CREATE INDEX IF NOT EXISTS market_listings_seller_idx  ON market_listings (seller_address);
