'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppKit } from '@reown/appkit/react';
import { useAccount } from 'wagmi';
import type { AvatarConfig } from '@/lib/websocket-client';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { CharacterCreator, DEFAULT_AVATAR_CONFIG, randomizeConfig } from '@/components/avatar';
import type { RandomizeConfigOptions } from '@/components/avatar';
import { parseAvatarPayload } from '@/lib/avatar-payload';
import { motion, AnimatePresence } from 'framer-motion';
import { useProfileWs } from '@/contexts/profile-ws-context';
import { apiFetch } from '@/lib/api-auth';
import {
  AVATAR_RANDOMIZE_FIELD_PINS_KEY,
  readRandomizeFieldPinsFromStorage,
  type AvatarRandomizeFieldKey,
} from '@/lib/avatar-randomize-pins';
import { Shuffle } from 'lucide-react';

export interface ProfileAvatarModalProps {
  open: boolean;
  onClose: () => void;
  /** When provided (e.g. from poker table), use for load/save. Else use context or REST. */
  wsClient?: BlackjackWebSocketClient | null;
  onSave?: () => void;
}

function hydrateAvatarFromServer(raw: unknown): AvatarConfig {
  const parsed = parseAvatarPayload(raw);
  return parsed != null ? { ...parsed } : DEFAULT_AVATAR_CONFIG;
}

const PROFILE_PHOTO_MAX_DIM = 256;
const PROFILE_PHOTO_JPEG_QUALITY = 0.82;

async function fileToDownscaledDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please select an image file.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Image too large (max 10MB).');
  const bitmap = await createImageBitmap(file);
  const { width: w, height: h } = bitmap;
  const scale = Math.min(1, PROFILE_PHOTO_MAX_DIM / Math.max(w, h));
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported.');
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();
  const hasAlpha = file.type === 'image/png' || file.type === 'image/webp';
  return canvas.toDataURL(hasAlpha ? 'image/png' : 'image/jpeg', PROFILE_PHOTO_JPEG_QUALITY);
}

