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

// Aggregate All-Stats summary for the player dashboard (balance, totals, win rate,
// ROI, biggest win, favorite game, streaks, per-game breakdown).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const backendUrl = getBackendUrl();
    const res = await fetch(`${backendUrl}/api/players/${address}/stats-summary`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 15 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch stats summary' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching player stats summary:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
