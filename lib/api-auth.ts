// Direct literal property access — Next.js inlines `process.env.NEXT_PUBLIC_*`
// at build time ONLY when accessed by literal name. The helper in api-urls.ts
// uses dynamic `process.env[name]` which doesn't get inlined in the client
// bundle, so we read the var directly here.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').trim();

/**
 * Optional callback invoked when a request returns 401. Set by SiweProvider
 * via `setAuthFailureHandler(signInIfNeeded)`. When present, apiFetch will
 * call this once on a 401, await it (typically a wallet popup), then retry
 * the request a single time. If the retry also 401s, the original error
 * surfaces to the caller.
 *
 * This lets every call site stay one line — they don't have to manually
 * call `signInIfNeeded()` before each authed request.
 */
let authFailureHandler: (() => Promise<unknown>) | null = null;

export function setAuthFailureHandler(handler: (() => Promise<unknown>) | null): void {
  authFailureHandler = handler;
}

/**
 * Invoke the registered SIWE sign-in handler (typically `signInIfNeeded`
 * from <SiweProvider>). Use this from non-React code (e.g. the WebSocket
 * client) when it needs to trigger a sign-in popup outside of an apiFetch
 * 401 retry — for example, when the WS server sends `siwe_required`.
 *
 * Throws if no handler is registered (the SiweProvider hasn't mounted yet).
 */
export async function triggerSignIn(): Promise<unknown> {
  if (!authFailureHandler) {
    throw new Error('SIWE handler not registered — SiweProvider must mount before triggerSignIn is called');
  }
  return authFailureHandler();
}

/**
 * Authenticated fetch helper. Always sends the SIWE session cookie via
 * `credentials: 'include'`, prefixes the URL with the backend base, and
 * auto-handles 401 by triggering a sign-in prompt and retrying once.
 *
 * Use for any call to a route protected by `requireAuth` on the server. For
 * public read endpoints, plain `fetch` is fine — but using this helper for
 * everything keeps the cookie behavior and auth-recovery consistent.
 *
 *   await apiFetch('/api/withdraw', { method: 'POST', body: JSON.stringify({ amount }) });
 *
 * Throws a thin Error with the response's `error` field when the request is
 * not 2xx (after the optional retry).
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!API_BASE) {
    throw new Error('Missing NEXT_PUBLIC_API_URL. Add it in Vercel (frontend) Settings → Environment Variables, then trigger a fresh build (the value is baked in at build time).');
  }
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type') && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const doFetch = () => fetch(url, { ...init, headers, credentials: 'include' });

  let res = await doFetch();

  // If unauthenticated and we have a sign-in handler, prompt the user and retry once.
  if (res.status === 401 && authFailureHandler) {
    try {
      await authFailureHandler();
    } catch {
      // User dismissed the wallet popup or wallet errored — fall through with the original 401.
    }
    res = await doFetch();
  }

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.clone().json()).error ?? ''; } catch { /* noop */ }
    const err = new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ''}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  return res;
}

/** Convenience: `apiFetch(...).then(r => r.json())` with a parametric return type. */
export async function apiFetchJson<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, init);
  return res.json() as Promise<T>;
}
