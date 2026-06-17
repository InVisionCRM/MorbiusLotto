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

// Unified sitewide activity feed for a player. Proxies to the backend, which reads
// the single poker_chip_ledger source and enriches each row with {gameKey, gameLabel, kind}.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  // Clamp + validate query params before forwarding so we never proxy junk.
  const rawLimit = parseInt(request.nextUrl.searchParams.get('limit') ?? '25', 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 25, 1), 25000);
  const rawOffset = parseInt(request.nextUrl.searchParams.get('offset') ?? '0', 10);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  const game = request.nextUrl.searchParams.get('game');
  if (game && /^[a-z_]{1,40}$/.test(game)) qs.set('game', game);
  const outcome = request.nextUrl.searchParams.get('outcome');
  if (outcome === 'win' || outcome === 'loss') qs.set('outcome', outcome);

  try {
    const backendUrl = getBackendUrl();
    const res = await fetch(
      `${backendUrl}/api/players/${address}/activity?${qs.toString()}`,
      {
        headers: { 'Content-Type': 'application/json' },
        // Short revalidation: the ledger updates on every bet / payout / cashout.
        next: { revalidate: 10 },
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch player activity' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching player activity:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
