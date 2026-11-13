/**
 * Server-side avatar → standalone SVG string (for the X stream overlay and any other
 * place that needs a plain <img> of a player's avatar, e.g. stream/view.html).
 *
 * Renders the same `AvatarView` the poker table uses (static: no ambient motion,
 * neutral emotion) with react-dom/server and wraps the result as a self-contained
 * SVG document. Raster layers (site-relative /public files) are inlined as data URIs by
 * the caller (an SVG loaded through <img> cannot fetch external resources); anything that
 * can't be inlined is dropped so the image never breaks.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import AvatarView from '@/components/avatar/AvatarView';

const RASTER_TYPES: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
};

/** Deterministic hue (0..359) from a string (wallet address / name). */
export function hueFor(seed: string): number {
  let h = 2166136261;
  for (const ch of String(seed || '').toLowerCase()) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h % 360;
}

const xmlEsc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] as string));

/** Fallback when a player has no avatar config: initials on a colour from their address. */
export function initialsSvg(name: string | null | undefined, seed: string): string {
  const clean = String(name || '').replace(/[^\p{L}\p{N} ]/gu, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = (parts.length >= 2 ? parts[0][0] + parts[1][0] : (clean.slice(0, 2) || (seed || '').replace(/^0x/i, '').slice(0, 2) || '?')).toUpperCase();
  const hue = hueFor(seed || clean);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 56" width="240" height="280">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,55%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},70%,30%)"/></linearGradient></defs>`
    + `<rect width="48" height="56" fill="url(#g)"/>`
    + `<text x="24" y="34" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="700" fill="#fff">${xmlEsc(initials)}</text></svg>`;
}

/** Raster layers (<image href>) referenced by an SVG string. */
export function svgRasterHrefs(svg: string): string[] {
  const out = new Set<string>();
  for (const m of svg.matchAll(/<image\b[^>]*?\s(?:xlink:)?href="([^"]*)"/g)) out.add(m[1].replace(/&amp;/g, '&'));
  return [...out];
}

/**
 * Replace every <image href> with the data URI from `resolved` (an SVG loaded through <img>
 * cannot fetch external resources). Hrefs without a data URI are removed (layer dropped).
 */
export function inlineSvgRasters(svg: string, resolved: Map<string, string | null>): string {
  return svg.replace(/<image\b([^>]*?)\s(?:xlink:)?href="([^"]*)"([^>]*?)\/?>(?:<\/image>)?/g, (_m, pre, href, post) => {
    const raw = String(href).replace(/&amp;/g, '&');
    const data = raw.startsWith('data:') ? raw : resolved.get(raw);
    return data ? `<image${pre} href="${xmlEsc(data)}"${post}/>` : '';
  });
}

/** MIME type for a raster path (by extension), or null when unsupported. */
export function rasterType(href: string): string | null {
  const m = /(\.[a-z0-9]+)$/i.exec(String(href).split('?')[0]);
  return m ? RASTER_TYPES[m[1].toLowerCase()] ?? null : null;
}

/** Render a stored avatar config to a standalone SVG document, or null when it can't be rendered. */
export function renderAvatarSvg(config: unknown): string | null {
  if (!config || typeof config !== 'object') return null;
  let markup: string;
  try {
    markup = renderToStaticMarkup(<AvatarView config={config as Record<string, unknown>} disableAmbientMotion />);
  } catch {
    return null;
  }
  const start = markup.indexOf('<svg');
  const end = markup.lastIndexOf('</svg>');
  if (start < 0 || end < 0) return null;
  let svg = markup.slice(start, end + 6);
  // explicit intrinsic size so <img> without CSS sizing still renders crisply
  svg = svg.replace(/^<svg\b/, '<svg width="240" height="280"');
  if (!/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg.slice(0, 300))) svg = svg.replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
  return svg;
}
