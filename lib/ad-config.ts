/**
 * Ad creative config: URLs for image/video used in advertising spaces
 * (hero, game sidebars, loading screens). Admin sets via Admin > Advertising.
 * Consumers use useAdCreative() or DEFAULT_AD_CREATIVE_URL as fallback.
 */

export const DEFAULT_AD_CREATIVE_URL =
  '/Marketing%20/Advertise%20Placeholders/5c8b3d0e-68b5-45ab-9385-0c5842cdd7e8.jpg';

export interface AdCreativeConfig {
  ad_creative_url: string;
  ad_creative_hero_url: string;
  ad_creative_loading_url: string;
}

export function isVideoUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  const u = url.toLowerCase();
  return u.endsWith('.mp4') || u.endsWith('.webm') || u.includes('.mp4?') || u.includes('.webm?');
}

export function getEffectiveAdUrl(
  config: AdCreativeConfig | null | undefined,
  slot: 'default' | 'hero' | 'loading'
): string {
  if (!config) return DEFAULT_AD_CREATIVE_URL;
  const url =
    slot === 'hero'
      ? config.ad_creative_hero_url || config.ad_creative_url
      : slot === 'loading'
        ? config.ad_creative_loading_url || config.ad_creative_url
        : config.ad_creative_url;
  return url && url.trim() ? url.trim() : DEFAULT_AD_CREATIVE_URL;
}
