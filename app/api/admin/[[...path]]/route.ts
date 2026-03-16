import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string | null {
  const url =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') return null;
  return url.trim().replace(/\/$/, '');
}

/** Proxy all /api/admin/* requests to the game backend with the same method and headers (e.g. x-admin-wallet). */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, context, 'GET');
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, context, 'POST');
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, context, 'PUT');
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  return proxy(request, context, 'DELETE');
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> },
  method: string
) {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.json(
      { error: 'Backend API URL not configured' },
      { status: 503 }
    );
  }

  const { path } = await context.params;
  const pathSegments = path && path.length > 0 ? path.join('/') : '';
  const suffix = request.nextUrl.searchParams.toString() ? `?${request.nextUrl.searchParams}` : '';
  const url = `${backendUrl}/api/admin/${pathSegments}${suffix}`;

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'host' || key.toLowerCase() === 'connection') return;
    headers.set(key, value);
  });
  // Inject shared secret from server-side env — never exposed to the browser
  if (process.env.AP) {
    headers.set('x-admin-secret', process.env.AP);
  }

  try {
    const body = method !== 'GET' && method !== 'DELETE' ? await request.text() : undefined;
    const res = await fetch(url, {
      method,
      headers,
      body,
    });

    const text = await res.text();
    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      return new NextResponse(text || res.statusText, {
        status: res.status,
        headers: { 'Content-Type': res.headers.get('Content-Type') || 'text/plain' },
      });
    }

    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Admin proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to reach backend' },
      { status: 502 }
    );
  }
}
