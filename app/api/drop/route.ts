import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/**
 * Proxy for the bare GET /api/drop (The Weekly Drop — current draw, pot,
 * caller's entries via ?address=). The catch-all [...path] route below this
 * directory does not match the bare segment, so it needs its own handler.
 * Mirrors /api/vip/*.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const qs = req.nextUrl.searchParams.toString();
  return proxyJson(req, `/api/drop${qs ? `?${qs}` : ''}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
}
