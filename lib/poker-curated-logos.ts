/**
 * Curated poker table logo gallery.
 *
 * The list is hardcoded so that the Next.js app and the Railway-hosted
 * Express server agree on what's allowed without either side needing to
 * read the filesystem at runtime. To add a logo: drop the file in
 * `public/Logos/` and add its filename here.
 *
 * Server-side copy: `server/src/lib/poker-curated-logos.ts` (keep in sync).
 */
export const POKER_CURATED_LOGO_FILENAMES: readonly string[] = [
  'CRVE.jpeg',
  'Diamond-Heart.jpg',
  'DrDoge.png',
  'EMIT.png',
  'INC.png',
  'LBRTY.jpeg',
  'MVS.jpg',
  'MorbiusLogo (3).png',
  'PEW-PEW.jpeg',
  'PITTBULL.jpg',
  'PLSXT.png',
  'PTGC.png',
  'RICH.png',
  'SHILL.JPG',
  'TIME.png',
  'TMC.jpg',
  'TassHub.png',
  'WHALE.png',
  'WICK.png',
  'ZAPDOS.jpeg',
  'pCOCK.png',
  'pSSH.png',
  'pTIGER.png',
];

export function isCuratedPokerLogoFilename(name: string): boolean {
  return POKER_CURATED_LOGO_FILENAMES.includes(name);
}

export function isSafeLogoFilename(name: string): boolean {
  if (!name || name.length > 255) return false;
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return false;
  return true;
}
