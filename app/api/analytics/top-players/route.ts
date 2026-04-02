import { NextRequest } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

export async function GET(request: NextRequest) {
  const suffix = request.nextUrl.searchParams.toString()
    ? `?${request.nextUrl.searchParams.toString()}`
    : '';

  return proxyJson(request, `/api/analytics/top-players${suffix}`, {
    method: 'GET',
    next: { revalidate: 30 },
  });
}
