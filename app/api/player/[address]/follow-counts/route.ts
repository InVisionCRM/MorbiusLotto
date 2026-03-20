import { NextResponse } from 'next/server';

function getBackendUrl(): string {
  const url = process.env.BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') throw new Error('Missing required env: BLACKJACK_SERVER_URL.');
  return url.trim();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  try {
    const backendUrl = getBackendUrl();
    const res = await fetch(`${backendUrl}/api/player/${address}/follow-counts`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 30 },
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Error fetching follow counts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
