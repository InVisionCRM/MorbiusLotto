// Direct literal property access — Next.js inlines `process.env.NEXT_PUBLIC_*`
// at build time ONLY when accessed by literal name. The helper in api-urls.ts
// uses dynamic `process.env[name]` which doesn't get inlined in the client
// bundle, so we read the var directly here.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').trim();

/** Browser: same-origin proxy keeps morb_session first-party (critical on mobile WC). */
function resolveApiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  if (typeof window !== 'undefined') return path;
  if (!API_BASE) return path;
  return `${API_BASE.replace(/\/$/, '')}${path}`;
}

/**
 * Optional callback invoked when a request returns 401. Set by SiweProvider
 * via `setAuthFailureHandler(requestSignIn)`. When present, apiFetch will
 * call this once on a 401, await it, then retry the request a single time.
 * On desktop the handler signs immediately; on mobile WalletConnect it opens a
 * one-tap "Sign in to play" gate (so the wallet deep-link fires from a real
 * user gesture) and resolves once signed in. If the retry also 401s, the
 * original error surfaces to the caller.
 *
 * This lets every call site stay one line — they don't have to manually
 * call `signInIfNeeded()` before each authed request.
 */
let authFailureHandler: (() => Promise<unknown>) | null = null;
/** Prefer ensure-session (no wallet popup if /api/auth/me already OK). Used by WebSocket. */
let wsAuthHandler: (() => Promise<unknown>) | null = null;

export function setAuthFailureHandler(handler: (() => Promise<unknown>) | null): void {
  authFailureHandler = handler;
}

export function setWsAuthHandler(handler: (() => Promise<unknown>) | null): void {
  wsAuthHandler = handler;
}

/** True when the browser already has a valid morb_session (same-origin proxy). */
export async function probeSiweSession(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * WebSocket SIWE recovery: reuse an existing session when possible; only open
 * the wallet when /api/auth/me is missing. Avoids sign-in loops when HTTP auth
 * succeeded but the first WS reconnect raced the cookie.
 */
export async function triggerWsSignIn(): Promise<unknown> {
  if (wsAuthHandler) return wsAuthHandler();
  if (authFailureHandler) return authFailureHandler();
  throw new Error('SIWE handler not registered — SiweProvider must mount before triggerWsSignIn is called');
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
  if (!API_BASE && typeof window === 'undefined') {
    throw new Error('Missing NEXT_PUBLIC_API_URL. Add it in Vercel (frontend) Settings → Environment Variables, then trigger a fresh build (the value is baked in at build time).');
  }
  const url = resolveApiUrl(path);

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
      res = await doFetch();
    } catch (signInErr) {
      // Surface verify / wallet errors instead of a generic auth required on the retried 401.
      if (signInErr instanceof Error && signInErr.message) throw signInErr;
    }
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
