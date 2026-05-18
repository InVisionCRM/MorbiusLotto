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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  // Clamp + validate query params before forwarding so we never proxy junk.
  const rawLimit = parseInt(request.nextUrl.searchParams.get('limit') ?? '5', 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 5, 1), 200);
  const rawOffset = parseInt(request.nextUrl.searchParams.get('offset') ?? '0', 10);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);
  const rawCategory = request.nextUrl.searchParams.get('category') ?? 'all';
  const category =
    rawCategory === 'cash' || rawCategory === 'tournaments' || rawCategory === 'exchanges'
      ? rawCategory
      : 'all';

  try {
    const backendUrl = getBackendUrl();
    const qs = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      category,
    });
    const res = await fetch(
      `${backendUrl}/api/poker/player/${address}/chip-ledger?${qs.toString()}`,
      {
        headers: { 'Content-Type': 'application/json' },
        // Short revalidation: ledger updates frequently (every hand payout / cashout).
        next: { revalidate: 10 },
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch chip ledger' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching poker chip ledger:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
