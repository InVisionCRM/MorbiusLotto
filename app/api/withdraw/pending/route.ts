import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  return proxyJson(request, `/api/withdraw/pending?address=${encodeURIComponent(address)}`, {
    method: 'GET',
    next: { revalidate: 0 },
  });
}
