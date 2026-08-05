import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/**
 * Proxy all /api/arcade/blackjack-variants/* requests to the Express backend.
 *
 * The four variant pages (/spanish-21, /double-exposure, /pontoon,
 * /free-bet-blackjack) call
 * /api/arcade/blackjack-variants/{info,active,deal,action,history,recent,leaderboard,verify/:id}
 * as same-origin paths so the SIWE cookie flows automatically. Without this
 * route the requests 404 at the Next.js layer and never reach the backend.
 */
async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  const targetPath = `/api/arcade/blackjack-variants/${path.join('/')}${qs ? `?${qs}` : ''}`;

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
