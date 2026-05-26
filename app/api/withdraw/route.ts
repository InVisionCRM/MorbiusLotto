import { NextRequest } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

export async function POST(req: NextRequest) {
  const body = await req.text();
  return proxyJson(req, '/api/withdraw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
