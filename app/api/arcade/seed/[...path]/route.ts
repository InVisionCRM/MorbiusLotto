import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/**
 * Proxy all /api/arcade/seed/* requests to the Express backend.
 *
 * The shared provably-fair seed panel (ArcadeSeedControls) and the fairness
 * strip call /api/arcade/seed/{active,client,rotate} as same-origin paths —
 * the browser API helper always uses relative URLs. Every arcade GAME has a
 * proxy like this, but the seed family never got one, so on production the
 * fairness panel 404'd at the Next.js layer for everyone while the games
 * themselves worked. Mirrors the /api/arcade/mines proxy.
 */
async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  const targetPath = `/api/arcade/seed/${path.join('/')}${qs ? `?${qs}` : ''}`;

  const isGet = req.method === 'GET' || req.method === 'HEAD';
  return proxyJson(req, targetPath, {
    method: req.method,
    headers: { 'Content-Type': 'application/json' },
    body: isGet ? undefined : await req.text(),
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
