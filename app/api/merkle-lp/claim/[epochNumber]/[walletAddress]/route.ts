import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ epochNumber: string; walletAddress: string }> }
) {
  const { epochNumber, walletAddress } = await params;
  if (!epochNumber || Number.isNaN(Number(epochNumber))) {
    return NextResponse.json({ error: 'Invalid epoch number' }, { status: 400 });
  }
  if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  return proxyJson(request, `/api/merkle-lp/claim/${epochNumber}/${walletAddress}`, {
    method: 'GET',
    next: { revalidate: 0 },
  });
}
