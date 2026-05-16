import { NextRequest, NextResponse } from 'next/server';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  _request: NextRequest,
  { params }: { params: Promise<{ handId: string }> }
) {
  const { handId } = await params;

  if (!handId || !UUID_REGEX.test(handId)) {
    return NextResponse.json({ error: 'Invalid hand ID' }, { status: 400 });
  }

  try {
    const backendUrl = getBackendUrl();
    const res = await fetch(`${backendUrl}/api/poker/verify/${handId}`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    const data = await res.json().catch(() => null);
    if (data == null) {
      return NextResponse.json(
        { error: 'Invalid response from verify service' },
        { status: 502 }
      );
    }
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Error proxying poker verify:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
