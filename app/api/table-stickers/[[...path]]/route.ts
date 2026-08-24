import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/**
 * Proxy the sticker library API to Express on the same origin.
 *
 * Required, not optional: apiFetch keeps browser requests same-origin so the
 * morb_session cookie stays first-party, which means Next must have a handler
 * mounted here or every call 404s at the edge without the backend ever seeing
 * it. The table-designs routes shipped without this file and were dead on
 * arrival for exactly that reason — see app/api/table-designs.
 *
 * Optional catch-all ([[...path]]) because uploading POSTs to the bare
 * collection path with no trailing segment.
 */
async function proxyStickers(req: NextRequest, path?: string[]): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  const suffix = path?.length ? `/${path.join('/')}` : '';
  const targetPath = `/api/table-stickers${suffix}${qs ? `?${qs}` : ''}`;
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
  return proxyStickers(req, path);
}
export async function POST(req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  return proxyStickers(req, path);
}
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  return proxyStickers(req, path);
}
