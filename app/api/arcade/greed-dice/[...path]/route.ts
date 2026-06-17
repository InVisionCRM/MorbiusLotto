import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/**
 * Proxy all /api/arcade/greed-dice/* requests to the Express backend.
 *
 * The Farkle push-your-luck game (components/GreedDice/GreedDiceGame.tsx) calls
 * /api/arcade/greed-dice/{info,start,roll,bank,active,history,recent,leaderboard,
 * verify/:id} as same-origin paths. Without this route those requests 404 at the
 * Next.js layer and never reach the backend. Mirrors the /api/arcade/chicken and
 * /api/arcade/dicex2 proxies.
 */
async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  const targetPath = `/api/arcade/greed-dice/${path.join('/')}${qs ? `?${qs}` : ''}`;

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
