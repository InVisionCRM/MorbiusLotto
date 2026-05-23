'use client';

/**
 * MiniAppProfileEditor — the Phase 3 Profile screen for the Telegram Mini App.
 *
 * Loads the linked player's profile from the public
 * GET /api/player/:address/profile, lets them edit their avatar (via the
 * shared CharacterCreator), display name, bio and social handles, and saves
 * through POST /api/telegram/miniapp/profile — authenticated by the Telegram
 * `initData` passed down from the Mini App shell.
 *
 * CharacterCreator is the same editor the website uses; it already runs on the
 * public home page without a connected wallet, so it is safe inside the Mini
 * App (which authenticates via Telegram, not a browser wallet).
 */

import { useCallback, useEffect, useState } from 'react';
import { IconArrowLeft, IconArrowsShuffle, IconDeviceFloppy } from '@tabler/icons-react';
import CharacterCreator, {
  DEFAULT_AVATAR_CONFIG,
  randomizeConfig,
} from '@/components/avatar/CharacterCreator';
import type { AvatarConfig } from '@/lib/websocket-client';

type LoadState = 'loading' | 'error' | 'ready';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface ProfileResponse {
  displayName?: string | null;
  avatarConfig?: Partial<AvatarConfig> | null;
  bio?: string | null;
  xHandle?: string | null;
  tgHandle?: string | null;
}

interface MiniAppProfileEditorProps {
  walletAddress: string;
  /** Signed Telegram initData — the auth token for the save request. */
  initData: string;
  onBack: () => void;
}

export default function MiniAppProfileEditor({
  walletAddress,
  initData,
  onBack,
}: MiniAppProfileEditorProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [xHandle, setXHandle] = useState('');
  const [tgHandle, setTgHandle] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    (async () => {
      try {
        const res = await fetch(`/api/player/${walletAddress}/profile`);
        const data = (await res.json()) as ProfileResponse;
        if (cancelled) return;
        if (!res.ok) {
          setLoadState('error');
          return;
        }
        setAvatarConfig({
          ...DEFAULT_AVATAR_CONFIG,
          ...(data.avatarConfig ?? {}),
        });
        setName(typeof data.displayName === 'string' ? data.displayName : '');
        setBio(typeof data.bio === 'string' ? data.bio : '');
        setXHandle(typeof data.xHandle === 'string' ? data.xHandle : '');
        setTgHandle(typeof data.tgHandle === 'string' ? data.tgHandle : '');
        setLoadState('ready');
      } catch {
        if (!cancelled) setLoadState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  const save = useCallback(async () => {
    setSaveState('saving');
    try {
      const res = await fetch('/api/telegram/miniapp/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, displayName: name, avatarConfig, bio, xHandle, tgHandle }),
      });
      const data = (await res.json()) as { ok?: boolean };
      if (!res.ok || !data?.ok) {
        setSaveState('error');
        return;
      }
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 2500);
    } catch {
      setSaveState('error');
    }
  }, [initData, name, avatarConfig, bio, xHandle, tgHandle]);

  const fieldClass =
    'w-full rounded-xl border border-cyan-500/15 bg-[#0b1a2c] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-cyan-500/50 focus:outline-none';

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to hub"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/5 text-cyan-400"
        >
          <IconArrowLeft size={18} aria-hidden />
        </button>
        <h1 className="mitr-bold text-xl text-white">Profile</h1>
      </div>

      {loadState === 'loading' && (
        <p className="mt-10 text-center text-sm text-slate-500">Loading your profile…</p>
      )}

      {loadState === 'error' && (
        <div className="mt-8 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-center">
          <p className="text-sm text-red-200/90">Could not load your profile. Try again.</p>
        </div>
      )}

      {loadState === 'ready' && (
        <>
          <div className="mb-2 flex justify-end">
            <button
              type="button"
              onClick={() => setAvatarConfig(randomizeConfig())}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-400"
            >
              <IconArrowsShuffle size={14} aria-hidden />
              Randomize
            </button>
          </div>

          <div className="flex flex-col" style={{ height: '62vh', minHeight: 460 }}>
            <CharacterCreator
              config={avatarConfig}
              onChange={setAvatarConfig}
              displayName={name}
              onDisplayNameChange={setName}
              compact
            />
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <div>
              <label htmlFor="tg-bio" className="mb-1 block text-xs text-slate-500">
                Bio
              </label>
              <textarea
                id="tg-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={200}
                rows={2}
                placeholder="A short line about you"
                className={`${fieldClass} resize-none`}
              />
            </div>
            <div>
              <label htmlFor="tg-x" className="mb-1 block text-xs text-slate-500">
                X handle
              </label>
              <input
                id="tg-x"
                type="text"
                value={xHandle}
                onChange={(e) => setXHandle(e.target.value)}
                maxLength={50}
                placeholder="yourhandle"
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="tg-tg" className="mb-1 block text-xs text-slate-500">
                Telegram handle
              </label>
              <input
                id="tg-tg"
                type="text"
                value={tgHandle}
                onChange={(e) => setTgHandle(e.target.value)}
                maxLength={50}
                placeholder="yourhandle"
                className={fieldClass}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saveState === 'saving'}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            style={{ boxShadow: '0 8px 26px -8px rgba(6,182,212,0.55), 0 0 0 1px rgba(34,211,238,0.20)' }}
          >
            <IconDeviceFloppy size={16} aria-hidden />
            {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save profile'}
          </button>

          {saveState === 'error' && (
            <p className="mt-2 text-center text-xs text-red-300/90">
              Could not save. Check your connection and try again.
            </p>
          )}

          <button
            type="button"
            onClick={onBack}
            className="mt-3 w-full rounded-xl border border-cyan-500/20 px-4 py-3 text-sm font-medium text-slate-300"
          >
            Back to hub
          </button>
        </>
      )}
    </div>
  );
}
