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
  request: NextRequest,
  { params }: { params: Promise<{ tournamentId: string }> },
) {
  const { tournamentId } = await params;
  if (!tournamentId?.trim()) {
    return NextResponse.json({ error: 'Invalid tournament id' }, { status: 400 });
  }

  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.json([], { status: 200 });
  }

  const { searchParams } = new URL(request.url);
  const qs = new URLSearchParams();
  const limit = searchParams.get('limit');
  const offset = searchParams.get('offset');
  const player = searchParams.get('player');
  if (limit != null) qs.set('limit', limit);
  if (offset != null) qs.set('offset', offset);
  if (player != null && player !== '') qs.set('player', player);
  const q = qs.toString();
  const path = `${backendUrl}/api/tournament/${encodeURIComponent(tournamentId)}/hands${q ? `?${q}` : ''}`;

  try {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 15 },
    });
    const data = await res.json().catch(() => []);
    if (!res.ok) {
      return NextResponse.json(Array.isArray(data) ? data : [], { status: 200 });
    }
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error proxying tournament hands:', error);
    return NextResponse.json([], { status: 200 });
  }
}
