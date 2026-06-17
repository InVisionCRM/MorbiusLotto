import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/**
 * Proxy all /api/arcade/dragon-tiger/* requests to the Express backend.
 *
 * The Dragon Tiger game (components/DragonTiger/DragonTigerGame.tsx) calls
 * /api/arcade/dragon-tiger/{info,play,history,recent,leaderboard,verify/:id} as
 * same-origin paths. Without this route those requests 404 at the Next.js layer
 * and never reach the backend — the play call then surfaces as
 * "Could not play the round. Try again." Mirrors the /api/arcade/dicex2 proxy.
 */
async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  const targetPath = `/api/arcade/dragon-tiger/${path.join('/')}${qs ? `?${qs}` : ''}`;

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
