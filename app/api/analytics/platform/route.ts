import { NextResponse } from 'next/server';

function getBackendUrl(): string | null {
  const url =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') return null;
  return url.trim();
}

/**
 * Proxy for /api/analytics/platform to avoid CORS and "Failed to fetch" in the browser.
 * Browser calls this same-origin route; server fetches from the game backend.
 */
export async function GET() {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.json(
      { error: 'Backend API URL not configured' },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(`${backendUrl}/api/analytics/platform`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 30 },
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
    console.error('Platform analytics proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch platform analytics' },
      { status: 502 }
    );
  }
}
