import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/**
 * Proxy all /api/video-poker/* requests to the Express backend.
 *
 * The MORBIUS Arcade Video Poker game (components/telegram/MiniAppVideoPoker.tsx)
 * calls /api/video-poker/{paytable,deal,draw,verify/:handId} as same-origin
 * paths. Without this route those requests 404 at the Next.js layer and never
 * reach the backend — the game shows "Could not load the game". This mirrors
 * the existing /api/cosmetics and /api/telegram proxies.
 */
async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  // Preserve any query string on the way through.
  const qs = req.nextUrl.searchParams.toString();
  const targetPath = `/api/video-poker/${path.join('/')}${qs ? `?${qs}` : ''}`;

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
