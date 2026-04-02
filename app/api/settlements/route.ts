import { NextRequest } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const status = params.get('status');
  const limit = params.get('limit');

  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (limit) qs.set('limit', limit);

  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return proxyJson(request, `/api/settlements${suffix}`, {
    method: 'GET',
    next: { revalidate: 0 },
  });
}
