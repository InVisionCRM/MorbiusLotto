/**
 * Casino theme knobs.
 *
 * Every Tailwind colour utility in the app resolves through the generated
 * token layer in `app/theme-tokens.css`, so the four knobs below — set on
 * `document.documentElement` — restyle every screen at once with no rebuild
 * and no component changes.
 *
 * Regenerate the token layer with: node scripts/generate-theme-tokens.js
 */

/** Colour families the token layer exposes, grouped for the editor UI. */
export const THEME_FAMILY_GROUPS = [
  {
    label: 'Core',
    hint: 'Brand accent and the neutral surfaces built on top of it.',
    families: ['cyan', 'slate', 'gray', 'zinc', 'neutral', 'stone'],
  },
  {
    label: 'Outcomes',
    hint: 'Wins, losses and premium/VIP highlights.',
    families: ['emerald', 'green', 'red', 'rose', 'amber', 'yellow'],
  },
  {
    label: 'Secondary',
    hint: 'Accents used by individual games and badges.',
    families: [
      'blue', 'sky', 'teal', 'indigo', 'violet',
      'purple', 'fuchsia', 'pink', 'orange', 'lime',
    ],
  },
] as const;

export const THEME_FAMILIES: string[] = THEME_FAMILY_GROUPS.flatMap(
  (g) => [...g.families]
);

/** The four knobs each family exposes, with their editor ranges. */
export const THEME_KNOBS = [
  { key: 'h', label: 'Hue', suffix: '°', min: -180, max: 180, step: 1, def: 0 },
  { key: 'c', label: 'Chroma', suffix: '×', min: 0, max: 3, step: 0.05, def: 1 },
  { key: 'l', label: 'Lightness', suffix: '×', min: 0.4, max: 1.6, step: 0.01, def: 1 },
  { key: 'l-shift', label: 'Lift', suffix: '%', min: -25, max: 25, step: 1, def: 0 },
] as const;

export type ThemeKnobKey = (typeof THEME_KNOBS)[number]['key'];

/** Sparse map of `"<family>.<knob>"` to value. Absent entries use the default. */
export type ThemeAdjustments = Record<string, number>;

export interface CasinoThemePreset {
  id: string;
  name: string;
  description: string;
  adjustments: ThemeAdjustments;
}

export const THEME_STORAGE_KEY = 'morblotto:theme-studio';
export const THEME_QUERY_PARAM = 'theme';

function knobDefault(knob: ThemeKnobKey): number {
  return THEME_KNOBS.find((k) => k.key === knob)!.def;
}

/** CSS custom property backing one knob, e.g. `--ct-cyan-h`. */
export function cssVarFor(family: string, knob: ThemeKnobKey): string {
  return `--ct-${family}-${knob}`;
}

/** `l-shift` is a percentage; the rest are plain numbers. */
function formatKnobValue(knob: ThemeKnobKey, value: number): string {
  return knob === 'l-shift' ? `${value}%` : String(value);
}

/**
 * Writes adjustments onto an element (normally `document.documentElement`).
 * Knobs left at their default are removed rather than written, so the
 * stylesheet default applies and exported themes stay small.
 */
export function applyTheme(
  adjustments: ThemeAdjustments,
  target?: HTMLElement | null
): void {
  const el = target ?? (typeof document !== 'undefined' ? document.documentElement : null);
  if (!el) return;

  for (const family of THEME_FAMILIES) {
    for (const { key } of THEME_KNOBS) {
      const prop = cssVarFor(family, key);
      const value = adjustments[`${family}.${key}`];
      if (value === undefined || value === knobDefault(key)) {
        el.style.removeProperty(prop);
      } else {
        el.style.setProperty(prop, formatKnobValue(key, value));
      }
    }
  }
}

/** Drops no-op entries so presets and exports only carry real changes. */
export function pruneAdjustments(adjustments: ThemeAdjustments): ThemeAdjustments {
  const out: ThemeAdjustments = {};
  for (const [key, value] of Object.entries(adjustments)) {
    const knob = key.split('.')[1] as ThemeKnobKey;
    if (!knob || value === knobDefault(knob)) continue;
    out[key] = value;
  }
  return out;
}

/** Emits a `:root { ... }` block suitable for pasting into a stylesheet. */
export function toCss(adjustments: ThemeAdjustments): string {
  const pruned = pruneAdjustments(adjustments);
  const lines = Object.entries(pruned)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => {
      const [family, knob] = key.split('.') as [string, ThemeKnobKey];
      return `  ${cssVarFor(family, knob)}: ${formatKnobValue(knob, value)};`;
    });
  return lines.length ? `:root {\n${lines.join('\n')}\n}` : ':root {\n  /* no changes */\n}';
}

/** Compact URL-safe encoding so a look can be shared as a link. */
export function encodeTheme(adjustments: ThemeAdjustments): string {
  const pruned = pruneAdjustments(adjustments);
  return Object.entries(pruned)
    .map(([key, value]) => `${key}:${value}`)
    .join(',');
}

export function decodeTheme(encoded: string): ThemeAdjustments {
  const out: ThemeAdjustments = {};
  for (const part of encoded.split(',')) {
    const [key, raw] = part.split(':');
    if (!key || raw === undefined) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) out[key] = value;
  }
  return pruneAdjustments(out);
}

/**
 * Starting points, not destinations — each one is a handful of knob changes
 * meant to be pulled apart in the studio.
 */
export const BUILT_IN_PRESETS: CasinoThemePreset[] = [
  {
    id: 'default',
    name: 'House',
    description: 'Shipping look. Every knob at its default.',
    adjustments: {},
  },
  {
    id: 'high-roller',
    name: 'High Roller',
    description: 'Cyan pushed to gold, surfaces warmed. Reads richer, less arcade.',
    adjustments: {
      'cyan.h': 148, 'cyan.c': 0.85,
      'slate.h': 55, 'slate.c': 1.7, 'slate.l': 0.94,
      'amber.c': 1.2,
    },
  },
  {
    id: 'blood-orange',
    name: 'Blood Orange',
    description: 'Hot accent over near-black. High contrast, low blue.',
    adjustments: {
      'cyan.h': -175, 'cyan.c': 1.25,
      'slate.h': 30, 'slate.c': 0.9, 'slate.l': 0.86,
      'amber.h': -18,
    },
  },
  {
    id: 'ultraviolet',
    name: 'Ultraviolet',
    description: 'Accent swung to violet with punchier surfaces.',
    adjustments: {
      'cyan.h': 75, 'cyan.c': 1.35,
      'slate.h': -25, 'slate.c': 2.2, 'slate.l': 0.92,
      'emerald.h': 40,
    },
  },
  {
    id: 'noir',
    name: 'Noir',
    description: 'Colour drained from the chrome; wins and losses still read.',
    adjustments: {
      'cyan.c': 0.12,
      'slate.c': 0.2, 'slate.l': 0.9,
      'gray.c': 0, 'zinc.c': 0,
      'amber.c': 0.5,
    },
  },
  {
    id: 'daylight',
    name: 'Daylight',
    description: 'Surfaces lifted well above the dark baseline. Stress-tests contrast.',
    adjustments: {
      'slate.l': 1.35, 'slate.c': 0.7,
      'gray.l': 1.35, 'zinc.l': 1.35,
      'cyan.l': 0.86, 'cyan.c': 1.1,
    },
  },
];
