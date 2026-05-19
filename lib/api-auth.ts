import { getApiUrl } from './api-urls';

/**
 * Authenticated fetch helper. Always sends the SIWE session cookie via
 * `credentials: 'include'`, and prefixes the URL with the backend base.
 *
 * Use for any call to a route protected by `requireAuth` on the server. For
 * public read endpoints, plain `fetch` is fine — but using this helper for
 * everything keeps the cookie behavior consistent.
 *
 *   await apiFetch('/api/withdraw', { method: 'POST', body: JSON.stringify({ amount }) });
 *
 * Throws a thin Error with the response's `error` field when the request is
 * not 2xx.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = getApiUrl();
  const url = path.startsWith('http') ? path : `${base}${path}`;

  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type') && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers, credentials: 'include' });

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
