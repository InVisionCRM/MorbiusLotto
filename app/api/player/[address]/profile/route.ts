import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const res = await proxyJson(request, `/api/player/${address}/profile`, {
      method: 'GET',
      cache: 'no-store',
      next: { revalidate: 0 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { displayName: null, profileImageUrl: null, avatarConfig: null, bio: null, xHandle: null, tgHandle: null, profileDisplayMode: 'avatar' },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const data = await res.json();
    return NextResponse.json(
      {
        displayName: data.displayName ?? null,
        profileImageUrl: data.profileImageUrl ?? null,
        avatarConfig: data.avatarConfig ?? null,
        bio: data.bio ?? null,
        xHandle: data.xHandle ?? null,
        tgHandle: data.tgHandle ?? null,
        profileDisplayMode: data.profileDisplayMode ?? 'avatar',
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('Error fetching player profile:', error);
    return NextResponse.json(
      { displayName: null, profileImageUrl: null, avatarConfig: null, bio: null, xHandle: null, tgHandle: null, profileDisplayMode: 'avatar' },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
