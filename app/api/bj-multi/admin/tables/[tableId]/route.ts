import { NextRequest, NextResponse } from 'next/server';

function backendUrl(): string | null {
  const u = process.env.NEXT_PUBLIC_API_URL || process.env.BLACKJACK_SERVER_URL;
  return u ? u.trim().replace(/\/$/, '') : null;
}

export async function DELETE(_req: NextRequest, { params }: { params: { tableId: string } }) {
  const base = backendUrl();
  if (!base) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });

  try {
    const r = await fetch(`${base}/api/admin/bj-multi/tables/${params.tableId}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(5000),
    });
    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (err) {
    return NextResponse.json({ error: 'Backend unreachable' }, { status: 503 });
  }
}
