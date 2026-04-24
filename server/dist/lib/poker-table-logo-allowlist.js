"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPokerMarketingLogosDir = getPokerMarketingLogosDir;
exports.listAllowedPokerMarketingLogoFilenames = listAllowedPokerMarketingLogoFilenames;
exports.isSafeLogoFilename = isSafeLogoFilename;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif']);
/** Resolved from compiled `server/dist/lib` or `server/src/lib` → repo `public/`. */
function getPokerMarketingLogosDir() {
    return (0, path_1.join)(__dirname, '../../../public', 'Marketing ', 'LOGOS');
}
let cached = null;
const CACHE_MS = 60_000;
/**
 * Curated filenames only (same directory as Next `/api/poker/logos`).
 * Cached briefly; failures return empty list.
 */
async function listAllowedPokerMarketingLogoFilenames() {
    const now = Date.now();
    if (cached && now - cached.at < CACHE_MS)
        return cached.files;
    try {
        const dir = getPokerMarketingLogosDir();
        const entries = await (0, promises_1.readdir)(dir, { withFileTypes: true });
        const files = entries
            .filter(e => e.isFile() && ALLOWED_EXTS.has(e.name.slice(e.name.lastIndexOf('.')).toLowerCase()))
            .map(e => e.name)
            .sort();
        cached = { at: now, files };
        return files;
    }
    catch {
        cached = { at: now, files: [] };
        return [];
    }
}
function isSafeLogoFilename(name) {
    if (!name || name.length > 255)
        return false;
    if (name.includes('/') || name.includes('\\') || name.includes('..'))
        return false;
    return true;
}
//# sourceMappingURL=poker-table-logo-allowlist.js.map