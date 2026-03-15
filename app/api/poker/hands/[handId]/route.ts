import { NextRequest, NextResponse } from 'next/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  { params }: { params: Promise<{ handId: string }> }
) {
  const { handId } = await params;
  const { searchParams } = new URL(request.url);
  const playerAddress = searchParams.get('playerAddress');

  if (!handId || !UUID_REGEX.test(handId)) {
    return NextResponse.json({ error: 'Invalid hand ID' }, { status: 400 });
  }
  if (!playerAddress || !/^0x[a-fA-F0-9]{40}$/.test(playerAddress)) {
    return NextResponse.json({ error: 'Invalid playerAddress query' }, { status: 400 });
  }

  try {
    const backendUrl = getBackendUrl();
    const res = await fetch(
      `${backendUrl}/api/poker/hands/${handId}?playerAddress=${encodeURIComponent(playerAddress)}`,
      {
        headers: { 'Content-Type': 'application/json' },
        next: { revalidate: 60 },
      }
    );

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ error: 'Hand not found' }, { status: 404 });
      }
      return NextResponse.json(
        { error: 'Failed to fetch hand detail' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching poker hand detail:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
