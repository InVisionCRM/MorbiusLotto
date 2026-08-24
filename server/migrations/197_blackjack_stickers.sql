-- 197_blackjack_stickers.sql
--
-- The sticker library for Create-A-Table.
--
-- Layer work (lib/table-layers.ts) added a `sticker` layer kind so a decal can
-- sit on the cloth. A decal a creator typed themselves — the vision board's
-- "★ MORB" — needs nothing here: it's text, it lives in the design blob, and
-- it's rendered only for whoever opens that table.
--
-- An UPLOADED decal is different, and this table exists for that difference.
-- An image someone uploads can be shown to other players, so it needs an owner,
-- a review state, and a record of who decided. Unmoderated user images on a
-- shared surface is the one part of this feature that can actually go wrong.
--
-- Storage follows the same "no object storage, put the blob in the column"
-- precedent as 014_tournament_custom_image.sql and 196_blackjack_table_designs
-- .sql: the image arrives from the browser as a data: URI and is kept verbatim.
-- The route caps the byte size; the column is unbounded so a future larger cap
-- doesn't need a migration.

CREATE TABLE IF NOT EXISTS blackjack_stickers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           VARCHAR(24) NOT NULL UNIQUE,
  owner_address  VARCHAR(42) NOT NULL,
  name           VARCHAR(48) NOT NULL,
  image          TEXT NOT NULL,
  image_bytes    INTEGER NOT NULL,

  -- 'pending'  — uploaded, usable by its owner, not offered to anyone else
  -- 'approved' — cleared for the shared library
  -- 'rejected' — refused; kept rather than deleted so the same image can be
  --              recognised on re-upload and the owner can be told why
  -- 'deleted'  — withdrawn by the owner (soft, so a table still referencing it
  --              can be reasoned about instead of silently breaking)
  status         VARCHAR(16) NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected', 'deleted')),

  -- Who decided, when, and why. reviewed_by is an admin wallet, not a user id,
  -- because that's the only identity the admin surface has.
  reviewed_by    VARCHAR(42),
  reviewed_at    TIMESTAMPTZ,
  review_note    VARCHAR(240),

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bj_stickers_owner  ON blackjack_stickers(owner_address);
CREATE INDEX IF NOT EXISTS idx_bj_stickers_status ON blackjack_stickers(status);

-- The moderation queue is the one read that runs on every admin page load and
-- is not owner-scoped, so it gets its own ordering index.
CREATE INDEX IF NOT EXISTS idx_bj_stickers_pending
  ON blackjack_stickers(created_at ASC) WHERE status = 'pending';

-- The public library: approved only, newest first.
CREATE INDEX IF NOT EXISTS idx_bj_stickers_approved
  ON blackjack_stickers(created_at DESC) WHERE status = 'approved';
