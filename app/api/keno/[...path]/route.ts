import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/**
 * Proxy all /api/keno/* requests to the Express backend.
 *
 * Stake-style Keno (components/StakeKeno/StakeKenoGame.tsx) calls
 * /api/keno/{info,multipliers,balance,play,history,verify/:id} as same-origin
 * paths. Without this route those requests 404 at the Next.js layer and never
 * reach the backend. Mirrors the existing /api/arcade/mines proxy.
 */
async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  const targetPath = `/api/keno/${path.join('/')}${qs ? `?${qs}` : ''}`;

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
