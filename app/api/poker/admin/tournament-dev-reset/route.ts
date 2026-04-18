import { NextRequest, NextResponse } from 'next/server';

function backendUrl(): string | null {
  const u = process.env.NEXT_PUBLIC_API_URL || process.env.BLACKJACK_SERVER_URL;
  return u ? u.trim().replace(/\/$/, '') : null;
}

/** Proxies to Express admin route; requires `AP` in Next env and `POKER_TOURNAMENT_DEV_RESET=true` on the server. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const tournamentId = String(body?.tournamentId ?? '').trim();
  if (!tournamentId) {
    return NextResponse.json({ error: 'tournamentId required' }, { status: 400 });
  }

  const base = backendUrl();
  if (!base) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });
  }

  const secret = process.env.AP?.trim();
  if (!secret) {
    return NextResponse.json({ error: 'Admin proxy not configured (AP)' }, { status: 503 });
  }

  try {
    const r = await fetch(
      `${base}/api/admin/poker/tournaments/${encodeURIComponent(tournamentId)}/dev-reset`,
      {
        method: 'POST',
        headers: { 'x-admin-secret': secret },
        signal: AbortSignal.timeout(60_000),
      },
    );
    const data = await r.json().catch(() => ({ error: r.statusText || 'Bad response' }));
    return NextResponse.json(data, { status: r.status });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Request failed' },
      { status: 502 },
    );
  }
}
