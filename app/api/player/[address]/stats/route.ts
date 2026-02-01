import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BLACKJACK_SERVER_URL || 'http://localhost:3001';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    // Try enhanced stats first, fall back to basic stats
    let res = await fetch(`${BACKEND_URL}/api/player/${address}/stats/enhanced`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 30 }, // Cache for 30 seconds
    });

    if (!res.ok) {
      res = await fetch(`${BACKEND_URL}/api/player/${address}/stats`, {
        headers: { 'Content-Type': 'application/json' },
        next: { revalidate: 30 },
      });
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch player stats' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching player stats:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
