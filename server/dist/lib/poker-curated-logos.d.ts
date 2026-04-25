/**
 * Curated poker table logo gallery.
 *
 * The list is hardcoded so that the Next.js app and the Railway-hosted
 * Express server agree on what's allowed without either side needing to
 * read the filesystem at runtime. To add a logo: drop the file in
 * `public/Logos/` and add its filename here.
 *
 * Frontend copy: `lib/poker-curated-logos.ts` (keep in sync).
 */
export declare const POKER_CURATED_LOGO_FILENAMES: readonly string[];
export declare function isCuratedPokerLogoFilename(name: string): boolean;
export declare function isSafeLogoFilename(name: string): boolean;
//# sourceMappingURL=poker-curated-logos.d.ts.map