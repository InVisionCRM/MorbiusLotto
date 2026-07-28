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
  const { path } = await context.params;
  const body = await request.text();
  return proxyJson(request, targetPath(request, path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
