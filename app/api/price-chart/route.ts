import { NextResponse } from 'next/server'
import { WPLS_MORBIUS_PAIR } from '@/lib/contracts'

/**
 * GET /api/price-chart — daily MORBIUS/WPLS OHLCV for the home page charts.
 *
 * Server-side proxy of GeckoTerminal's public OHLCV endpoint for the
 * MORBIUS/WPLS PulseX V1 pool. Returns a minimal `{ candles: [{ t, c }] }`
 * payload (unix seconds + close price), oldest first. Cached 5 minutes both
 * via Next's fetch revalidation and the CDN Cache-Control header.
 */
const OHLCV_URL = `https://api.geckoterminal.com/api/v2/networks/pulsechain/pools/${WPLS_MORBIUS_PAIR}/ohlcv/day?aggregate=1&limit=90`

interface GeckoOhlcvResponse {
  data?: { attributes?: { ohlcv_list?: unknown } }
}

export async function GET() {
  try {
    const res = await fetch(OHLCV_URL, {
      headers: { Accept: 'application/json;version=20230302' },
      next: { revalidate: 300 },
    })
    if (!res.ok) {
      return NextResponse.json({ error: `Upstream error ${res.status}` }, { status: 503 })
    }
    const json = (await res.json()) as GeckoOhlcvResponse
    const list = json?.data?.attributes?.ohlcv_list
    if (!Array.isArray(list)) {
      return NextResponse.json({ error: 'Malformed upstream payload' }, { status: 503 })
    }
    // Each row: [timestamp, open, high, low, close, volume]
    const candles = list
      .filter((row): row is number[] => Array.isArray(row) && row.length >= 5)
      .map((row) => ({ t: Number(row[0]), c: Number(row[4]) }))
      .filter((c) => Number.isFinite(c.t) && Number.isFinite(c.c) && c.c > 0)
      .sort((a, b) => a.t - b.t)
    return NextResponse.json(
      { candles },
      { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=600' } }
    )
  } catch {
    return NextResponse.json({ error: 'Price chart unavailable' }, { status: 503 })
  }
}
