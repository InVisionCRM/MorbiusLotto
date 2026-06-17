import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string {
  const url = process.env.BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') {
    throw new Error(
      'Missing required env: BLACKJACK_SERVER_URL. Set it in your deployment (e.g. Vercel).'
    );
  }
  return url.trim();
}

// Deposit / withdrawal transaction history (from player_deposits + pending_withdrawals,
// with statuses). Proxies to the backend getPlayerTransactions endpoint.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const rawLimit = parseInt(request.nextUrl.searchParams.get('limit') ?? '1000', 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 1000, 1), 5000);
  const rawOffset = parseInt(request.nextUrl.searchParams.get('offset') ?? '0', 10);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

  try {
    const backendUrl = getBackendUrl();
    const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const res = await fetch(
      `${backendUrl}/api/players/${address}/transactions?${qs.toString()}`,
      {
        headers: { 'Content-Type': 'application/json' },
        next: { revalidate: 15 },
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch transactions' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching player transactions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
