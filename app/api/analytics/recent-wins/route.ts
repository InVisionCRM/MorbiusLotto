import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string | null {
  const url =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') return null;
  return url.trim();
}

/** Proxy for /api/analytics/recent-wins (Blackjack wins from DB). */
export async function GET(request: NextRequest) {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.json(
      { error: 'Backend API URL not configured' },
      { status: 503 }
    );
  }

  const limit = request.nextUrl.searchParams.get('limit') || '20';
  try {
    const res = await fetch(`${backendUrl}/api/analytics/recent-wins?limit=${limit}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 15 },
    });

    if (!res.ok) {
      const text = await res.text();
      let err = { error: `Backend returned ${res.status}` };
      try {
        err = JSON.parse(text);
      } catch {
        err = { error: text || res.statusText };
      }
      return NextResponse.json(err, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Recent wins proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recent wins' },
      { status: 502 }
    );
  }
}
