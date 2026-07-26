-- 174_arcade_seed_pairs_rollout.sql — extend the persistent PF seed pair
-- (migration 173) to the remaining instant, one-shot chip games.
--
-- Same change as 173 applied to Dice/Limbo/Roulette, now for:
--   DiceX2, Baccarat, Dragon Tiger, Andar Bahar, Cascade, Pachinko, Keno, Plinko.
--
-- Each bet row gains a seed_pair_id link to arcade_seed_pairs so verify can
-- fetch the plaintext once the pair is revealed (rotated), and server_seed is
-- made nullable — going forward the plaintext is NOT written onto the bet row;
-- it lives only in arcade_seed_pair_pending until the player rotates. Legacy
-- rows keep their inline server_seed and still verify unchanged.
--
-- server_seed DROP NOT NULL is a no-op where the column is already nullable.

-- DiceX2
ALTER TABLE arcade_dicex2_rounds       ADD COLUMN IF NOT EXISTS seed_pair_id UUID REFERENCES arcade_seed_pairs(id);
ALTER TABLE arcade_dicex2_rounds       ALTER COLUMN server_seed DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_arcade_dicex2_rounds_seed_pair      ON arcade_dicex2_rounds (seed_pair_id);

-- Baccarat (table is arcade_baccarat_hands)
ALTER TABLE arcade_baccarat_hands      ADD COLUMN IF NOT EXISTS seed_pair_id UUID REFERENCES arcade_seed_pairs(id);
ALTER TABLE arcade_baccarat_hands      ALTER COLUMN server_seed DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_arcade_baccarat_hands_seed_pair     ON arcade_baccarat_hands (seed_pair_id);

-- Dragon Tiger
ALTER TABLE arcade_dragon_tiger_rounds ADD COLUMN IF NOT EXISTS seed_pair_id UUID REFERENCES arcade_seed_pairs(id);
ALTER TABLE arcade_dragon_tiger_rounds ALTER COLUMN server_seed DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_arcade_dragon_tiger_rounds_seed_pair ON arcade_dragon_tiger_rounds (seed_pair_id);

-- Andar Bahar
ALTER TABLE arcade_andar_bahar_rounds  ADD COLUMN IF NOT EXISTS seed_pair_id UUID REFERENCES arcade_seed_pairs(id);
ALTER TABLE arcade_andar_bahar_rounds  ALTER COLUMN server_seed DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_arcade_andar_bahar_rounds_seed_pair ON arcade_andar_bahar_rounds (seed_pair_id);

-- Cascade
ALTER TABLE arcade_cascade_rounds      ADD COLUMN IF NOT EXISTS seed_pair_id UUID REFERENCES arcade_seed_pairs(id);
ALTER TABLE arcade_cascade_rounds      ALTER COLUMN server_seed DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_arcade_cascade_rounds_seed_pair     ON arcade_cascade_rounds (seed_pair_id);

-- Pachinko
ALTER TABLE arcade_pachinko_rounds     ADD COLUMN IF NOT EXISTS seed_pair_id UUID REFERENCES arcade_seed_pairs(id);
ALTER TABLE arcade_pachinko_rounds     ALTER COLUMN server_seed DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_arcade_pachinko_rounds_seed_pair    ON arcade_pachinko_rounds (seed_pair_id);

-- Keno
ALTER TABLE keno_rounds                ADD COLUMN IF NOT EXISTS seed_pair_id UUID REFERENCES arcade_seed_pairs(id);
ALTER TABLE keno_rounds                ALTER COLUMN server_seed DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_keno_rounds_seed_pair               ON keno_rounds (seed_pair_id);

-- Plinko
ALTER TABLE plinko_rounds              ADD COLUMN IF NOT EXISTS seed_pair_id UUID REFERENCES arcade_seed_pairs(id);
ALTER TABLE plinko_rounds              ALTER COLUMN server_seed DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plinko_rounds_seed_pair             ON plinko_rounds (seed_pair_id);
