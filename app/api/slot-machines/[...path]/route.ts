import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/**
 * Proxy the community-slots API to Express on the same origin, for the same
 * reason app/api/auth/[...path] exists: the morb_session cookie has to be
 * FIRST-PARTY. The slot builder is a static page on morbius.io; if it called
 * the backend host directly, the session cookie would be third-party and
 * today's browsers simply drop it — sign-in appears to succeed and then every
 * authenticated call 401s.
 *
 * Every method the routes use is forwarded (creating, updating, publishing and
 * disabling machines, funding and withdrawing bankroll, sessions and spins).
 */
async function proxySlots(req: NextRequest, path: string[]): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  const targetPath = `/api/slot-machines/${path.join('/')}${qs ? `?${qs}` : ''}`;
  const isRead = req.method === 'GET' || req.method === 'HEAD';

  return proxyJson(req, targetPath, {
    method: req.method,
    headers: { 'Content-Type': req.headers.get('Content-Type') ?? 'application/json' },
    body: isRead ? undefined : await req.text(),
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxySlots(req, path);
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxySlots(req, path);
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxySlots(req, path);
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxySlots(req, path);
}