export function ProfileAvatarModal({ open, onClose, wsClient: wsClientProp, onSave }: ProfileAvatarModalProps) {
  const profileWs = useProfileWs();
  const wsClient = wsClientProp ?? profileWs?.wsClient ?? null;
  const { open: openConnectModal } = useAppKit();
  const { address } = useAccount();

  const [displayName, setDisplayName] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [profileDisplayMode, setProfileDisplayMode] = useState<'avatar' | 'photo'>('avatar');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const handlePhotoPicked = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    setPhotoError(null);
    try {
      const dataUrl = await fileToDownscaledDataUrl(file);
      setProfileImageUrl(dataUrl);
      setProfileDisplayMode('photo');
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Failed to read image.');
    }
  }, []);

  const handlePhotoToggleClick = useCallback(() => {
    if (profileImageUrl) {
      setProfileDisplayMode('photo');
    } else {
      photoInputRef.current?.click();
    }
  }, [profileImageUrl]);

  const handleRemovePhoto = useCallback(() => {
    setProfileImageUrl(null);
    setProfileDisplayMode('avatar');
    setPhotoError(null);
  }, []);

  const [config, setConfig] = useState<AvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [randomizePinnedFields, setRandomizePinnedFields] = useState<Set<string>>(readRandomizeFieldPinsFromStorage);

  const toggleRandomPin = useCallback((field: AvatarRandomizeFieldKey) => {
    setRandomizePinnedFields((prev) => {
      const next = new Set(prev);
      const k = field as string;
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(AVATAR_RANDOMIZE_FIELD_PINS_KEY, JSON.stringify([...randomizePinnedFields]));
    } catch {
      /* ignore */
    }
  }, [randomizePinnedFields]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (wsClient?.isConnected()) {
        const profile = await wsClient.getProfile();
        setDisplayName(profile.displayName ?? '');
        setProfileImageUrl(profile.profileImageUrl ?? null);
        setProfileDisplayMode(profile.profileDisplayMode === 'photo' ? 'photo' : 'avatar');
        setConfig(hydrateAvatarFromServer(profile.avatarConfig));
      } else if (address) {
        const res = await fetch(`/api/player/${address}/profile`);
        if (!res.ok) throw new Error('Failed to load profile');
        const data = await res.json();
        setDisplayName(data.displayName ?? '');
        setProfileImageUrl(data.profileImageUrl ?? null);
        setProfileDisplayMode(data.profileDisplayMode === 'photo' ? 'photo' : 'avatar');
        setConfig(hydrateAvatarFromServer(data.avatarConfig));
      } else {
        setDisplayName('');
        setProfileImageUrl(null);
        setProfileDisplayMode('avatar');
        setConfig(DEFAULT_AVATAR_CONFIG);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [wsClient, address]);

  useEffect(() => {
    if (open) {
      loadProfile();
    }
  }, [open, loadProfile]);

  const handleFooterRandomize = useCallback(() => {
    const opts: RandomizeConfigOptions = {};
    if (randomizePinnedFields.size) {
      opts.preserveFrom = config;
      opts.pinnedFields = randomizePinnedFields;
    }
    setConfig(randomizeConfig(undefined, Object.keys(opts).length ? opts : undefined));
  }, [config, randomizePinnedFields]);

  const handleSave = async () => {
    const name = displayName.trim();
    if (name.length > 32) {
      setError('Display name must be at most 32 characters');
      return;
    }

    const avatarPayload = config;

    setSaving(true);
    setError(null);
    try {
      if (wsClient?.isConnected()) {
        await wsClient.setDisplayName(name, profileImageUrl ?? '', avatarPayload, undefined, undefined, undefined, profileDisplayMode);
        onSave?.();
        onClose();
        return;
      }
      if (!address) {
        setError('Connect your wallet to save');
        return;
      }
      // SIWE-gated. address dropped from body — server reads from session.
      await apiFetch('/api/player/profile', {
        method: 'POST',
        body: JSON.stringify({
          displayName: name,
          profileImageUrl: profileImageUrl ?? '',
          avatarConfig: avatarPayload,
          profileDisplayMode,
        }),
      });
      onSave?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const canSave = wsClient?.isConnected() || address;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[300] flex items-start sm:items-center justify-center sm:p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          className="bg-white border border-gray-100 text-gray-900 rounded-none sm:rounded-[2rem] shadow-2xl max-w-xl w-full mt-14 h-[calc(100dvh-3.5rem)] sm:mt-0 sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col"
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 8, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex px-4 py-2.5 border-b border-gray-100 items-center gap-3 flex-shrink-0 bg-white">
            <h2 className="text-sm font-semibold text-gray-900">Avatar</h2>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="hidden sm:flex text-gray-500 hover:text-gray-700 p-2 -m-2 rounded min-w-[44px] min-h-[44px] items-center justify-center touch-manipulation"
              aria-label="Close"
            >
              <span className="text-2xl leading-none">&times;</span>
            </button>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center p-12 text-white/70">Loading profile...</div>
          ) : (
            <>
              <div className="relative flex-1 min-h-0 overflow-hidden flex flex-col">
                <div className="shrink-0 px-3 py-1.5 border-b border-gray-100 bg-gray-50/60 relative z-10">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex items-center gap-2">
                      {profileImageUrl ? (
                        <img
                          src={profileImageUrl}
                          alt="Profile photo"
                          className="h-8 w-8 rounded-full object-cover ring-1 ring-gray-300 shrink-0"
                          draggable={false}
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-gray-700 leading-tight">Show at game tables</p>
                        <p className="text-[10px] text-gray-500 leading-tight">Chat always uses your photo.</p>
                      </div>
                    </div>
                    <div className="inline-flex rounded-lg bg-gray-200 p-0.5 shrink-0" role="group" aria-label="Game seat appearance">
                      <button
                        type="button"
                        onClick={() => setProfileDisplayMode('avatar')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                          profileDisplayMode === 'avatar' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                        }`}
                        aria-pressed={profileDisplayMode === 'avatar'}
                      >
                        Avatar
                      </button>
                      <button
                        type="button"
                        onClick={handlePhotoToggleClick}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                          profileDisplayMode === 'photo' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                        }`}
                        aria-pressed={profileDisplayMode === 'photo'}
                      >
                        {profileImageUrl ? 'Photo' : 'Upload photo'}
                      </button>
                    </div>
                  </div>
                  {profileImageUrl && (
                    <div className="mt-1 flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="text-cyan-600 hover:text-cyan-700 underline-offset-2 hover:underline"
                      >
                        Replace
                      </button>
                      <span className="text-gray-300">·</span>
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="text-red-500 hover:text-red-600 underline-offset-2 hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  {photoError && (
                    <p className="mt-1 text-[10px] text-red-500">{photoError}</p>
                  )}
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={handlePhotoPicked}
                    aria-label="Upload profile photo"
                  />
                </div>
                <CharacterCreator
                  config={config}
                  onChange={setConfig}
                  displayName={displayName}
                  onDisplayNameChange={setDisplayName}
                  compact
                  pinnedRandomFields={randomizePinnedFields}
                  onToggleRandomPin={toggleRandomPin}
                />
              </div>

              {error && (
                <div className="px-4 py-1.5 text-red-400 text-sm flex-shrink-0">{error}</div>
              )}

              <div className="px-3 py-1.5 border-t border-white/10 flex items-center gap-1 flex-shrink-0">
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors touch-manipulation"
                >
                  Cancel
                </button>
                {!loading && (
                  <button
                    type="button"
                    onClick={handleFooterRandomize}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-violet-400/50 text-violet-800 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 transition-colors touch-manipulation"
                  >
                    <Shuffle size={15} />
                    Randomize
                  </button>
                )}
                <button
                  type="button"
                  onClick={canSave ? handleSave : () => openConnectModal?.()}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-md text-sm font-medium bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 transition-colors touch-manipulation"
                >
                  {saving ? 'Saving...' : !canSave ? 'Connect wallet' : 'Save'}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
