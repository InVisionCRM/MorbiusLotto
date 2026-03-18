'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type PokerSoundKey =
  | 'player_turn'
  | 'raise'
  | 'call'
  | 'win'
  // These exist in the codebase but are not currently controlled by the UI request.
  | 'cards_dealing'
  | 'opponent_fold'
  | 'opponent_allin'
  | 'opponent_call_raise'
  | 'opponent_checks'
  | 'player_allin'
  | 'opponent_joined'
  | 'opponent_left';

type PokerSoundSettings = {
  muted: boolean;
  volume: Record<PokerSoundKey, number>; // 0..1
  mutedByKey: Partial<Record<PokerSoundKey, boolean>>;
};

const STORAGE_KEY = 'poker:sounds:v1';

const DEFAULT_VOLUME = {
  muted: false,
  volume: {
    player_turn: 1,
    raise: 1,
    call: 1,
    win: 1,
    cards_dealing: 1,
    opponent_fold: 1,
    opponent_allin: 1,
    opponent_call_raise: 1,
    opponent_checks: 1,
    player_allin: 1,
    opponent_joined: 1,
    opponent_left: 1,
  } as PokerSoundSettings['volume'],
  mutedByKey: {},
} satisfies PokerSoundSettings;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function parseSettings(raw: string | null): PokerSoundSettings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PokerSoundSettings>;
    if (typeof parsed !== 'object' || parsed == null) return null;

    const muted = typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_VOLUME.muted;
    const volume = { ...DEFAULT_VOLUME.volume };
    const mutedByKey: PokerSoundSettings['mutedByKey'] = { ...(parsed.mutedByKey ?? {}) };

    const v = parsed.volume;
    if (v && typeof v === 'object') {
      (Object.keys(DEFAULT_VOLUME.volume) as PokerSoundKey[]).forEach((k) => {
        const candidate = (v as Record<string, unknown>)[k];
        if (typeof candidate === 'number') volume[k] = clamp01(candidate);
      });
    }

    return { muted, volume, mutedByKey };
  } catch {
    return null;
  }
}

export function usePokerSounds() {
  const [settings, setSettings] = useState<PokerSoundSettings>(DEFAULT_VOLUME);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const parsed = parseSettings(localStorage.getItem(STORAGE_KEY));
    if (parsed) setSettings(parsed);
    setHydrated(true);
  }, []);

  const setGlobalMuted = useCallback((muted: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, muted };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const setKeyMuted = useCallback((key: PokerSoundKey, muted: boolean) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        mutedByKey: { ...prev.mutedByKey, [key]: muted },
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const setKeyVolume = useCallback((key: PokerSoundKey, volume01: number) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        volume: { ...prev.volume, [key]: clamp01(volume01) },
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const isKeyMuted = useCallback((key: PokerSoundKey) => {
    if (settings.muted) return true;
    return !!settings.mutedByKey[key];
  }, [settings.muted, settings.mutedByKey]);

  const play = useCallback(
    (key: PokerSoundKey, src: string) => {
      if (isKeyMuted(key)) return;
      const volume = settings.volume[key] ?? 1;
      try {
        const a = new Audio(src);
        a.volume = clamp01(volume);
        a.play().catch(() => {});
      } catch {
        // Ignore audio failures (user gesture issues, unsupported files, etc).
      }
    },
    [isKeyMuted, settings.volume]
  );

  const ui = useMemo(() => {
    return {
      hydrated,
      globalMuted: settings.muted,
      setGlobalMuted,
      isKeyMuted,
      setKeyMuted,
      setKeyVolume,
      getKeyVolume: (key: PokerSoundKey) => settings.volume[key] ?? 1,
      play,
    };
  }, [hydrated, isKeyMuted, play, settings.muted, settings.volume, setGlobalMuted, setKeyMuted, setKeyVolume]);

  return ui;
}

