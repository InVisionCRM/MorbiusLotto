/** Session cookie set by Express auth (see server/src/routes/auth.routes.ts). */
export const SESSION_COOKIE_NAME = 'morb_session';

/**
 * Normalize morb_session Set-Cookie headers from the backend so the browser
 * sends the cookie on WebSocket upgrades to api.morbius.io (not only on
 * morbius.io/api/* proxy routes).
 */
export function rewriteSessionSetCookie(cookie: string): string {
  if (!cookie.includes(`${SESSION_COOKIE_NAME}=`)) return cookie;

  const domain =
    process.env.SESSION_COOKIE_DOMAIN?.trim() ||
    (process.env.NODE_ENV === 'production' ? '.morbius.io' : '');

  let out = cookie.replace(/;\s*Domain=[^;]*/gi, '');
  if (domain) out += `; Domain=${domain}`;

  if (!/;\s*Path=/i.test(out)) out += '; Path=/';
  if (!/;\s*SameSite=/i.test(out)) out += '; SameSite=None';
  if (!/;\s*Secure/i.test(out)) out += '; Secure';

  return out;
}

export function rewriteSessionSetCookies(cookies: string[]): string[] {
  return cookies.map(rewriteSessionSetCookie);
}
