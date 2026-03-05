'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AdCreativeConfig } from '@/lib/ad-config';

export function useAdCreative(): {
  config: AdCreativeConfig | null;
  loading: boolean;
  refetch: () => void;
} {
  const [config, setConfig] = useState<AdCreativeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/config/public', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      setConfig({
        ad_creative_url: typeof data?.ad_creative_url === 'string' ? data.ad_creative_url : '',
        ad_creative_hero_url: typeof data?.ad_creative_hero_url === 'string' ? data.ad_creative_hero_url : '',
        ad_creative_loading_url: typeof data?.ad_creative_loading_url === 'string' ? data.ad_creative_loading_url : '',
      });
    } catch {
      setConfig({
        ad_creative_url: '',
        ad_creative_hero_url: '',
        ad_creative_loading_url: '',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  return { config, loading, refetch: fetchConfig };
}
