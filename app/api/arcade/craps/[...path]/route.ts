import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/**
 * Proxy all /api/arcade/craps/* requests to the Express backend.
 *
 * The MORBIUS Arcade Craps page (app/craps/page.tsx) calls
 * /api/arcade/craps/{session,session/:id/...,verify/:id,history,recent,leaderboard}
 * as same-origin paths so the SIWE cookie flows automatically. Without this
 * route the requests 404 at the Next.js layer and never reach the backend.
 * Mirrors the existing /api/arcade/mines and /api/plinko proxies.
 */
async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  const targetPath = `/api/arcade/craps/${path.join('/')}${qs ? `?${qs}` : ''}`;

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
