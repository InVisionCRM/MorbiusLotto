'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import type { AvatarConfig } from '@/lib/websocket-client';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import CharacterCreator, { DEFAULT_AVATAR_CONFIG } from '@/components/poker/avatar/CharacterCreator';
import { motion, AnimatePresence } from 'framer-motion';
import { useProfileWs } from '@/contexts/profile-ws-context';

export interface ProfileAvatarModalProps {
  open: boolean;
  onClose: () => void;
  /** When provided (e.g. from poker table), use for load/save. Else use context or REST. */
  wsClient?: BlackjackWebSocketClient | null;
  onSave?: () => void;
}

function normalizeAvatarConfig(c: unknown): AvatarConfig {
  if (c != null && typeof c === 'object' && 'skinColor' in c) {
    const o = c as Record<string, unknown>;
    return {
      skinColor: typeof o.skinColor === 'string' ? o.skinColor : DEFAULT_AVATAR_CONFIG.skinColor,
      hairStyle: typeof o.hairStyle === 'string' ? o.hairStyle : DEFAULT_AVATAR_CONFIG.hairStyle,
      hairColor: typeof o.hairColor === 'string' ? o.hairColor : DEFAULT_AVATAR_CONFIG.hairColor,
      eyeShape: typeof o.eyeShape === 'string' ? o.eyeShape : DEFAULT_AVATAR_CONFIG.eyeShape,
      eyeColor: typeof o.eyeColor === 'string' ? o.eyeColor : DEFAULT_AVATAR_CONFIG.eyeColor,
      noseShape: typeof o.noseShape === 'string' ? o.noseShape : DEFAULT_AVATAR_CONFIG.noseShape,
      lipShape: typeof o.lipShape === 'string' ? o.lipShape : DEFAULT_AVATAR_CONFIG.lipShape,
      accessory: typeof o.accessory === 'string' ? o.accessory : DEFAULT_AVATAR_CONFIG.accessory,
      flag: typeof o.flag === 'string' ? o.flag : DEFAULT_AVATAR_CONFIG.flag,
      shirtColor: typeof o.shirtColor === 'string' ? o.shirtColor : DEFAULT_AVATAR_CONFIG.shirtColor,
      hat: typeof o.hat === 'string' ? o.hat : DEFAULT_AVATAR_CONFIG.hat,
      necklace: typeof o.necklace === 'string' ? o.necklace : DEFAULT_AVATAR_CONFIG.necklace,
      mouthAccessory: typeof o.mouthAccessory === 'string' ? o.mouthAccessory : DEFAULT_AVATAR_CONFIG.mouthAccessory,
      backgroundImage: typeof o.backgroundImage === 'string' ? o.backgroundImage : DEFAULT_AVATAR_CONFIG.backgroundImage,
    };
  }
  return DEFAULT_AVATAR_CONFIG;
}

export function ProfileAvatarModal({ open, onClose, wsClient: wsClientProp, onSave }: ProfileAvatarModalProps) {
  const profileWs = useProfileWs();
  const wsClient = wsClientProp ?? profileWs?.wsClient ?? null;
  const { openConnectModal } = useConnectModal();
  const { address } = useAccount();

  const [displayName, setDisplayName] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [config, setConfig] = useState<AvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (wsClient?.isConnected()) {
        const profile = await wsClient.getProfile();
        setDisplayName(profile.displayName ?? '');
        setProfileImageUrl(profile.profileImageUrl ?? null);
        setConfig(normalizeAvatarConfig(profile.avatarConfig));
      } else if (address) {
        const res = await fetch(`/api/player/${address}/profile`);
        if (!res.ok) throw new Error('Failed to load profile');
        const data = await res.json();
        setDisplayName(data.displayName ?? '');
        setProfileImageUrl(data.profileImageUrl ?? null);
        setConfig(normalizeAvatarConfig(data.avatarConfig));
      } else {
        setDisplayName('');
        setProfileImageUrl(null);
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

  const handleSave = async () => {
    const name = displayName.trim();
    if (name.length < 3) {
      setError('Display name must be at least 3 characters');
      return;
    }
    if (name.length > 32) {
      setError('Display name must be at most 32 characters');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (wsClient?.isConnected()) {
        await wsClient.setDisplayName(name, profileImageUrl, config);
        onSave?.();
        onClose();
        return;
      }
      if (!address) {
        setError('Connect your wallet to save');
        return;
      }
      const res = await fetch('/api/player/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          displayName: name,
          profileImageUrl: profileImageUrl ?? null,
          avatarConfig: config,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save profile');
      }
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
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between flex-shrink-0">
            <h2 className="text-lg font-bold text-white">Edit profile & avatar</h2>
            <button
              type="button"
              onClick={onClose}
              className="text-white/70 hover:text-white p-1 rounded"
              aria-label="Close"
            >
              <span className="text-2xl leading-none">&times;</span>
            </button>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center p-12 text-white/70">Loading profile...</div>
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col" style={{ maxHeight: 'calc(85vh - 140px)' }}>
                <CharacterCreator
                  config={config}
                  onChange={setConfig}
                  displayName={displayName}
                  onDisplayNameChange={setDisplayName}
                  compact
                />
              </div>

              {error && (
                <div className="px-4 py-1.5 text-red-400 text-sm flex-shrink-0">{error}</div>
              )}

              <div className="px-4 py-2.5 border-t border-white/10 flex justify-end gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={canSave ? handleSave : () => openConnectModal?.()}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg font-medium bg-cyan-600 hover:bg-cyan-500 text-white disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving...' : !canSave ? 'Connect wallet to save' : 'Save'}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
