/**
 * The saved table theme — what `blackjack_multi_tables.theme_config` stores.
 *
 * This is exactly the shape the designer exports and the live table consumes:
 * sparse layout overrides, sparse sound-event overrides, and sparse per-event
 * FX. All three sections are optional; an absent section means "stock".
 *
 * Presentation only. There is deliberately no field here that game logic
 * reads, so a theme can restyle a table but can never touch dealing, payouts
 * or timing of play.
 */

import type { BlackjackTableLayout, DeepPartial } from '@/lib/blackjack-table-layout';
import type { BlackjackSoundOverrides } from '@/lib/blackjack-sounds';
import type { SoundFxMap } from '@/lib/blackjack-sound-fx';

export interface BlackjackTableThemeConfig {
  version: 1;
  layout?: DeepPartial<BlackjackTableLayout>;
  sounds?: BlackjackSoundOverrides;
  soundFx?: SoundFxMap;
}

/** Sound URLs a theme may reference: same-origin paths or absolute http(s). */
export function isAllowedThemeSoundUrl(url: string): boolean {
  return url.startsWith('/') || /^https?:\/\//i.test(url);
}

/**
 * Client-side defensive filter over a theme that arrived from the server.
 *
 * The server validates on write, but table state flows through websockets and
 * old rows can outlive validation rules — so the renderer re-checks the parts
 * whose failure modes are ugly (non-object sections, sound entries that are
 * not URL strings) and drops just those, keeping the rest of the theme.
 */
export function sanitizeThemeConfig(raw: unknown): BlackjackTableThemeConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const out: BlackjackTableThemeConfig = { version: 1 };

  if (r.layout && typeof r.layout === 'object' && !Array.isArray(r.layout)) {
    out.layout = r.layout as DeepPartial<BlackjackTableLayout>;
  }

  if (r.sounds && typeof r.sounds === 'object' && !Array.isArray(r.sounds)) {
    const sounds: BlackjackSoundOverrides = {};
    for (const [key, pool] of Object.entries(r.sounds as Record<string, unknown>)) {
      if (!Array.isArray(pool)) continue;
      const clean = pool.filter((p): p is string => typeof p === 'string' && isAllowedThemeSoundUrl(p));
      // An explicitly-empty pool is a deliberate mute and survives; a pool that
      // only contained garbage does not get to silence the event by accident.
      if (pool.length === 0 || clean.length > 0) {
        (sounds as Record<string, string[]>)[key] = clean;
      }
    }
    if (Object.keys(sounds).length > 0) out.sounds = sounds;
  }

  if (r.soundFx && typeof r.soundFx === 'object' && !Array.isArray(r.soundFx)) {
    const fx: SoundFxMap = {};
    for (const [key, val] of Object.entries(r.soundFx as Record<string, unknown>)) {
      if (val && typeof val === 'object' && !Array.isArray(val)) fx[key] = val as SoundFxMap[string];
    }
    if (Object.keys(fx).length > 0) out.soundFx = fx;
  }

  return out.layout || out.sounds || out.soundFx ? out : null;
}
