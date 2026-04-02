import { NextRequest } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

export async function GET(request: NextRequest) {
  const suffix = request.nextUrl.searchParams.toString()
    ? `?${request.nextUrl.searchParams.toString()}`
    : '';

  return proxyJson(request, `/api/blackjack/recent-games${suffix}`, {
    method: 'GET',
    next: { revalidate: 15 },
  });
}
