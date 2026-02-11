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
  { params }: { params: Promise<{ gameId: string }> }
) {
  const { gameId } = await params;

  if (!gameId || gameId.trim() === '') {
    return NextResponse.json({ error: 'Invalid game ID' }, { status: 400 });
  }

  try {
    const backendUrl = getBackendUrl();
    const res = await fetch(`${backendUrl}/api/game/${gameId}/verify`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 0 }, // Don't cache verification data
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Failed to verify game' }));
      return NextResponse.json(errorData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error verifying game:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
