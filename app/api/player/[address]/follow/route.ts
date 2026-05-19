import { NextRequest } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  const body = await request.text();
  return proxyJson(request, `/api/player/${address}/follow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  const body = await request.text();
  return proxyJson(request, `/api/player/${address}/follow`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}
