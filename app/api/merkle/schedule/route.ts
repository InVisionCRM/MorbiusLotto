import { NextRequest } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

export async function GET(request: NextRequest) {
  return proxyJson(request, '/api/merkle/schedule', {
    method: 'GET',
    next: { revalidate: 30 },
  });
}
