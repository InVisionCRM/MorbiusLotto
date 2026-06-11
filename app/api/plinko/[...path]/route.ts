import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/**
 * Proxy all /api/plinko/* requests to the Express backend.
 *
 * Chips Plinko (components/StakePlinko/StakePlinkoGame.tsx) calls
 * /api/plinko/{info,multipliers,play,history,verify/:id} as same-origin paths.
 * Without this route those requests 404 at the Next.js layer and never reach
 * the backend. Mirrors the existing /api/arcade/mines proxy.
 *
 * The legacy on-chain reads keep their more-specific routes
 * (/api/plinko/player/[address]/{stats,drops}) — Next.js matches those before
 * this catch-all, so both coexist.
 */
async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  const targetPath = `/api/plinko/${path.join('/')}${qs ? `?${qs}` : ''}`;

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
