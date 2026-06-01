import type { Emotion } from '@/components/avatar';

/**
 * Directed (player → player) emotes for poker. A seated player throws one of these
 * AT another seated player: a bubble pops above the sender, arcs across to the target,
 * and both avatars react (sender plays `sender`, target plays `target`).
 *
 * The server validates the incoming `kind` against the same id set (mirrored in
 * `server/src/services/websocket.service.impl.js` as `POKER_DIRECTED_EMOTE_KINDS` —
 * keep the two lists in sync). Every `sender`/`target` value MUST be a valid `Emotion`
 * supported by `AvatarPreview`, since they are routed through the existing
 * per-seat broadcast-emotion mechanism.
 */
export interface PokerDirectedEmote {
  glyph: string;
  label: string;
  sender: Emotion;
  target: Emotion;
  /**
   * When set, this "emote" is a physical projectile rendered specially instead of a chat
   * bubble: `arrow` flies to the target and STICKS in its circle border (arrows accumulate
   * into a pincushion, cleared each hand); `snowball` flies and SHATTERS against the border.
   */
  projectile?: 'arrow' | 'snowball';
}

const POKER_DIRECTED_EMOTES_DEF = {
  haha:  { glyph: '😂', label: 'HAHA', sender: 'happy', target: 'angry' },
  love:  { glyph: '❤️', label: '',     sender: 'love',  target: 'love' },
  gg:    { glyph: '🤝', label: 'GG',   sender: 'nod',   target: 'happy' },
  nice:  { glyph: '👏', label: '',     sender: 'happy', target: 'happy' },
  boo:   { glyph: '👎', label: 'BOO',  sender: 'angry', target: 'sad' },
  fire:  { glyph: '🔥', label: '',     sender: 'cool',  target: 'shock' },
  dance: { glyph: '🕺', label: '',     sender: 'dance', target: 'happy' },
  money: { glyph: '🤑', label: '',     sender: 'money', target: 'surprised' },
  arrow:    { glyph: '🏹', label: '', sender: 'angry', target: 'shock',     projectile: 'arrow' },
  snowball: { glyph: '❄️', label: '', sender: 'happy', target: 'surprised', projectile: 'snowball' },
} satisfies Record<string, PokerDirectedEmote>;

export type PokerDirectedEmoteKind = keyof typeof POKER_DIRECTED_EMOTES_DEF;

/** Widened to `PokerDirectedEmote` so the optional `projectile` field is accessible on any entry. */
export const POKER_DIRECTED_EMOTES: Record<PokerDirectedEmoteKind, PokerDirectedEmote> = POKER_DIRECTED_EMOTES_DEF;

export const POKER_DIRECTED_EMOTE_KINDS = Object.keys(POKER_DIRECTED_EMOTES) as PokerDirectedEmoteKind[];

export function isPokerDirectedEmoteKind(v: unknown): v is PokerDirectedEmoteKind {
  return typeof v === 'string' && v in POKER_DIRECTED_EMOTES;
}

/**
 * Total travel time of the bubble (appear → hold → arc → land). The `PokerTable`
 * Framer-Motion transition and the overlay-hook auto-remove timeout both derive from
 * this so the bubble and its DOM node disappear together.
 */
export const POKER_DIRECTED_EMOTE_FLY_MS = 1600;

/** Projectile travel time (arrow/snowball fly straight, fast). Target reacts on landing. */
export const POKER_PROJECTILE_FLY_MS = 460;
/** Total lifetime of a snowball flight (travel + shatter); arrows hand off to a stuck arrow at FLY_MS. */
export const POKER_PROJECTILE_TOTAL_MS = 1100;
/** Max arrows stuck on one player before the oldest drops off. */
export const POKER_MAX_STUCK_ARROWS = 10;
