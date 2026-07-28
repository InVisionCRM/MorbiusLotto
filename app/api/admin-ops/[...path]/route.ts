import { NextRequest } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

// Proxy /api/admin-ops/* to the Express backend, forwarding the SIWE session
// cookie (via proxyJson) so the backend can verify the caller is an admin. We
// deliberately do NOT use the shared-secret admin proxy here — these routes are
// gated per-caller by wallet session + admin allowlist on the backend.

function targetPath(request: NextRequest, path?: string[]): string {
  const segments = path && path.length > 0 ? path.join('/') : '';
  const qs = request.nextUrl.searchParams.toString();
  return `/api/admin-ops/${segments}${qs ? `?${qs}` : ''}`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  return proxyJson(request, targetPath(request, path), { method: 'GET' });
}

export async function POST(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return withBody(request, context, 'POST');
}

// PUT is required by the game-limits save. Next.js returns 405 for any method a
// route file doesn't export, so omitting it made saving limits fail with
// "Method Not Allowed" before the request ever reached the backend.
export async function PUT(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return withBody(request, context, 'PUT');
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return withBody(request, context, 'PATCH');
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  return withBody(request, context, 'DELETE');
}

async function withBody(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
) {
  const { path } = await context.params;
  const body = await request.text();
  return proxyJson(request, targetPath(request, path), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body || undefined,
  });
}
