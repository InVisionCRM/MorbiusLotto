import { NextRequest, NextResponse } from 'next/server';
import { proxyJson } from '@/app/api/_utils/backend';

/** Public config (ad creatives, etc.). No auth. Proxies to backend when configured. */
export async function GET(request: NextRequest) {
  try {
    const res = await proxyJson(request, '/api/config/public', {
      method: 'GET',
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
