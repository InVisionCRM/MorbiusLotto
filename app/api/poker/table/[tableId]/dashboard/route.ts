import { NextRequest, NextResponse } from 'next/server';

/** Same resolution as `app/api/blackjack/tables/route.ts` so poker admin dashboard hits the same backend as other games. */
function getBackendUrl(): string | null {
  const url =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.BLACKJACK_SERVER_URL ||
    process.env.NEXT_PUBLIC_BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') return null;
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
    if (!backendUrl) {
      return NextResponse.json(
        { error: 'Backend API URL not configured' },
        { status: 503 }
      );
    }

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
