import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/**
 * Proxy all /api/vip/* requests to the Express backend.
 *
 * The VIP dashboard (app/vip/page.tsx) calls /api/vip/{config,:address/status,
 * :address/claim} as same-origin paths; the status/claim endpoints rely on the
 * SIWE session cookie, which proxyJson forwards. Mirrors /api/plinko/*.
 */
async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  const targetPath = `/api/vip/${path.join('/')}${qs ? `?${qs}` : ''}`;
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
