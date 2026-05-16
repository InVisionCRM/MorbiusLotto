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

const CATEGORIES = new Set(['net_chips', 'biggest_pot', 'hands_played']);

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const rawCategory = sp.get('category') ?? 'net_chips';
  const category = CATEGORIES.has(rawCategory) ? rawCategory : 'net_chips';
  const limit = Math.min(Math.max(parseInt(sp.get('limit') ?? '10', 10) || 10, 1), 100);
  const address = sp.get('address');

  try {
    const backendUrl = getBackendUrl();
    const qs = new URLSearchParams({ category, limit: String(limit) });
    if (address && /^0x[a-fA-F0-9]{40}$/.test(address)) {
      qs.set('address', address);
    }
    const res = await fetch(`${backendUrl}/api/poker/top-players?${qs.toString()}`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch poker top players' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching poker top players:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
