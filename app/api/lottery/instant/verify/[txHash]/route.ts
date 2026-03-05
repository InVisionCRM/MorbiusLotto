import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string | null {
  const url =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') return null;
  return url.trim();
}

/**
 * Proxy for instant lottery provably-fair verification by tx hash.
 * Browser calls this same-origin route; server fetches from the game backend.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ txHash: string }> }
) {
  const { txHash } = await params;
  const normalized = (txHash || '').trim().toLowerCase();
  if (!normalized || !/^0x[a-fa-f0-9]{64}$/.test(normalized)) {
    return NextResponse.json(
      { error: 'Valid tx hash (0x + 64 hex) required' },
      { status: 400 }
    );
  }

  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.json(
      { error: 'Backend API URL not configured' },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(
      `${backendUrl}/api/lottery/instant/play/verify/${encodeURIComponent(normalized)}`,
      { headers: { Accept: 'application/json' }, next: { revalidate: 0 } }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error('Lottery verify proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch verification data' },
      { status: 502 }
    );
  }
}
