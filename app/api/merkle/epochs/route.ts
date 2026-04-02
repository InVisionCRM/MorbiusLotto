import { NextRequest } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

export async function GET(request: NextRequest) {
  return proxyJson(request, '/api/merkle/epochs', {
    method: 'GET',
    next: { revalidate: 15 },
  });
}
