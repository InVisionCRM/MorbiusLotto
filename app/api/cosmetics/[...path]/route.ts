import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string | null {
  const url =
    process.env.BLACKJACK_SERVER_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') return null;
  return url.trim().replace(/\/$/, '');
}

/** Proxy all /api/cosmetics/* requests to the Express backend. */
async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.json({ error: 'Backend URL not configured' }, { status: 503 });
  }

  const downstream = `${backendUrl}/api/cosmetics/${path.join('/')}`;
  const url = new URL(downstream);
  // Forward query params
  req.nextUrl.searchParams.forEach((v, k) => url.searchParams.set(k, v));

  try {
    const isGet = req.method === 'GET' || req.method === 'HEAD';
    const res = await fetch(url.toString(), {
      method: req.method,
      headers: { 'Content-Type': 'application/json' },
      body: isGet ? undefined : await req.text(),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'Failed to reach backend' }, { status: 502 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
