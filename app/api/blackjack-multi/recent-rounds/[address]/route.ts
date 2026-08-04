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

  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address.trim())) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const backendUrl = getBackendUrl();
    const limit = request.nextUrl.searchParams.get('limit') ?? '15';
    const res = await fetch(
      `${backendUrl}/api/bj-multi/player/${address.trim()}/recent-rounds?limit=${encodeURIComponent(limit)}`,
      { headers: { 'Content-Type': 'application/json' }, next: { revalidate: 0 } }
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Failed to fetch rounds' }));
      return NextResponse.json(errorData, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching multi recent rounds:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
