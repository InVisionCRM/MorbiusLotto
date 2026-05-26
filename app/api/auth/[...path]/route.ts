import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/**
 * Proxy SIWE auth to Express on same-origin so morb_session is a first-party
 * cookie on morbius.io. Cross-origin Set-Cookie on mobile WalletConnect
 * browsers is often dropped; extension wallets on desktop tolerate it.
 */
async function proxyAuth(req: NextRequest, path: string[]): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  const targetPath = `/api/auth/${path.join('/')}${qs ? `?${qs}` : ''}`;
  const isRead = req.method === 'GET' || req.method === 'HEAD';

  return proxyJson(req, targetPath, {
    method: req.method,
    headers: { 'Content-Type': req.headers.get('Content-Type') ?? 'application/json' },
    body: isRead ? undefined : await req.text(),
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyAuth(req, path);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyAuth(req, path);
}
