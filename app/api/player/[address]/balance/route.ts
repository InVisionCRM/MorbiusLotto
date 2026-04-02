import { NextRequest } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return Response.json({ error: 'Invalid address' }, { status: 400 });
  }

  return proxyJson(request, `/api/player/${address}/balance`, {
    method: 'GET',
    next: { revalidate: 0 },
  });
}
