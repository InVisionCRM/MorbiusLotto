/**
 * GET /api/poker/avatar/<0x address>[.svg]  →  the player's avatar as a standalone SVG.
 *
 * Used by the X stream overlay (stream/view.html), which is a plain HTML page and can't
 * mount the React `AvatarView`. Same art as the poker table seats: the stored avatar
 * config (bots get theirs from poker_bot_accounts sync, humans a placeholder until they
 * customise) rendered server-side. Falls back to an initials badge when a wallet has no
 * avatar, and to the profile photo when the player chose photo mode.
 *
 * Lives under pages/api (not app/) because App Router route handlers may not import
 * react-dom/server.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { initialsSvg, inlineSvgRasters, rasterType, renderAvatarSvg, svgRasterHrefs } from '@/lib/avatar-svg';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

function backendUrl(): string | null {
  const url = process.env.BLACKJACK_SERVER_URL || process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BLACKJACK_SERVER_URL || '';
  return url.trim() ? url.trim().replace(/\/$/, '') : null;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(ms), cache: 'no-store' });
  } catch {
    return null;
  }
}

async function loadRaster(href: string, origin: string): Promise<string | null> {
  const type = rasterType(href);
  if (!type || !href.startsWith('/') || href.startsWith('//')) return null;
  const r = await fetchWithTimeout(`${origin}${href}`, 3000);
  if (!r?.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.length > 600_000 ? null : `data:${type};base64,${buf.toString('base64')}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = String(req.query.address ?? '').replace(/\.svg$/i, '');
  if (!ADDRESS_RE.test(raw)) {
    res.status(400).json({ error: 'Invalid address' });
    return;
  }
  const address = raw.toLowerCase();
  let profile: { displayName?: string | null; avatarConfig?: unknown; profileImageUrl?: string | null; profileDisplayMode?: string } | null = null;
  const base = backendUrl();
  if (base) {
    const r = await fetchWithTimeout(`${base}/api/player/${address}/profile`, 4000);
    if (r?.ok) profile = await r.json().catch(() => null);
  }

  const photo = profile?.profileDisplayMode === 'photo' && typeof profile.profileImageUrl === 'string' && /^https:\/\//.test(profile.profileImageUrl)
    ? profile.profileImageUrl : null;
  if (photo) {
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600');
    res.redirect(302, photo);
    return;
  }

  let svg = renderAvatarSvg(profile?.avatarConfig);
  if (svg) {
    const hrefs = svgRasterHrefs(svg).filter((h) => !h.startsWith('data:'));
    if (hrefs.length) {
      // fixed site origin (never the request's Host header): only our own /public files are inlined
      const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://morbius.io').trim().replace(/\/$/, '');
      const resolved = new Map<string, string | null>();
      await Promise.all(hrefs.map(async (h) => { resolved.set(h, await loadRaster(h, origin)); }));
      svg = inlineSvgRasters(svg, resolved);
    }
  } else {
    svg = initialsSvg(profile?.displayName ?? null, address);
  }
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  // short edge cache: avatar edits show up within minutes, streams don't hammer the backend
  res.setHeader('Cache-Control', profile ? 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600' : 'public, max-age=60, s-maxage=60');
  res.status(200).send(svg);
}
