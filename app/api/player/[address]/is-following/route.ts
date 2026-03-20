import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string {
  const url = process.env.BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') throw new Error('Missing required env: BLACKJACK_SERVER_URL.');
  return url.trim();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;
  const follower = request.nextUrl.searchParams.get('follower');

  try {
    const backendUrl = getBackendUrl();
    const qs = follower ? `?follower=${encodeURIComponent(follower)}` : '';
    const res = await fetch(`${backendUrl}/api/player/${address}/is-following${qs}`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Error checking follow status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
