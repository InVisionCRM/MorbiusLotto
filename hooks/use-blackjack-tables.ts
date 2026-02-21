'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApiUrlOptional } from '@/lib/api-urls';
import {
  BLACKJACK_IMAGE_BACKGROUNDS,
  BLACKJACK_VIDEO_BACKGROUNDS,
  DEFAULT_BLACKJACK_IMAGE_ID,
} from '@/app/BLACKJACK/constants';

export interface TableOption {
  id: string;
  label: string;
  src: string;
  description?: string | null;
  token_contract_address?: string | null;
  logo_url?: string | null;
  ticker?: string | null;
  iframe_url?: string | null;
  website_url?: string | null;
}

export interface TableProfileData {
  description?: string | null;
  token_contract_address?: string | null;
  logo_url?: string | null;
  ticker?: string | null;
  iframe_url?: string | null;
  website_url?: string | null;
}

export interface TableThemeInfo {
  label: string;
  src: string;
  kind: 'image' | 'video';
}

/**
 * Fetches blackjack table list from API when available; falls back to static constants.
 * Use for table picker and resolving theme to label/src.
 */
export function useBlackjackTables() {
  const apiBase = getApiUrlOptional();
  const [imageOptions, setImageOptions] = useState<TableOption[]>(() =>
    BLACKJACK_IMAGE_BACKGROUNDS.map((x) => ({ id: x.id, label: x.label, src: x.src }))
  );
  const [videoOptions, setVideoOptions] = useState<TableOption[]>(() =>
    BLACKJACK_VIDEO_BACKGROUNDS.map((x) => ({ id: x.id, label: x.label, src: x.src }))
  );
  const [loading, setLoading] = useState(!!apiBase);

  useEffect(() => {
    if (!apiBase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`${apiBase}/api/blackjack/tables?enabledOnly=true`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to fetch'))))
      .then((rows: Array<{ id: string; kind: string; name: string; src: string; description?: string; token_contract_address?: string; logo_url?: string; ticker?: string; iframe_url?: string; website_url?: string }>) => {
        if (cancelled || !Array.isArray(rows)) return;
        const normalizeSrc = (src: string) => {
          if (!src) return src;
          if (/^https?:\/\//.test(src) || src.startsWith('/')) return src;
          return `https://${src}`;
        };
        const mapRow = (r: (typeof rows)[0]) => ({
          id: r.id,
          label: r.name,
          src: normalizeSrc(r.src),
          description: r.description ?? null,
          token_contract_address: r.token_contract_address ?? null,
          logo_url: r.logo_url ?? null,
          ticker: r.ticker ?? null,
          iframe_url: r.iframe_url ?? null,
          website_url: r.website_url ?? null,
        });
        const images = rows.filter((r) => r.kind === 'image').map(mapRow);
        const videos = rows.filter((r) => r.kind === 'video').map(mapRow);
        if (images.length > 0 || videos.length > 0) {
          setImageOptions(images.length > 0 ? images : BLACKJACK_IMAGE_BACKGROUNDS.map((x) => ({ id: x.id, label: x.label, src: x.src })));
          setVideoOptions(videos.length > 0 ? videos : BLACKJACK_VIDEO_BACKGROUNDS.map((x) => ({ id: x.id, label: x.label, src: x.src })));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImageOptions(BLACKJACK_IMAGE_BACKGROUNDS.map((x) => ({ id: x.id, label: x.label, src: x.src })));
          setVideoOptions(BLACKJACK_VIDEO_BACKGROUNDS.map((x) => ({ id: x.id, label: x.label, src: x.src })));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [apiBase]);

  const getThemeInfo = useCallback(
    (theme: { kind: 'image' | 'video'; id: string }): TableThemeInfo => {
      if (theme.kind === 'video') {
        const v = videoOptions.find((x) => x.id === theme.id);
        if (v) return { label: v.label, src: v.src, kind: 'video' };
        const fallback = BLACKJACK_VIDEO_BACKGROUNDS[0];
        return { label: fallback.label, src: fallback.src, kind: 'video' };
      }
      const img = imageOptions.find((x) => x.id === theme.id);
      if (img) return { label: img.label, src: img.src, kind: 'image' };
      const def = BLACKJACK_IMAGE_BACKGROUNDS.find((x) => x.id === DEFAULT_BLACKJACK_IMAGE_ID) ?? BLACKJACK_IMAGE_BACKGROUNDS[0];
      return { label: def.label, src: def.src, kind: 'image' };
    },
    [imageOptions, videoOptions]
  );

  const getTableProfile = useCallback(
    (kind: 'image' | 'video', id: string): TableProfileData | null => {
      const options = kind === 'video' ? videoOptions : imageOptions;
      const row = options.find((x) => x.id === id);
      if (!row) return null;
      return {
        description: row.description ?? null,
        token_contract_address: row.token_contract_address ?? null,
        logo_url: row.logo_url ?? null,
        ticker: row.ticker ?? null,
        iframe_url: row.iframe_url ?? null,
        website_url: row.website_url ?? null,
      };
    },
    [imageOptions, videoOptions]
  );

  return { imageOptions, videoOptions, loading, getThemeInfo, getTableProfile };
}
