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

// Poker-room-style history (cash sessions + tournament entries) for a player.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const backendUrl = getBackendUrl();
    const res = await fetch(`${backendUrl}/api/poker/player/${address}/history`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 15 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch poker history' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching poker history:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
