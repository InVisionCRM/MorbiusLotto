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

/**
 * Forward a request to the Express backend, preserving the SIWE session
 * cookie on the way in and any Set-Cookie headers on the way back. The
 * browser sees this Next.js route as same-origin, but the backend is on a
 * different host — so cookies don't flow automatically; we have to forward
 * them by hand.
 */
export async function proxyJson(request: NextRequest, targetPath: string, init?: RequestInit): Promise<NextResponse> {
  try {
    // Forward the browser's Cookie header so the backend can look up the SIWE session.
    const headers = new Headers(init?.headers ?? { 'Content-Type': 'application/json' });
    const incomingCookie = request.headers.get('cookie');
    if (incomingCookie && !headers.has('cookie')) headers.set('cookie', incomingCookie);

    const response = await fetch(`${getBackendUrl()}${targetPath}`, {
      method: init?.method ?? request.method,
      headers,
      body: init?.body,
      next: init?.next,
    });

    // Forward any Set-Cookie headers back to the browser (covers logout-style
    // responses that clear a cookie; auth/verify is called directly, not proxied).
    const outHeaders = new Headers();
    const setCookies = response.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      for (const cookie of setCookies) outHeaders.append('set-cookie', cookie);
    } else {
      const single = response.headers.get('set-cookie');
      if (single) outHeaders.append('set-cookie', single);
    }

    const text = await response.text();
    if (response.status === 204) {
      return new NextResponse(null, { status: 204, headers: outHeaders });
    }

    try {
      // NextResponse.json doesn't preserve our custom headers easily; build manually.
      outHeaders.set('Content-Type', 'application/json');
      return new NextResponse(text || 'null', { status: response.status, headers: outHeaders });
    } catch {
      outHeaders.set('Content-Type', response.headers.get('Content-Type') || 'text/plain');
      return new NextResponse(text || response.statusText, {
        status: response.status,
        headers: outHeaders,
      });
    }
  } catch (error) {
    console.error('Backend proxy error:', error);
    return NextResponse.json({ error: 'Failed to reach backend' }, { status: 502 });
  }
}
