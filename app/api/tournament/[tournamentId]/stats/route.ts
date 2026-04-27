import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string | null {
  const url =
    process.env.BLACKJACK_SERVER_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') return null;
  return url.trim().replace(/\/$/, '');
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> },
) {
  const { tournamentId } = await params;
  if (!tournamentId?.trim()) {
    return NextResponse.json({ error: 'Invalid tournament id' }, { status: 400 });
  }

  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });
  }

  try {
    const res = await fetch(
      `${backendUrl}/api/tournament/${encodeURIComponent(tournamentId)}/stats`,
      {
        headers: { 'Content-Type': 'application/json' },
        next: { revalidate: 15 },
      },
    );
    const data = await res.json().catch(() => ({ error: 'Invalid response' }));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Error proxying tournament stats:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
