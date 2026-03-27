import { NextResponse } from 'next/server';

function getBackendUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_API_URL || process.env.BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') return null;
  return url.trim();
}

/** Proxy live WebSocket room counts for home game cards. */
export async function GET() {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.json(
      {
        poker: 0,
        blackjackMulti: 0,
        blackjack: 0,
        plinko: 0,
        keno: 0,
        lottery: 0,
        bigWheel: 0,
      },
      { status: 200 },
    );
  }

  try {
    const res = await fetch(`${backendUrl}/api/analytics/live-presence`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 10 },
    });

    if (!res.ok) {
      const zeros = {
        poker: 0,
        blackjackMulti: 0,
        blackjack: 0,
        plinko: 0,
        keno: 0,
        lottery: 0,
        bigWheel: 0,
      };
      return NextResponse.json(zeros, { status: 200 });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('live-presence proxy error:', error);
    return NextResponse.json(
      {
        poker: 0,
        blackjackMulti: 0,
        blackjack: 0,
        plinko: 0,
        keno: 0,
        lottery: 0,
        bigWheel: 0,
      },
      { status: 200 },
    );
  }
}
