-- Hide items from public shop without deleting rows (owners keep items).
ALTER TABLE cosmetic_items
  ADD COLUMN IF NOT EXISTS shop_listed BOOLEAN NOT NULL DEFAULT true;
