import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string | null {
  const url =
    process.env.BLACKJACK_SERVER_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') return null;
  return url.trim().replace(/\/$/, '');
}

/** Proxy POST /api/player/profile to the Express backend for saving display name + avatar config. */
export async function POST(req: NextRequest) {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.json({ error: 'Backend URL not configured' }, { status: 503 });
  }

  try {
    const body = await req.text();
    const res = await fetch(`${backendUrl}/api/player/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Profile save proxy error:', error);
    return NextResponse.json({ error: 'Failed to reach backend' }, { status: 502 });
  }
}
