import { NextRequest, NextResponse } from 'next/server';

function backendUrl(): string | null {
  const u = process.env.NEXT_PUBLIC_API_URL || process.env.BLACKJACK_SERVER_URL;
  return u ? u.trim().replace(/\/$/, '') : null;
}

export async function GET() {
  const base = backendUrl();
  if (!base) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });
  try {
    const r = await fetch(`${base}/api/admin/bj-single/wager-tiers`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'x-admin-secret': process.env.AP ?? '' },
    });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const base = backendUrl();
  if (!base) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });
  try {
    const body = await req.json();
    const r = await fetch(`${base}/api/admin/bj-single/wager-tiers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': process.env.AP ?? '' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 });
  }
}
