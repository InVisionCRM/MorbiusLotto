import type { ManifestTransform } from '@serwist/build';

/**
 * Precache URLs must not contain raw `#`: the browser treats it as a fragment
 * delimiter, so `GET /sounds/foo_#1.wav` becomes `GET /sounds/foo_` → 404 and
 * `bad-precaching-response` during SW install. Encode as %23.
 */
export const encodeHashInPrecacheUrls: ManifestTransform = async (manifestEntries) => {
  const manifest = manifestEntries.map((entry) => ({
    ...entry,
    url: entry.url.includes('#') ? entry.url.replace(/#/g, '%23') : entry.url,
  }));
  return { manifest, warnings: [] };
};
