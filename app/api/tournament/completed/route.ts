import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string | null {
  const url =
    process.env.BLACKJACK_SERVER_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') return null;
  return url.trim().replace(/\/$/, '');
}

export async function GET(request: NextRequest) {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.json([], { status: 200 });
  }

  const { searchParams } = new URL(request.url);
  const limit = searchParams.get('limit') ?? '50';
  const offset = searchParams.get('offset') ?? '0';
  const qs = new URLSearchParams({ limit, offset });

  try {
    const res = await fetch(`${backendUrl}/api/tournament/completed?${qs.toString()}`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 30 },
    });

    if (!res.ok) {
      return NextResponse.json([], { status: 200 });
    }

    const data = await res.json();
    return NextResponse.json(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error('Error fetching completed tournaments:', error);
    return NextResponse.json([], { status: 200 });
  }
}
