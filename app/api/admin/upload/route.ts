import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const ADMIN_WALLETS: string[] = (process.env.ADMIN_WALLETS || process.env.NEXT_PUBLIC_ADMIN_WALLETS || '')
  .split(',')
  .map((a) => a.trim().toLowerCase())
  .filter(Boolean);

function isAdminWallet(addr: string | undefined): boolean {
  if (!addr) return false;
  return ADMIN_WALLETS.includes(addr.toLowerCase());
}

function getBackendUrl(): string | null {
  const url =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') return null;
  return url.trim().replace(/\/$/, '');
}

const ALLOWED_IMAGE = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const ALLOWED_VIDEO = ['video/mp4', 'video/webm'];
const MAX_SIZE_IMAGE = 5 * 1024 * 1024; // 5MB
const MAX_SIZE_VIDEO = 50 * 1024 * 1024; // 50MB

/**
 * POST /api/admin/upload
 * Body: multipart/form-data with "file" and optional "kind" (image | video).
 * Headers: x-admin-wallet (must be in ADMIN_WALLETS).
 * Proxies to backend when configured (production); otherwise writes to public/ (local dev).
 * Returns { path: string } for use as table src (full URL when proxied, relative path when local).
 */
export async function POST(req: NextRequest) {
  const wallet = req.headers.get('x-admin-wallet')?.trim();
  if (!wallet || !isAdminWallet(wallet)) {
    return NextResponse.json({ error: 'Forbidden', message: 'Admin wallet required' }, { status: 403 });
  }

  const backendUrl = getBackendUrl();
  if (backendUrl) {
    try {
      const contentType = req.headers.get('content-type') || '';
      const body = await req.arrayBuffer();
      const res = await fetch(`${backendUrl}/api/admin/upload`, {
        method: 'POST',
        headers: {
          'x-admin-wallet': wallet,
          'content-type': contentType,
        },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return NextResponse.json(
          { error: data.error || data.message || 'Upload failed' },
          { status: res.status }
        );
      }
      return NextResponse.json(data);
    } catch (err) {
      console.error('Admin upload proxy error:', err);
      return NextResponse.json(
        { error: 'Failed to reach backend. Check NEXT_PUBLIC_API_URL.' },
        { status: 502 }
      );
    }
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'Missing or invalid file' }, { status: 400 });
  }

  const kind = (formData.get('kind') as string)?.toLowerCase() || 'image';
  if (kind !== 'image' && kind !== 'video') {
    return NextResponse.json({ error: 'kind must be image or video' }, { status: 400 });
  }

  const allowedTypes = kind === 'video' ? ALLOWED_VIDEO : ALLOWED_IMAGE;
  const maxSize = kind === 'video' ? MAX_SIZE_VIDEO : MAX_SIZE_IMAGE;
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: `Invalid file type. Allowed: ${allowedTypes.join(', ')}` }, { status: 400 });
  }
  if (file.size > maxSize) {
    return NextResponse.json({ error: `File too large (max ${maxSize / 1024 / 1024}MB)` }, { status: 400 });
  }

  const ext = path.extname(file.name) || (kind === 'video' ? '.mp4' : '.png');
  const base = path.basename(file.name, path.extname(file.name));
  const safeName = `${base.replace(/[^a-zA-Z0-9-_]/g, '_')}_${Date.now()}${ext}`;

  const dir =
    kind === 'video'
      ? path.join(process.cwd(), 'public', 'BlackJack', 'video table')
      : path.join(process.cwd(), 'public', 'BlackJack', 'BrandedTable');
  const fullPath = path.join(dir, safeName);

  try {
    await mkdir(dir, { recursive: true });
    const bytes = await file.arrayBuffer();
    await writeFile(fullPath, Buffer.from(bytes));
  } catch (err) {
    console.error('Admin upload error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save file' },
      { status: 500 }
    );
  }

  const urlPath =
    kind === 'video'
      ? `/BlackJack/video%20table/${encodeURIComponent(safeName)}`
      : `/BlackJack/BrandedTable/${encodeURIComponent(safeName)}`;
  return NextResponse.json({ path: urlPath });
}
