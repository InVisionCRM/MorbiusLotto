import { NextResponse } from 'next/server';

function getBackendUrl(): string | null {
  const url =
    process.env.BLACKJACK_SERVER_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BLACKJACK_SERVER_URL;
  if (!url || url.trim() === '') return null;
  return url.trim().replace(/\/$/, '');
}

/** Public config (ad creatives, etc.). No auth. Proxies to backend when configured. */
export async function GET() {
  const backendUrl = getBackendUrl();
  if (!backendUrl) {
    return NextResponse.json({
      ad_creative_url: '',
      ad_creative_hero_url: '',
      ad_creative_loading_url: '',
    });
  }
  try {
    const res = await fetch(`${backendUrl}/api/config/public`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: 30 },
    });
    if (!res.ok) {
      return NextResponse.json({
        ad_creative_url: '',
        ad_creative_hero_url: '',
        ad_creative_loading_url: '',
      });
    }
    const data = await res.json();
    return NextResponse.json({
      ad_creative_url: typeof data?.ad_creative_url === 'string' ? data.ad_creative_url : '',
      ad_creative_hero_url: typeof data?.ad_creative_hero_url === 'string' ? data.ad_creative_hero_url : '',
      ad_creative_loading_url: typeof data?.ad_creative_loading_url === 'string' ? data.ad_creative_loading_url : '',
    });
  } catch {
    return NextResponse.json({
      ad_creative_url: '',
      ad_creative_hero_url: '',
      ad_creative_loading_url: '',
    });
  }
}
