'use client';

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
import { X, ExternalLink, UserPlus, UserCheck, Gift } from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';
import { usePokerPlayerStats } from '@/hooks/use-poker-stats';
import { useIsFollowing, useFollowMutation, useFollowCounts } from '@/hooks/use-follow';
import { useProfileForAddress } from '@/hooks/use-player-profile';
import { useAccount } from 'wagmi';
import { AvatarView } from '@/components/avatar';
import type { AvatarPayload } from '@/lib/websocket-client';

function formatChips(wei: string | number): string {
  try {
    return formatMorbiusFloor(wei, { compact: false });
  } catch {
    return String(wei);
  }
}

export interface PokerOpponentProfileCardProps {
  address: string;
  displayName?: string | null;
  avatarConfig?: AvatarPayload | null;
  onClose: () => void;
  onViewFullProfile: (address: string) => void;
}

export function PokerOpponentProfileCard({
  address,
  displayName,
  avatarConfig,
  onClose,
  onViewFullProfile,
}: PokerOpponentProfileCardProps) {
  const { address: myAddress } = useAccount();
  const myAddr = myAddress?.toLowerCase() ?? null;

  const { data: stats, isLoading } = usePokerPlayerStats(address);
  const { bio, xHandle, tgHandle } = useProfileForAddress(address);
  const { data: counts } = useFollowCounts(address);
  const { data: isFollowing, isLoading: followLoading } = useIsFollowing(myAddr, address);
  const { follow, unfollow } = useFollowMutation(myAddr, address);
  const cardRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shortAddr = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const name = displayName?.trim() || shortAddr;

  const statRows = [
    ...(stats ? [
      { label: 'Win Rate',     value: `${Math.round(stats.win_rate)}%`,      color: stats.win_rate >= 50 ? '#4ade80' : stats.win_rate >= 35 ? '#facc15' : '#f87171' },
      { label: 'Hands Played', value: stats.total_hands.toLocaleString(),    color: '#94a3b8' },
      { label: 'Biggest Pot',  value: formatChips(stats.biggest_pot_won),    color: '#fbbf24' },
    ] : []),
    { label: 'Followers',    value: (counts?.followerCount  ?? '—').toLocaleString(), color: '#c4b5fd' },
    { label: 'Following',    value: (counts?.followingCount ?? '—').toLocaleString(), color: '#c4b5fd' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[55]"
        onClick={onClose}
        aria-hidden
      />

      {/* Card */}
      <motion.div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${name}'s profile`}
        className="fixed left-1/2 top-1/2 z-[56] w-72 -translate-x-1/2 -translate-y-1/2"
        initial={{ opacity: 0, scale: 0.92, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 8 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(145deg, rgba(10,14,28,0.98), rgba(18,24,42,0.98))',
            border: '1px solid rgba(99,179,237,0.25)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          {/* Header */}
          <div
            className="relative flex items-center gap-3 px-4 pt-4 pb-3"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
          >
            {/* Avatar */}
            <div
              className="shrink-0 rounded-full overflow-hidden"
              style={{
                width: 52,
                height: 52,
                border: '2px solid rgba(255,255,255,0.18)',
                background: 'rgba(0,0,0,0.6)',
              }}
            >
              {avatarConfig ? (
                <AvatarView config={avatarConfig} emotion="neutral" compact className="w-full h-full" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center font-bold text-xl"
                  style={{ background: 'linear-gradient(135deg, #1e1e32, #0a0a14)', color: '#e2e8f0' }}
                >
                  {name[0].toUpperCase()}
                </div>
              )}
            </div>

            {/* Name + address */}
            <div className="min-w-0 flex-1">
              <div
                className="font-bold truncate leading-tight"
                style={{ color: '#f1f5f9', fontSize: 15 }}
              >
                {name}
              </div>
              <div className="flex items-center gap-1 mt-0.5" title="Copy address">
                <span
                  className="font-mono truncate"
                  style={{ color: 'rgba(148,163,184,0.8)', fontSize: 11 }}
                >
                  {shortAddr}
                </span>
                <CopyButton
                  content={address}
                  copyToast="Address copied"
                  variant="ghost"
                  size="xs"
                  className="h-7 w-7 shrink-0 p-0 opacity-60 hover:opacity-100 text-[#94a3b8]"
                  title="Copy address"
                  aria-label="Copy address"
                />
              </div>
            </div>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 p-1 rounded-lg opacity-50 hover:opacity-100 hover:bg-white/10 transition-all"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* Stats */}
          <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {isLoading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-4 rounded animate-pulse" style={{ background: 'rgba(255,255,255,0.08)', width: i === 2 ? '60%' : '80%' }} />
                ))}
              </div>
            ) : statRows.length > 0 ? (
              <div className="flex flex-col gap-2">
                {statRows.map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span style={{ color: 'rgba(148,163,184,0.8)', fontSize: 12 }}>{label}</span>
                    <span className="font-bold tabular-nums" style={{ color, fontSize: 13 }}>{value}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'rgba(148,163,184,0.6)', fontSize: 12, textAlign: 'center' }}>No stats yet</p>
            )}
          </div>

          {/* Bio + social handles */}
          {(bio || xHandle || tgHandle) && (
            <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
              {bio && (
                <p className="text-xs leading-relaxed mb-2" style={{ color: 'rgba(203,213,225,0.85)' }}>
                  {bio}
                </p>
              )}
              {(xHandle || tgHandle) && (
                <div className="flex flex-wrap gap-2">
                  {xHandle && (
                    <a
                      href={`https://x.com/${xHandle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs rounded-md px-2 py-1 transition-opacity hover:opacity-80"
                      style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(203,213,225,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700 }}>𝕏</span>
                      @{xHandle}
                    </a>
                  )}
                  {tgHandle && (
                    <a
                      href={`https://t.me/${tgHandle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs rounded-md px-2 py-1 transition-opacity hover:opacity-80"
                      style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(203,213,225,0.8)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      <span>✈️</span>
                      @{tgHandle}
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-col gap-2 p-3">
            <button
              type="button"
              onClick={() => { onClose(); onViewFullProfile(address); }}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-lg font-semibold text-sm transition-all hover:brightness-110 active:scale-[0.98]"
              style={{
                background: 'linear-gradient(135deg, rgba(56,189,248,0.2), rgba(99,102,241,0.2))',
                border: '1px solid rgba(56,189,248,0.3)',
                color: '#7dd3fc',
              }}
            >
              <ExternalLink className="w-4 h-4" />
              View Full Profile
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={!myAddr || followLoading || follow.isPending || unfollow.isPending}
                onClick={() => isFollowing ? unfollow.mutate() : follow.mutate()}
                className="flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg font-semibold text-sm transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
                style={isFollowing
                  ? { background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.35)', color: '#a5b4fc' }
                  : { background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.25)', color: '#4ade80' }
                }
              >
                {isFollowing
                  ? <><UserCheck className="w-3.5 h-3.5" /> Following</>
                  : <><UserPlus  className="w-3.5 h-3.5" /> Follow</>
                }
              </button>

              <button
                type="button"
                disabled
                className="flex items-center justify-center gap-1.5 flex-1 py-2 rounded-lg font-semibold text-sm cursor-not-allowed"
                style={{
                  background: 'rgba(251,191,36,0.08)',
                  border: '1px solid rgba(251,191,36,0.15)',
                  color: 'rgba(251,191,36,0.4)',
                }}
                title="Coming soon"
              >
                <Gift className="w-3.5 h-3.5" />
                Gift
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
