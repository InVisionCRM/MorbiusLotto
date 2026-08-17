'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BLACKJACK_IMAGE_BACKGROUNDS,
  BLACKJACK_VIDEO_BACKGROUNDS,
  DEFAULT_BLACKJACK_IMAGE_ID,
} from '@/app/BLACKJACK/constants';

export interface TableOption {
  id: string;
  label: string;
  src: string;
  /** Card hand lean in degrees ({dealer, player}, 0-75); absent = flat. */
  card_pitch?: { dealer: number; player: number } | null;
  description?: string | null;
  token_contract_address?: string | null;
  logo_url?: string | null;
  ticker?: string | null;
  iframe_url?: string | null;
  website_url?: string | null;
}

export interface TableProfileData {
  /** Table display name (e.g. "High Roller") — used as card title; ticker remains subtitle */
  name?: string | null;
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
  /** Per-table card lean, matching cards to art drawn in perspective. */
  cardPitch?: { dealer: number; player: number } | null;
}

function normalizeSrc(src: string): string {
  if (!src) return src;
  if (/^https?:\/\//.test(src) || src.startsWith('/')) return src;
  return `https://${src}`;
}

/** Merge profile fields from every option that refers to the same felt (same normalized src). DB rows (UUID id) usually hold token/logo/description; bundled static rows only have id/label/src. */
function buildTableProfileData(requestedId: string, candidates: TableOption[]): TableProfileData {
  const idMatch = candidates.find((c) => c.id === requestedId);
  const name = idMatch?.label ?? candidates[0]?.label ?? null;

  const firstNonNull = <K extends keyof TableOption>(key: K): string | null => {
    for (const c of candidates) {
      const v = c[key];
      if (typeof v === 'string' && v.trim() !== '') return v;
      if (v != null && v !== '') return String(v);
    }
    return null;
  };

  return {
    name,
    description: firstNonNull('description'),
    token_contract_address: firstNonNull('token_contract_address'),
    logo_url: firstNonNull('logo_url'),
    ticker: firstNonNull('ticker'),
    iframe_url: firstNonNull('iframe_url'),
    website_url: firstNonNull('website_url'),
  };
}

/** DB rows first (sort_order), then static ids missing from DB so pickers always include bundled tables. */
function mergeWithStatic(
  apiMapped: TableOption[],
  staticDefs: readonly { id: string; label: string; src: string }[]
): TableOption[] {
  const apiIds = new Set(apiMapped.map((r) => r.id));
  const extra = staticDefs
    .filter((x) => !apiIds.has(x.id))
    .map((x) => ({ id: x.id, label: x.label, src: normalizeSrc(x.src) }));
  return [...apiMapped, ...extra];
}

export type UseBlackjackTablesOptions = {
  /** When false, includes disabled marketing tables (e.g. admin pickers). Default true for players. */
  enabledOnly?: boolean;
};

/**
 * Fetches blackjack table list from API when available; falls back to static constants.
 * Use for table picker and resolving theme to label/src.
 */
export function useBlackjackTables(options?: UseBlackjackTablesOptions) {
  const enabledOnly = options?.enabledOnly ?? true;
  const [imageOptions, setImageOptions] = useState<TableOption[]>(() =>
    BLACKJACK_IMAGE_BACKGROUNDS.map((x) => ({ id: x.id, label: x.label, src: x.src }))
  );
  const [videoOptions, setVideoOptions] = useState<TableOption[]>(() =>
    BLACKJACK_VIDEO_BACKGROUNDS.map((x) => ({ id: x.id, label: x.label, src: x.src }))
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const q = enabledOnly ? 'enabledOnly=true' : 'enabledOnly=false';
    // Same-origin proxy (app/api/blackjack/tables) → Express + DB. Works when only BLACKJACK_SERVER_URL is set on the server.
    fetch(`/api/blackjack/tables?${q}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to fetch'))))
      .then((rows: Array<{ id: string; kind: string; name: string; src: string; description?: string; token_contract_address?: string; logo_url?: string; ticker?: string; iframe_url?: string; website_url?: string; card_pitch?: { dealer: number; player: number } | null }>) => {
        if (cancelled || !Array.isArray(rows)) return;
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
          card_pitch: r.card_pitch ?? null,
        });
        const images = rows.filter((r) => r.kind === 'image').map(mapRow);
        const videos = rows.filter((r) => r.kind === 'video').map(mapRow);
        setImageOptions(mergeWithStatic(images, BLACKJACK_IMAGE_BACKGROUNDS));
        setVideoOptions(mergeWithStatic(videos, BLACKJACK_VIDEO_BACKGROUNDS));
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
  }, [enabledOnly]);

  const resolveThemeSource = useCallback(
    (kind: 'image' | 'video', id: string): string | null => {
      if (id == null || typeof id !== 'string' || id === '') return null;
      const options = kind === 'video' ? videoOptions : imageOptions;
      const byId = options.find((x) => x.id === id);
      if (byId?.src) return normalizeSrc(byId.src);
      const legacy = (kind === 'video' ? BLACKJACK_VIDEO_BACKGROUNDS : BLACKJACK_IMAGE_BACKGROUNDS).find((x) => x.id === id);
      if (legacy?.src) return normalizeSrc(legacy.src);
      // Some multiplayer tables store src directly as theme_id.
      if (id.startsWith('/') || /^https?:\/\//.test(id)) return normalizeSrc(id);
      return null;
    },
    [imageOptions, videoOptions]
  );

  const getThemeInfo = useCallback(
    (theme: { kind: 'image' | 'video'; id: string }): TableThemeInfo => {
      if (theme.id == null || theme.id === '') {
        if (theme.kind === 'video') {
          const fallback = BLACKJACK_VIDEO_BACKGROUNDS[0];
          return { label: fallback.label, src: fallback.src, kind: 'video' };
        }
        const def = BLACKJACK_IMAGE_BACKGROUNDS.find((x) => x.id === DEFAULT_BLACKJACK_IMAGE_ID) ?? BLACKJACK_IMAGE_BACKGROUNDS[0];
        return { label: def.label, src: def.src, kind: 'image' };
      }
      const options = theme.kind === 'video' ? videoOptions : imageOptions;
      const byId = options.find((x) => x.id === theme.id);
      if (byId) return { label: byId.label, src: byId.src, kind: theme.kind, cardPitch: byId.card_pitch ?? null };

      const resolvedSrc = resolveThemeSource(theme.kind, theme.id);
      if (resolvedSrc) {
        const bySrc = options.find((x) => normalizeSrc(x.src) === resolvedSrc);
        if (bySrc) return { label: bySrc.label, src: bySrc.src, kind: theme.kind };
      }

      if (theme.kind === 'video') {
        const fallback = BLACKJACK_VIDEO_BACKGROUNDS[0];
        return { label: fallback.label, src: fallback.src, kind: 'video' };
      }
      const def = BLACKJACK_IMAGE_BACKGROUNDS.find((x) => x.id === DEFAULT_BLACKJACK_IMAGE_ID) ?? BLACKJACK_IMAGE_BACKGROUNDS[0];
      return { label: def.label, src: def.src, kind: 'image' };
    },
    [imageOptions, videoOptions, resolveThemeSource]
  );

  const getTableProfile = useCallback(
    (kind: 'image' | 'video', id: string): TableProfileData | null => {
      const options = kind === 'video' ? videoOptions : imageOptions;
      const trimmed = id?.trim() ?? '';
      if (!trimmed) {
        const info = getThemeInfo({ kind, id: '' });
        return {
          name: info.label,
          description: null,
          token_contract_address: null,
          logo_url: null,
          ticker: null,
          iframe_url: null,
          website_url: null,
        };
      }

      const resolvedSrc = resolveThemeSource(kind, trimmed);
      const candidates = options.filter(
        (x) =>
          x.id === trimmed ||
          (resolvedSrc != null && normalizeSrc(x.src) === resolvedSrc)
      );

      if (candidates.length > 0) {
        return buildTableProfileData(trimmed, candidates);
      }

      // Multiplayer / deep links: theme_id may not exist in admin table list — still show theme label
      const info = getThemeInfo({ kind, id: trimmed });
      return {
        name: info.label,
        description: null,
        token_contract_address: null,
        logo_url: null,
        ticker: null,
        iframe_url: null,
        website_url: null,
      };
    },
    [imageOptions, videoOptions, getThemeInfo, resolveThemeSource]
  );

  return { imageOptions, videoOptions, loading, getThemeInfo, getTableProfile };
}
