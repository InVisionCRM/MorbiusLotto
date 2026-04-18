import { NextResponse } from 'next/server';

function backendUrl(): string | null {
  const u = process.env.NEXT_PUBLIC_API_URL || process.env.BLACKJACK_SERVER_URL;
  return u ? u.trim().replace(/\/$/, '') : null;
}

async function safeFetch(url: string, opts?: RequestInit) {
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(5000) });
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const base = backendUrl();
  if (!base) return NextResponse.json({ error: 'Backend not configured' }, { status: 503 });

  const adminHeaders = process.env.AP ? { 'x-admin-secret': process.env.AP } : {};

  const [health, tables, allTables, tournaments] = await Promise.all([
    safeFetch(`${base}/health`),
    // Public cash game tables (tournament_mode=FALSE)
    safeFetch(`${base}/api/poker/tables`),
    // All tables including tournament ones — use admin endpoint if it exists
    safeFetch(`${base}/api/admin/poker/tables`, { headers: adminHeaders }),
    // Poker tournaments from the view
    safeFetch(`${base}/api/admin/poker/tournaments`, { headers: adminHeaders }),
  ]);

  return NextResponse.json({
    health,
    cashTables:          tables?.tables     ?? tables ?? [],
    allTables:           allTables?.tables  ?? allTables ?? null,
    tournaments:         tournaments?.tournaments ?? tournaments ?? [],
    fetchedAt:           new Date().toISOString(),
  });
}
