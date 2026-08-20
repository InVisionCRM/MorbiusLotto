-- 196_blackjack_table_designs.sql
--
-- Create-A-Table saves for everyone.
--
-- Until now the table studio could only write a theme onto an existing
-- multiplayer table, through /api/admin/bj-multi/tables/:id/theme, behind the
-- admin wallet check. That means a player who spent an hour designing a table
-- had nowhere to put it. This table gives every wallet its own saved designs,
-- following the same shape the community slot machines use
-- (190_community_slot_machines.sql): server-generated slug as the public id,
-- owner address from the session (never from the client), the design blob in
-- JSONB, and a status enum.
--
-- `design` holds a whole BlackjackTableThemeConfig — { layout, sounds, soundFx }
-- — verbatim, including inline data: URIs for uploaded art. That's the same
-- object the admin theme route already stores per table, so a design saved
-- here can be pushed onto a live table later without conversion, and the same
-- "no object storage, put the blob in the column" precedent as
-- 014_tournament_custom_image.sql.

CREATE TABLE IF NOT EXISTS blackjack_table_designs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              VARCHAR(24) NOT NULL UNIQUE,
  owner_address     VARCHAR(42) NOT NULL,
  name              VARCHAR(48) NOT NULL,
  design            JSONB NOT NULL,
  design_size_bytes INTEGER NOT NULL,
  status            VARCHAR(16) NOT NULL DEFAULT 'saved'
                      CHECK (status IN ('saved', 'published', 'disabled')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bj_table_designs_owner  ON blackjack_table_designs(owner_address);
CREATE INDEX IF NOT EXISTS idx_bj_table_designs_status ON blackjack_table_designs(status);

-- One wallet shouldn't be able to fill the table with thousands of drafts;
-- the route caps the count, this keeps the lookup it does cheap.
CREATE INDEX IF NOT EXISTS idx_bj_table_designs_owner_updated
  ON blackjack_table_designs(owner_address, updated_at DESC);
