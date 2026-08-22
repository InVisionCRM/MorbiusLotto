import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/**
 * Proxy the Create-A-Table designs API to Express on the same origin.
 *
 * Same reason app/api/auth/[...path] and app/api/slot-machines/[...path]
 * exist: apiFetch deliberately keeps browser requests same-origin so the
 * morb_session cookie stays FIRST-PARTY. That only works if Next actually
 * has something mounted at the path — without this file every
 * /api/table-designs call 404s at the edge and never reaches the backend,
 * which is exactly what happened when the routes first shipped.
 *
 * The catch-all is OPTIONAL ([[...path]]) rather than required, because
 * useMyTableDesigns POSTs a new design to the bare collection path with no
 * trailing segment. A required [...path] silently misses that one call —
 * listing and updating would work while saving stayed broken.
 */
async function proxyDesigns(req: NextRequest, path?: string[]): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  const suffix = path?.length ? `/${path.join('/')}` : '';
  const targetPath = `/api/table-designs${suffix}${qs ? `?${qs}` : ''}`;
  const isRead = req.method === 'GET' || req.method === 'HEAD';

  return proxyJson(req, targetPath, {
    method: req.method,
    headers: { 'Content-Type': req.headers.get('Content-Type') ?? 'application/json' },
    body: isRead ? undefined : await req.text(),
  });
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  return proxyDesigns(req, path);
}
export async function POST(req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  return proxyDesigns(req, path);
}
export async function PUT(req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  return proxyDesigns(req, path);
}
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  return proxyDesigns(req, path);
}
