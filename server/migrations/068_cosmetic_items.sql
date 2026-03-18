-- Migration 068: Cosmetic items catalog and player inventory

-- Item catalog (seeded with all purchasable items)
CREATE TABLE IF NOT EXISTS cosmetic_items (
  item_key       VARCHAR(100) PRIMARY KEY,
  display_name   VARCHAR(100) NOT NULL,
  tier           VARCHAR(20)  NOT NULL DEFAULT 'common', -- common | rare | legendary
  price_pls      NUMERIC(20)  NOT NULL DEFAULT 0,        -- in PLS (human-readable)
  price_morbius  NUMERIC(20)  NOT NULL DEFAULT 0,        -- in MORBIUS tokens
  is_active      BOOLEAN      NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Per-player inventory
CREATE TABLE IF NOT EXISTS player_cosmetics (
  id              BIGSERIAL PRIMARY KEY,
  wallet_address  VARCHAR(42) NOT NULL,
  item_key        VARCHAR(100) NOT NULL REFERENCES cosmetic_items(item_key) ON DELETE CASCADE,
  acquired_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acquired_from   VARCHAR(42),          -- NULL = purchased; otherwise gifter's address
  UNIQUE(wallet_address, item_key)
);

CREATE INDEX IF NOT EXISTS idx_player_cosmetics_wallet ON player_cosmetics(wallet_address);

-- ─── Seed catalog ─────────────────────────────────────────────────────────────

INSERT INTO cosmetic_items (item_key, display_name, tier, price_pls, price_morbius) VALUES
  -- Skin colors (common)
  ('skin_rosy',        'Rosy Skin',        'common', 50000, 1000),
  ('skin_mauve',       'Mauve Skin',       'common', 50000, 1000),
  ('skin_purple_gray', 'Dusk Skin',        'common', 50000, 1000),
  ('skin_slate',       'Slate Skin',       'common', 50000, 1000),
  ('skin_night',       'Night Skin',       'common', 50000, 1000),
  -- Skin colors (rare)
  ('skin_neon_green',  'Neon Green',       'rare',  250000, 5000),
  ('skin_sky_blue',    'Sky Blue',         'rare',  250000, 5000),
  ('skin_crimson',     'Crimson',          'rare',  250000, 5000),
  ('skin_hot_pink',    'Hot Pink',         'rare',  250000, 5000),
  ('skin_gold',        'Gold Skin',        'rare',  250000, 5000),
  ('skin_silver',      'Silver Skin',      'rare',  250000, 5000),
  ('skin_ice',         'Ice Skin',         'rare',  250000, 5000),
  ('skin_light_pink',  'Cotton Candy',     'rare',  250000, 5000),
  ('skin_ghost',       'Ghost White',      'rare',  250000, 5000),
  ('skin_void',        'Void Black',       'rare',  250000, 5000),
  -- Skin colors (legendary)
  ('skin_violet',      'Violet',           'legendary', 1000000, 25000),
  ('skin_olive',       'Dark Olive',       'legendary', 1000000, 25000),
  ('skin_orange_red',  'Phoenix',          'legendary', 1000000, 25000),
  ('skin_magenta',     'Magenta',          'legendary', 1000000, 25000),
  ('skin_cyan',        'Cyan',             'legendary', 1000000, 25000),
  ('skin_yellow',      'Canary',           'legendary', 1000000, 25000),
  ('skin_navy',        'Deep Navy',        'legendary', 1000000, 25000),
  ('skin_chartreuse',  'Toxic Green',      'legendary', 1000000, 25000),
  -- Hair styles (common)
  ('hair_style_spiky',      'Spiky',      'common', 50000, 1000),
  ('hair_style_messy',      'Messy',      'common', 50000, 1000),
  -- Hair styles (rare)
  ('hair_style_pigtails',   'Pigtails',   'rare',  250000, 5000),
  ('hair_style_mullet',     'Mullet',     'rare',  250000, 5000),
  -- Hair styles (legendary)
  ('hair_style_mohawk',     'Mohawk',     'legendary', 1000000, 25000),
  ('hair_style_dreadlocks', 'Dreadlocks', 'legendary', 1000000, 25000),
  -- Hair colors (common)
  ('hair_color_ash',        'Ash Brown',      'common', 50000, 1000),
  ('hair_color_ash2',       'Ash Blonde',     'common', 50000, 1000),
  ('hair_color_dirty_blond','Dirty Blonde',   'common', 50000, 1000),
  ('hair_color_sandy',      'Sandy',          'common', 50000, 1000),
  ('hair_color_caramel',    'Caramel',        'common', 50000, 1000),
  ('hair_color_honey',      'Honey',          'common', 50000, 1000),
  ('hair_color_ginger',     'Ginger',         'common', 50000, 1000),
  ('hair_color_chestnut',   'Chestnut',       'common', 50000, 1000),
  ('hair_color_dk_brown',   'Dark Chocolate', 'common', 50000, 1000),
  ('hair_color_espresso',   'Espresso',       'common', 50000, 1000),
  ('hair_color_walnut',     'Walnut',         'common', 50000, 1000),
  ('hair_color_mocha',      'Mocha',          'common', 50000, 1000),
  ('hair_color_truffle',    'Truffle',        'common', 50000, 1000),
  ('hair_color_oak',        'Oak',            'common', 50000, 1000),
  ('hair_color_toffee',     'Toffee',         'common', 50000, 1000),
  ('hair_color_wheat',      'Wheat',          'common', 50000, 1000),
  -- Hair colors (rare - fantasy)
  ('hair_color_vivid_red',  'Vivid Red',    'rare', 250000, 5000),
  ('hair_color_vivid_blue', 'Vivid Blue',   'rare', 250000, 5000),
  ('hair_color_vivid_grn',  'Vivid Green',  'rare', 250000, 5000),
  ('hair_color_vivid_purp', 'Vivid Purple', 'rare', 250000, 5000),
  -- Accessories (common)
  ('acc_glasses',   'Glasses',      'common', 50000, 1000),
  ('acc_earrings',  'Earrings',     'common', 50000, 1000),
  -- Accessories (rare)
  ('acc_aviators',  'Aviators',     'rare',  250000, 5000),
  ('acc_wayfarers', 'Wayfarers',    'rare',  250000, 5000),
  ('acc_headband',  'Headband',     'rare',  250000, 5000),
  -- Accessories (legendary)
  ('acc_round',     'Round Glasses',   'legendary', 1000000, 25000),
  ('acc_cyberpunk', 'Cyberpunk Visor', 'legendary', 1000000, 25000),
  -- Hats
  ('hat_bandana',  'Bandana',   'common',    50000, 1000),
  ('hat_cowboy',   'Cowboy Hat','rare',     250000, 5000),
  ('hat_top_hat',  'Top Hat',   'rare',     250000, 5000),
  ('hat_crown',    'Crown',     'legendary',1000000, 25000),
  -- Necklaces
  ('neck_silver',  'Silver Chain', 'common',    50000, 1000),
  ('neck_pearl',   'Pearl',        'rare',     250000, 5000),
  ('neck_gold',    'Gold Chain',   'rare',     250000, 5000),
  ('neck_pendant', 'Pendant',      'legendary',1000000, 25000),
  -- Shirt colors (common)
  ('shirt_dark_red',   'Dark Red',     'common', 50000, 1000),
  ('shirt_maroon',     'Maroon',       'common', 50000, 1000),
  ('shirt_orange',     'Orange',       'common', 50000, 1000),
  ('shirt_burnt',      'Burnt Orange', 'common', 50000, 1000),
  ('shirt_yellow',     'Yellow',       'common', 50000, 1000),
  ('shirt_gold',       'Gold',         'common', 50000, 1000),
  ('shirt_forest',     'Forest',       'common', 50000, 1000),
  ('shirt_dark_green', 'Dark Green',   'common', 50000, 1000),
  ('shirt_teal',       'Teal',         'common', 50000, 1000),
  ('shirt_navy',       'Navy',         'common', 50000, 1000),
  ('shirt_dark_navy',  'Dark Navy',    'common', 50000, 1000),
  ('shirt_cyan',       'Cyan',         'common', 50000, 1000),
  ('shirt_dark_purple','Dark Purple',  'common', 50000, 1000),
  ('shirt_deep_purple','Deep Purple',  'common', 50000, 1000),
  ('shirt_magenta',    'Magenta',      'common', 50000, 1000),
  ('shirt_dark_pink',  'Dark Pink',    'common', 50000, 1000),
  -- Shirt colors (rare)
  ('shirt_purple',   'Purple',   'rare', 250000, 5000),
  ('shirt_hot_pink', 'Hot Pink', 'rare', 250000, 5000),
  -- Patterns (legendary - unlock skin + hair + shirt)
  ('pattern_tiger',        'Tiger Pattern',        'legendary', 1000000, 25000),
  ('pattern_zebra',        'Zebra Pattern',        'legendary', 1000000, 25000),
  ('pattern_leopard',      'Leopard Pattern',      'legendary', 1000000, 25000),
  ('pattern_camo',         'Camo Pattern',         'legendary', 1000000, 25000),
  ('pattern_rainbow',      'Rainbow Pattern',      'legendary', 1000000, 25000),
  ('pattern_galaxy',       'Galaxy Pattern',       'legendary', 1000000, 25000),
  ('pattern_checkerboard', 'Checkerboard Pattern', 'legendary', 1000000, 25000),
  -- Custom background feature
  ('feature_custom_bg', 'Custom Token Avatar', 'legendary', 1000000, 25000)
ON CONFLICT (item_key) DO UPDATE
  SET display_name  = EXCLUDED.display_name,
      tier          = EXCLUDED.tier,
      price_pls     = EXCLUDED.price_pls,
      price_morbius = EXCLUDED.price_morbius;
