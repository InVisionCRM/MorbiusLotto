import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string | null {
  const url =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.BLACKJACK_SERVER_URL ||
    process.env.NEXT_PUBLIC_BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') return null;
  return url.trim();
}

/** Proxies to the Express backend /api/blackjack/tables (Postgres blackjack_tables). */
export async function GET(request: NextRequest) {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.json(
      { error: 'Backend API URL not configured' },
      { status: 503 }
    );
  }

  const enabledOnly = request.nextUrl.searchParams.get('enabledOnly') !== 'false';
  const q = enabledOnly ? 'enabledOnly=true' : 'enabledOnly=false';
  try {
    const res = await fetch(`${backendUrl}/api/blackjack/tables?${q}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      const text = await res.text();
      let err: { error?: string } = { error: `Backend returned ${res.status}` };
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
    console.error('Blackjack tables proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch blackjack tables' },
      { status: 502 }
    );
  }
}
