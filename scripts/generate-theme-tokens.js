#!/usr/bin/env node
/**
 * Generates app/theme-tokens.css — the runtime-tunable colour layer.
 *
 * Reads Tailwind's own OKLCH palette out of node_modules and re-emits every
 * shade as `oklch()` built from calc() expressions driven by three knobs per
 * family (lightness / chroma / hue). Then it re-points Tailwind's `--color-*`
 * tokens at those values via `@theme inline`, so every existing utility in the
 * app (`bg-cyan-500`, `text-slate-400/60`, ...) resolves through the knobs
 * without a single component edit.
 *
 * With all knobs at their defaults the emitted values are algebraically
 * identical to stock Tailwind, so generating this file changes nothing on
 * screen until someone actually turns a knob.
 *
 * Run: node scripts/generate-theme-tokens.js
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const TAILWIND_THEME = path.join(REPO_ROOT, 'node_modules/tailwindcss/theme.css');
const OUT_FILE = path.join(REPO_ROOT, 'app/theme-tokens.css');

/**
 * Colour families the app actually uses, ordered by usage count so the
 * generated file reads roughly most-important-first.
 */
const FAMILIES = [
  'cyan', 'slate', 'gray', 'amber', 'red', 'zinc', 'emerald', 'rose',
  'blue', 'green', 'purple', 'yellow', 'neutral', 'orange', 'violet',
  'indigo', 'fuchsia', 'pink', 'teal', 'lime', 'sky', 'stone',
];

/**
 * Semantic aliases layered on top of the family ramps. Components can migrate
 * to these names over time; until then both spellings resolve to the same
 * value, so the alias layer is additive and never a breaking change.
 */
const SEMANTIC_ALIASES = {
  accent: 'cyan',
  surface: 'slate',
  gold: 'amber',
  win: 'green',
  loss: 'red',
};

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

function parsePalette(css) {
  const palette = {};
  const re = /--color-([a-z]+)-(\d+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const [, family, shade, l, c, h] = m;
    if (!palette[family]) palette[family] = {};
    palette[family][shade] = { l: parseFloat(l), c: parseFloat(c), h: parseFloat(h) };
  }
  return palette;
}

/**
 * Builds the oklch() expression for one shade.
 *
 * Lightness is clamped to a valid percentage and chroma floored at zero so
 * extreme knob values degrade into flat/greyscale rather than invalid colours.
 */
function shadeExpr(family, { l, c, h }) {
  const L = `clamp(0%, calc(${l}% * var(--ct-${family}-l) + var(--ct-${family}-l-shift)), 100%)`;
  const C = `max(0, calc(${c} * var(--ct-${family}-c)))`;
  const H = `calc(${h} + var(--ct-${family}-h))`;
  return `oklch(${L} ${C} ${H})`;
}

function main() {
  if (!fs.existsSync(TAILWIND_THEME)) {
    console.error(`Could not find Tailwind theme at ${TAILWIND_THEME}. Run npm install first.`);
    process.exit(1);
  }

  const palette = parsePalette(fs.readFileSync(TAILWIND_THEME, 'utf8'));

  const missing = FAMILIES.filter((f) => !palette[f]);
  if (missing.length) {
    console.error(`Tailwind palette is missing expected families: ${missing.join(', ')}`);
    process.exit(1);
  }

  const out = [];
  out.push('/*');
  out.push(' * GENERATED FILE — do not edit by hand.');
  out.push(' * Regenerate with: node scripts/generate-theme-tokens.js');
  out.push(' *');
  out.push(' * Runtime-tunable colour layer. Every Tailwind colour utility in the app');
  out.push(' * resolves through these tokens, so changing a knob below (or at runtime on');
  out.push(' * document.documentElement) restyles every screen at once.');
  out.push(' *');
  out.push(' * Per family:');
  out.push(' *   --ct-<family>-l        lightness multiplier   (1    = unchanged)');
  out.push(' *   --ct-<family>-l-shift  lightness offset       (0%   = unchanged)');
  out.push(' *   --ct-<family>-c        chroma multiplier      (1    = unchanged,  0 = greyscale)');
  out.push(' *   --ct-<family>-h        hue rotation in deg    (0    = unchanged)');
  out.push(' */');
  out.push('');

  // --- Knob defaults -------------------------------------------------------
  out.push(':root {');
  out.push('  /* Knob defaults. All-neutral: output is identical to stock Tailwind. */');
  for (const family of FAMILIES) {
    out.push(
      `  --ct-${family}-l: 1; --ct-${family}-l-shift: 0%; --ct-${family}-c: 1; --ct-${family}-h: 0;`
    );
  }
  out.push('');

  // --- Derived ramps -------------------------------------------------------
  for (const family of FAMILIES) {
    out.push(`  /* ${family} */`);
    for (const shade of SHADES) {
      const base = palette[family][String(shade)];
      if (!base) continue;
      out.push(`  --ct-${family}-${shade}: ${shadeExpr(family, base)};`);
    }
  }
  out.push('');

  // --- Semantic aliases ----------------------------------------------------
  out.push('  /* Semantic aliases — same values, intention-revealing names. */');
  for (const [alias, family] of Object.entries(SEMANTIC_ALIASES)) {
    for (const shade of SHADES) {
      if (!palette[family][String(shade)]) continue;
      out.push(`  --ct-${alias}-${shade}: var(--ct-${family}-${shade});`);
    }
  }
  out.push('}');
  out.push('');

  // --- Tailwind re-point ---------------------------------------------------
  out.push('/*');
  out.push(' * Re-point Tailwind\'s palette at the tunable tokens. `inline` makes the');
  out.push(' * utilities emit `var(--ct-*)` directly, which is what lets a runtime change');
  out.push(' * to a knob repaint the app with no rebuild.');
  out.push(' */');
  out.push('@theme inline {');
  for (const family of FAMILIES) {
    for (const shade of SHADES) {
      if (!palette[family][String(shade)]) continue;
      out.push(`  --color-${family}-${shade}: var(--ct-${family}-${shade});`);
    }
  }
  out.push('');
  out.push('  /* Semantic utilities: bg-accent-500, text-surface-300, ring-gold-400, ... */');
  for (const alias of Object.keys(SEMANTIC_ALIASES)) {
    const family = SEMANTIC_ALIASES[alias];
    for (const shade of SHADES) {
      if (!palette[family][String(shade)]) continue;
      out.push(`  --color-${alias}-${shade}: var(--ct-${alias}-${shade});`);
    }
  }
  out.push('}');
  out.push('');

  fs.writeFileSync(OUT_FILE, out.join('\n'), 'utf8');

  const shadeCount = FAMILIES.reduce(
    (n, f) => n + SHADES.filter((s) => palette[f][String(s)]).length,
    0
  );
  console.log(
    `Wrote ${path.relative(REPO_ROOT, OUT_FILE)} — ` +
      `${FAMILIES.length} families, ${shadeCount} shades, ` +
      `${Object.keys(SEMANTIC_ALIASES).length} semantic aliases.`
  );
}

main();
