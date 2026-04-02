import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/** Proxy POST /api/player/profile to the Express backend for saving display name + avatar config. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    return proxyJson(req, '/api/player/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch (error) {
    console.error('Profile save proxy error:', error);
    return NextResponse.json({ error: 'Failed to reach backend' }, { status: 502 });
  }
}
