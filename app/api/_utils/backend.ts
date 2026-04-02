import { NextRequest, NextResponse } from 'next/server';

export function getBackendUrl(): string {
  const url =
    process.env.BLACKJACK_SERVER_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BLACKJACK_SERVER_URL;

  if (!url || url.trim() === '') {
    throw new Error('Missing backend URL. Set BLACKJACK_SERVER_URL or NEXT_PUBLIC_API_URL in your deployment.');
  }

  return url.trim().replace(/\/$/, '');
}

export async function proxyJson(request: NextRequest, targetPath: string, init?: RequestInit): Promise<NextResponse> {
  try {
    const response = await fetch(`${getBackendUrl()}${targetPath}`, {
      method: init?.method ?? request.method,
      headers: init?.headers ?? { 'Content-Type': 'application/json' },
      body: init?.body,
      next: init?.next,
    });

    const text = await response.text();
    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    try {
      return NextResponse.json(text ? JSON.parse(text) : null, { status: response.status });
    } catch {
      return new NextResponse(text || response.statusText, {
        status: response.status,
        headers: { 'Content-Type': response.headers.get('Content-Type') || 'text/plain' },
      });
    }
  } catch (error) {
    console.error('Backend proxy error:', error);
    return NextResponse.json({ error: 'Failed to reach backend' }, { status: 502 });
  }
}
