import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string {
  const url =
    process.env.BLACKJACK_SERVER_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') {
    throw new Error(
      'Missing backend URL. Set BLACKJACK_SERVER_URL or NEXT_PUBLIC_API_URL in your deployment.'
    );
  }
  return url.trim().replace(/\/$/, '');
}

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
    const res = await fetch(`${backendUrl}/api/player/${address}/profile`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 60 }, // Cache for 60 seconds
    });

    if (!res.ok) {
      return NextResponse.json(
        { displayName: null, profileImageUrl: null },
        { status: 200 }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      displayName: data.displayName ?? null,
      profileImageUrl: data.profileImageUrl ?? null,
    });
  } catch (error) {
    console.error('Error fetching player profile:', error);
    return NextResponse.json(
      { displayName: null, profileImageUrl: null },
      { status: 200 }
    );
  }
}
