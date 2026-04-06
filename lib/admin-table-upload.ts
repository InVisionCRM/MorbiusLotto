'use client';

/**
 * Admin blackjack table asset uploads.
 * When NEXT_PUBLIC_API_URL is set, posts multipart data directly to the game backend
 * (`/api/admin/browser-upload`) so large files are not proxied through Vercel (avoids ~4.5MB 413).
 * Otherwise uses same-origin `/api/admin/upload` (local dev or small files).
 */
export function getDirectAdminBrowserUploadUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return null;
  return `${raw.replace(/\/$/, '')}/api/admin/browser-upload`;
}

export async function adminUploadTableFile(
  form: FormData,
  walletAddress: string
): Promise<{ path: string }> {
  const direct = getDirectAdminBrowserUploadUrl();
  const res = await fetch(direct ?? '/api/admin/upload', {
    method: 'POST',
    headers: { 'x-admin-wallet': walletAddress },
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; path?: string };
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `Upload failed (${res.status})`);
  }
  if (!data.path || typeof data.path !== 'string') {
    throw new Error('Upload response missing path');
  }
  return { path: data.path };
}
