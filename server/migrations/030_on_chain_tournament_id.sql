-- Add on-chain tournament ID for MorbiusTournament contract integration.
-- When set, server calls setCompleted(tournamentId) on contract after distributePrizes.
ALTER TABLE tournaments ADD COLUMN IF NOT EXISTS on_chain_tournament_id BIGINT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_tournaments_on_chain_id ON tournaments(on_chain_tournament_id) WHERE on_chain_tournament_id IS NOT NULL;
