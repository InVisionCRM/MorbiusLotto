/**
 * Optional illustrated tier-badge art (e.g. Kenney CC0 crests).
 *
 * The VIP badge renders a built-in heraldic-crest SVG by default. To swap in
 * real image art (Kenney, game-icons, custom renders), drop the files into
 * `public/vip-badges/` and map tierLevel → path here. Any tier left out keeps
 * the SVG crest, so this can be filled in one tier at a time.
 *
 * Example once the Kenney crest pack is added:
 *   export const VIP_BADGE_IMAGES: Record<number, string> = {
 *     1: '/vip-badges/bronze.png',
 *     2: '/vip-badges/silver.png',
 *     3: '/vip-badges/gold.png',
 *     4: '/vip-badges/platinum.png',
 *     5: '/vip-badges/diamond.png',
 *     6: '/vip-badges/obsidian.png',
 *   }
 *
 * Keeping it empty means "use the SVG crest" — and avoids any 404s for art
 * that isn't in the repo yet.
 */
export const VIP_BADGE_IMAGES: Record<number, string> = {
  1: '/vip-badges/bronze.png',
  2: '/vip-badges/silver.png',
  3: '/vip-badges/gold.png',
  4: '/vip-badges/platinum.png',
  5: '/vip-badges/diamond.png',
  6: '/vip-badges/obsidian.png',
}
