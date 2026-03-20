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
  const limit = request.nextUrl.searchParams.get('limit') ?? '50';
  const offset = request.nextUrl.searchParams.get('offset') ?? '0';

  try {
    const backendUrl = getBackendUrl();
    const res = await fetch(
      `${backendUrl}/api/player/${address}/followers?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(offset)}`,
      { headers: { 'Content-Type': 'application/json' }, next: { revalidate: 30 } }
    );
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Error fetching followers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
