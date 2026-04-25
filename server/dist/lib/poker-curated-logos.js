"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.POKER_CURATED_LOGO_FILENAMES = void 0;
exports.isCuratedPokerLogoFilename = isCuratedPokerLogoFilename;
exports.isSafeLogoFilename = isSafeLogoFilename;
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
exports.POKER_CURATED_LOGO_FILENAMES = [
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
function isCuratedPokerLogoFilename(name) {
    return exports.POKER_CURATED_LOGO_FILENAMES.includes(name);
}
function isSafeLogoFilename(name) {
    if (!name || name.length > 255)
        return false;
    if (name.includes('/') || name.includes('\\') || name.includes('..'))
        return false;
    return true;
}
//# sourceMappingURL=poker-curated-logos.js.map