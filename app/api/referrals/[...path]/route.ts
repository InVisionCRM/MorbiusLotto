import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/**
 * Proxy all /api/referrals/* requests to the Express backend.
 *
 * The referrals dashboard (app/referrals/page.tsx) calls
 * /api/referrals/{config,:address/summary,:address/bind} as same-origin paths;
 * the summary/bind endpoints rely on the SIWE session cookie, which proxyJson
 * forwards. Mirrors /api/vip/*.
 */
async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  const targetPath = `/api/referrals/${path.join('/')}${qs ? `?${qs}` : ''}`;
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
