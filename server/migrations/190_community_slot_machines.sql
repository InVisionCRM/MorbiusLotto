-- 190_community_slot_machines.sql — MORBlotto: community-built slot machines.
--
-- Machines are designed in public/slot-builder-lab.html (symbols, win mode,
-- bonus round, art) and exported as a single cleanDef() JSON blob. There is
-- no object storage anywhere in this codebase, so — same as
-- 014_tournament_custom_image.sql and chat_display_names.profile_image_url —
-- the blob (inline data: URIs for symbol art included) is stored verbatim in
-- one JSONB column rather than standing up new storage infra.
--
-- These cabinets are play-money only (cabinet-engine.js's balance lives in
-- the player's own localStorage, never touches a wallet or a ledger), so the
-- RTP columns below are an informational fairness signal for the creator and
-- players, not a financial safety gate.

CREATE TABLE IF NOT EXISTS community_slot_machines (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Public, non-enumerable id used in every public-facing URL (embed src,
  -- the public def endpoint). Server-generated (crypto.randomBytes, base62),
  -- never derived from id/name/owner, so machines can't be scraped in order.
  slug             VARCHAR(24) NOT NULL UNIQUE,

  owner_address    VARCHAR(42) NOT NULL,
  name             VARCHAR(48) NOT NULL,

  -- The exact cleanDef() blob from the builder, verbatim, art included.
  machine_def      JSONB NOT NULL,
  def_size_bytes   INTEGER NOT NULL,

  -- 'draft'     — saved, not fetchable by the public def endpoint
  -- 'published' — publicly playable and embeddable
  -- 'disabled'  — soft-deleted by the owner; row kept for audit trail
  status           VARCHAR(16) NOT NULL DEFAULT 'draft',

  -- Most recent server-side simulate() run (server/src/lib/cabinet-math-runner.ts).
  -- NULL fields = never validated yet.
  rtp_pct          NUMERIC(6,2),
  hit_pct          NUMERIC(6,2),
  max_x_win        NUMERIC(10,2),
  sim_spins        INTEGER,
  -- Outside the sane RTP/max-win band. Informational only — shown to the
  -- creator as a warning, never blocks /publish (see migration header).
  rtp_flagged      BOOLEAN NOT NULL DEFAULT FALSE,
  validated_at     TIMESTAMPTZ,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT community_slot_machines_status_chk
    CHECK (status IN ('draft', 'published', 'disabled'))
);

CREATE INDEX IF NOT EXISTS idx_community_slot_machines_owner
  ON community_slot_machines (owner_address);
CREATE INDEX IF NOT EXISTS idx_community_slot_machines_status
  ON community_slot_machines (status);

COMMENT ON TABLE community_slot_machines IS
  'Community-designed slot machines from the builder — one row per saved machine, publicly embeddable once published.';
COMMENT ON COLUMN community_slot_machines.slug IS
  'Server-generated public id used in /embed/<slug> and the public def endpoint. Never client-supplied.';
COMMENT ON COLUMN community_slot_machines.machine_def IS
  'Verbatim cleanDef() JSON from the builder, including inline data: URI symbol art.';
COMMENT ON COLUMN community_slot_machines.rtp_flagged IS
  'Simulated RTP or max win fell outside the sane band. Informational — these cabinets are play-money only, so this warns rather than blocks.';
