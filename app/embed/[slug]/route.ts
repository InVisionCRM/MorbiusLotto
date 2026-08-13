/**
 * /embed/[slug] — the standalone page a community-built slot machine is
 * embedded from on a third-party site via <iframe>.
 *
 * A Route Handler, not a page.tsx: the three existing branded cabinets
 * (public/green-wick-slot-lab.html etc.) are plain static shells —
 * cabinet.css + a host div + the four cabinet-*.js scripts + one
 * CabinetEngine.boot() call — and this reproduces that exact shape for a
 * server-hosted machine (defUrl -> the public GET /api/slot-machines/:slug/def
 * endpoint) instead of the static /slots/<key>.json files those three use.
 * A route handler also gives direct control over response headers, which
 * this page genuinely needs (see below) — a React page would fight that.
 *
 * Framing: this is the one page in the whole app that's SUPPOSED to be
 * iframed on someone else's origin — the opposite of the usual clickjacking
 * concern. Nothing else in this repo sets X-Frame-Options or a CSP
 * frame-ancestors today, so nothing actively blocks that yet, but if a
 * site-wide anti-framing policy is ever added, it must exclude this route.
 * We set an explicit permissive CSP here rather than depending on the
 * absence of a global policy.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getApiUrlOptional } from '@/lib/api-urls';

// Server-generated slugs are base64url (crypto.randomBytes(9).toString('base64url')
// in DatabaseService.createSlotMachine) — reject anything else before it
// ever reaches string interpolation into the response HTML.
const SLUG_RE = /^[A-Za-z0-9_-]{1,32}$/;

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUG_RE.test(slug)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const apiBase = getApiUrlOptional();
  if (!apiBase) {
    return new NextResponse('Embed is not configured (missing API URL).', { status: 503 });
  }

  const defUrl = `${apiBase}/api/slot-machines/${encodeURIComponent(slug)}/def`;
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>MORBIUS Slot</title>
<link rel="stylesheet" href="/slots/cabinet.css"/>
<style>html,body{margin:0;padding:0;background:#0b0f16;}</style>
</head>
<body>
<main class="cab-scope">
<div id="gameHost"></div>
</main>
<script src="/slots/cabinet-math.js"></script>
<script src="/slots/cabinet-fx.js"></script>
<script src="/slots/cabinet-themes.js"></script>
<script src="/slots/cabinet-engine.js"></script>
<script>
CabinetEngine.boot({
  host: '#gameHost',
  defUrl: '${escapeHtmlAttr(defUrl)}',
  key: '${escapeHtmlAttr(slug)}'
});
</script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // No X-Frame-Options here on purpose — see file header. frame-ancestors
      // is the modern mechanism and this route needs it wide open.
      'Content-Security-Policy': "frame-ancestors *",
      'Cache-Control': 'public, max-age=60',
    },
  });
}
