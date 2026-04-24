import { readdir } from 'fs/promises';
import { join } from 'path';

const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif']);

/** Resolved from compiled `server/dist/lib` or `server/src/lib` → repo `public/`. */
export function getPokerMarketingLogosDir(): string {
  return join(__dirname, '../../../public', 'Marketing ', 'LOGOS');
}

let cached: { at: number; files: string[] } | null = null;
const CACHE_MS = 60_000;

/**
 * Curated filenames only (same directory as Next `/api/poker/logos`).
 * Cached briefly; failures return empty list.
 */
export async function listAllowedPokerMarketingLogoFilenames(): Promise<string[]> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.files;
  try {
    const dir = getPokerMarketingLogosDir();
    const entries = await readdir(dir, { withFileTypes: true });
    const files = entries
      .filter(e => e.isFile() && ALLOWED_EXTS.has(e.name.slice(e.name.lastIndexOf('.')).toLowerCase()))
      .map(e => e.name)
      .sort();
    cached = { at: now, files };
    return files;
  } catch {
    cached = { at: now, files: [] };
    return [];
  }
}

export function isSafeLogoFilename(name: string): boolean {
  if (!name || name.length > 255) return false;
  if (name.includes('/') || name.includes('\\') || name.includes('..')) return false;
  return true;
}
