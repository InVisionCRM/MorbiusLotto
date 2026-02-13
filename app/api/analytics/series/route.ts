import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string | null {
  const url =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') return null;
  return url.trim();
}

/** Proxy for /api/analytics/series (metrics time-series for charts). */
export async function GET(request: NextRequest) {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.json(
      { error: 'Backend API URL not configured' },
      { status: 503 }
    );
  }

  const range = request.nextUrl.searchParams.get('range') || '24h';
  try {
    const res = await fetch(`${backendUrl}/api/analytics/series?range=${range}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
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
    console.error('Analytics series proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch metrics series' },
      { status: 502 }
    );
  }
}
