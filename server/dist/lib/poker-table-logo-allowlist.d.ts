/** Resolved from compiled `server/dist/lib` or `server/src/lib` → repo `public/`. */
export declare function getPokerMarketingLogosDir(): string;
/**
 * Curated filenames only (same directory as Next `/api/poker/logos`).
 * Cached briefly; failures return empty list.
 */
export declare function listAllowedPokerMarketingLogoFilenames(): Promise<string[]>;
export declare function isSafeLogoFilename(name: string): boolean;
//# sourceMappingURL=poker-table-logo-allowlist.d.ts.map