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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  const { tableId } = await params;

  if (!tableId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tableId)) {
    return NextResponse.json({ error: 'Invalid table ID' }, { status: 400 });
  }

  try {
    const backendUrl = getBackendUrl();
    const res = await fetch(`${backendUrl}/api/poker/table/${tableId}/dashboard`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 10 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch poker table dashboard' },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching poker table dashboard:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
