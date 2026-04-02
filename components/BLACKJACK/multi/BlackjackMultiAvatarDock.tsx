'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, LogOut, MessageCircle, Palette, Settings2, Smile, SmilePlus, Trophy, Volume2, Zap, Flame, Frown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import type { BJMultiSeatState, AvatarConfig } from '@/lib/websocket-client';
import { AvatarView } from '@/components/avatar';
import type { Emotion } from '@/components/avatar';
import { RadialMenuFloating, type RadialMenuItem } from '@/components/ui/radial-menu';
import { useQuickChatPhrases } from '@/hooks/useQuickChatPhrases';
import { EditQuickChatModal } from '@/components/poker/EditQuickChatModal';
import { DEFAULT_BLACKJACK_QUICKCHAT_PHRASES } from '@/components/poker/quickchat-phrases';

const TURN_TIMEOUT = 30;
const BETTING_TIMEOUT = 15;
const POSITIONS = [0, 1, 2] as const;
const DOCK_AVATAR_SIZE = 40;
const AVATAR_EMOTION_DURATION_MS = 3000;
const AVATAR_EMOTION_WINK_MS = 1200;
const PHRASE_OVERLAY_DURATION_MS = 2000;

const AVATAR_ANIMATIONS: { title: string; emotion: Emotion }[] = [
  { title: 'Happy', emotion: 'happy' },
  { title: 'Wink', emotion: 'wink' },
  { title: 'Surprised', emotion: 'surprised' },
  { title: 'Angry', emotion: 'angry' },
  { title: 'Sad', emotion: 'sad' },
  { title: 'Dance', emotion: 'dance' },
  { title: 'Jackpot', emotion: 'jackpot' },
];

const EMOTION_RADIAL_ICONS: Record<string, LucideIcon> = {
  happy: Smile,
  wink: SmilePlus,
  surprised: Zap,
  angry: Flame,
  sad: Frown,
  dance: Trophy,
  jackpot: Trophy,
};

function CircularTimerRing({ size, timeLeft, maxTime }: { size: number; timeLeft: number; maxTime: number }) {
  const pad = 5;
  const total = size + pad * 2;
  const cx = total / 2;
  const strokeWidth = 3.5;
  const radius = cx - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, timeLeft / maxTime));
  const hue = progress * 120;
  const color = `hsl(${hue}, 90%, 52%)`;
  return (
    <svg aria-hidden style={{ position: 'absolute', top: -pad, left: -pad, width: total, height: total, pointerEvents: 'none', zIndex: 5, transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cx} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} />
      <circle cx={cx} cy={cx} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)}
        style={{ filter: `drop-shadow(0 0 4px ${color})`, transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }} />
    </svg>
  );
}

function useNowTick(enabled: boolean, intervalMs = 200) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
  return now;
}

function getCountdownSeconds(startedAt: string | null, maxSeconds: number, nowMs: number) {
  if (!startedAt) return maxSeconds;
  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs) || startMs <= 0) return maxSeconds;
  return Math.max(0, maxSeconds - (nowMs - startMs) / 1000);
}

type BlackjackMultiAvatarDockProps = {
  seats: [BJMultiSeatState | null, BJMultiSeatState | null, BJMultiSeatState | null];
  addressLower: string | undefined;
  phase: string;
  actingSeatPosition: number | null;
  turnStartedAt: string | null;
  bettingStartedAt: string | null;
  myPosition: number | null;
  onOpenProfile: (addr: string) => void;
  onLeaveSeat?: () => void;
  onToggleSoundPanel?: () => void;
  onSendChatMessage?: (msg: string) => void;
};

export function BlackjackMultiAvatarDock({
  seats,
  addressLower,
  phase,
  actingSeatPosition,
  turnStartedAt,
  bettingStartedAt,
  myPosition,
  onOpenProfile,
  onLeaveSeat,
  onToggleSoundPanel,
  onSendChatMessage,
}: BlackjackMultiAvatarDockProps) {
  const nowMs = useNowTick(phase === 'playing' || phase === 'betting', 200);
  const turnByPos = useMemo(() => {
    return POSITIONS.map((pos) =>
      getCountdownSeconds(actingSeatPosition === pos && phase === 'playing' ? turnStartedAt : null, TURN_TIMEOUT, nowMs)
    );
  }, [actingSeatPosition, phase, turnStartedAt, nowMs]);
  const betByPos = useMemo(() => {
    return POSITIONS.map((pos) =>
      getCountdownSeconds(phase === 'betting' && seats[pos]?.playerAddress ? bettingStartedAt : null, BETTING_TIMEOUT, nowMs)
    );
  }, [phase, seats, bettingStartedAt, nowMs]);

  const [localEmotion, setLocalEmotion] = useState<Emotion | null>(null);
  const localEmotionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myAvatarDockRef = useRef<HTMLDivElement | null>(null);
  const [playerRadialOpen, setPlayerRadialOpen] = useState(false);
  const [playerRadialPage, setPlayerRadialPage] = useState<'main' | 'expressions' | 'settings'>('main');
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const [quickChatPickerOpen, setQuickChatPickerOpen] = useState(false);
  const [editQuickChatOpen, setEditQuickChatOpen] = useState(false);
  const [overlayPhrase, setOverlayPhrase] = useState<string | null>(null);
  const phraseOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const [quickChatPhrases, setQuickChatPhrases] = useQuickChatPhrases('morb_blackjack_quickchat', DEFAULT_BLACKJACK_QUICKCHAT_PHRASES);

  const emotionRadialItems = useMemo(
    () =>
      AVATAR_ANIMATIONS.map(({ title, emotion }) => ({
        id: emotion,
        label: title,
        icon: EMOTION_RADIAL_ICONS[emotion] ?? Smile,
      })),
    [],
  );
  const emotionMenuWithBack = useMemo(
    (): RadialMenuItem[] => [{ id: '_back', label: 'Back', icon: ArrowLeft }, ...emotionRadialItems],
    [emotionRadialItems],
  );
  const playerMainMenuItems = useMemo((): RadialMenuItem[] => {
    const items: RadialMenuItem[] = [];
    items.push({ id: 'expressions', label: 'Moves', icon: Smile });
    items.push({ id: 'settings', label: 'Settings', icon: Settings2 });
    if (onLeaveSeat) items.push({ id: 'leave', label: 'Leave', icon: LogOut });
    return items;
  }, [onLeaveSeat]);
  const settingsMenuItems = useMemo((): RadialMenuItem[] => [
    { id: '_back', label: 'Back', icon: ArrowLeft },
    { id: 'theme', label: 'Theme', icon: Palette },
    { id: 'sounds', label: 'Sounds', icon: Volume2 },
    { id: 'edit_quickchat', label: 'QuickChat', icon: MessageCircle },
  ], []);

  useEffect(() => {
    setPlayerRadialOpen(false);
    setPlayerRadialPage('main');
    setQuickChatPickerOpen(false);
  }, [phase]);

  const handleAnimationSelect = useCallback((emotion: Emotion) => {
    setLocalEmotion(emotion);
    if (localEmotionTimerRef.current) clearTimeout(localEmotionTimerRef.current);
    localEmotionTimerRef.current = setTimeout(() => {
      setLocalEmotion(null);
    }, emotion === 'wink' ? AVATAR_EMOTION_WINK_MS : AVATAR_EMOTION_DURATION_MS);
  }, []);

  const handlePlayerRadialSelect = useCallback(
    (item: RadialMenuItem) => {
      const id = String(item.id);
      if (playerRadialPage === 'expressions') {
        if (id === '_back') { setPlayerRadialPage('main'); return; }
        handleAnimationSelect(item.id as Emotion);
        setPlayerRadialOpen(false);
        setPlayerRadialPage('main');
        return;
      }
      if (playerRadialPage === 'settings') {
        if (id === '_back') { setPlayerRadialPage('main'); return; }
        if (id === 'sounds') onToggleSoundPanel?.();
        else if (id === 'edit_quickchat') setEditQuickChatOpen(true);
        else if (id === 'theme') toast.info('Table theme picker coming soon');
        setPlayerRadialOpen(false);
        setPlayerRadialPage('main');
        return;
      }
      if (id === 'expressions') { setPlayerRadialPage('expressions'); return; }
      if (id === 'settings') { setPlayerRadialPage('settings'); return; }
      if (id === 'leave') onLeaveSeat?.();
      setPlayerRadialOpen(false);
      setPlayerRadialPage('main');
    },
    [playerRadialPage, handleAnimationSelect, onToggleSoundPanel, onLeaveSeat],
  );

  const handleQuickChatSelect = useCallback((phrase: string) => {
    setQuickChatPickerOpen(false);
    if (onSendChatMessage) {
      onSendChatMessage(phrase);
      return;
    }
    setOverlayPhrase(phrase);
    if (phraseOverlayTimeoutRef.current) clearTimeout(phraseOverlayTimeoutRef.current);
    phraseOverlayTimeoutRef.current = setTimeout(() => {
      setOverlayPhrase(null);
      phraseOverlayTimeoutRef.current = null;
    }, PHRASE_OVERLAY_DURATION_MS);
  }, [onSendChatMessage]);

  const hasMenuOpen = quickChatPickerOpen || playerRadialOpen;

  return (
    <>
      <div
        className="pointer-events-auto absolute bottom-0 left-0 z-[22] flex flex-row items-end gap-1.5 rounded-xl border border-cyan-500/30 px-2 py-1.5"
        style={{
          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.88), rgba(40, 40, 40, 0.72))',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.75), 0 4px 14px rgba(0,0,0,0.45)',
        }}
        aria-label="Players at table"
      >
        {POSITIONS.map((pos) => {
          const seat = seats[pos];
          const isEmpty = !seat?.playerAddress;
          const isMe = !!addressLower && !!seat?.playerAddress && seat.playerAddress.toLowerCase() === addressLower;
          const isActing = actingSeatPosition === pos && phase === 'playing';
          const canOpenProfile = !!seat?.playerAddress && !!addressLower && !isMe;
          const resultEmotion: Emotion = (() => {
            if (!seat?.result) return 'neutral';
            if (seat.result === 'blackjack') return 'jackpot';
            if (seat.result === 'win') return 'happy';
            if (seat.result === 'loss') return 'sad';
            if (seat.result === 'push') return 'surprised';
            return 'neutral';
          })();
          const activeEmotion: Emotion = (isMe && hasMenuOpen)
            ? 'neutral'
            : (isMe ? (localEmotion ?? (phase === 'completed' ? resultEmotion : 'neutral')) : (phase === 'completed' ? resultEmotion : 'neutral'));
          const turnRemaining = turnByPos[pos];
          const betRemaining = betByPos[pos];

          if (isEmpty) {
            return (
              <div
                key={pos}
                className="flex h-[50px] w-[50px] shrink-0 flex-col items-center justify-center rounded-full border border-dashed border-white/20 bg-black/25 text-[9px] font-semibold text-white/35"
                title={`Seat ${pos + 1} empty`}
              >
                S{pos + 1}
              </div>
            );
          }

          return (
            <div key={pos} className="relative flex shrink-0 flex-col items-center">
              <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1 w-max max-w-[min(220px,85vw)] -translate-x-1/2">
                <div ref={isMe ? menuContainerRef : undefined} className={`${isMe ? 'pointer-events-auto' : ''} w-max min-w-[120px]`}>
                  <AnimatePresence>
                    {isMe && quickChatPickerOpen && (
                      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }}>
                        <div
                          className="max-h-[min(260px,55vh)] min-w-[160px] max-w-[220px] overflow-y-auto overflow-x-hidden rounded-xl"
                          style={{ background: 'rgba(10,10,10,0.96)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
                        >
                          {quickChatPhrases.map((phrase) => (
                            <button key={phrase} type="button" onClick={() => handleQuickChatSelect(phrase)}
                              className="w-full truncate px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/10">{phrase}</button>
                          ))}
                          <button type="button" onClick={() => { setQuickChatPickerOpen(false); setEditQuickChatOpen(true); }}
                            className="flex w-full items-center justify-center gap-2 border-t border-white/10 px-3 py-2.5 text-center text-sm font-medium text-white/80 transition-colors hover:bg-white/10">
                            <span className="text-cyan-400">✎</span> Edit QuickChat
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
              <AnimatePresence>
                {isMe && overlayPhrase && (
                  <motion.div
                    className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-0.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/15 bg-black/90 px-2.5 py-1 text-[11px] font-medium text-white"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                  >
                    {overlayPhrase}
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="relative" style={{ width: DOCK_AVATAR_SIZE, height: DOCK_AVATAR_SIZE }}>
                {isActing && <CircularTimerRing size={DOCK_AVATAR_SIZE} timeLeft={turnRemaining} maxTime={TURN_TIMEOUT} />}
                {!isActing && phase === 'betting' && <CircularTimerRing size={DOCK_AVATAR_SIZE} timeLeft={betRemaining} maxTime={BETTING_TIMEOUT} />}
                <div
                  ref={isMe ? myAvatarDockRef : undefined}
                  className="h-full w-full overflow-hidden rounded-full bg-slate-800"
                  style={{
                    border: isMe ? '2px solid rgba(34,211,238,0.55)' : isActing ? '2px solid transparent' : '2px solid rgba(255,255,255,0.12)',
                    cursor: isMe || canOpenProfile ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (longPressTriggered.current) { longPressTriggered.current = false; return; }
                    if (isMe && playerMainMenuItems.length > 0) {
                      setPlayerRadialPage('main');
                      setPlayerRadialOpen(true);
                      return;
                    }
                    if (canOpenProfile && seat?.playerAddress) onOpenProfile(seat.playerAddress);
                  }}
                  onContextMenu={(e) => {
                    if (isMe && onSendChatMessage) {
                      e.preventDefault();
                      setPlayerRadialOpen(false);
                      setQuickChatPickerOpen(true);
                    }
                  }}
                  onTouchStart={() => {
                    if (!isMe || !onSendChatMessage) return;
                    longPressTriggered.current = false;
                    longPressTimerRef.current = setTimeout(() => {
                      longPressTriggered.current = true;
                      setPlayerRadialOpen(false);
                      setQuickChatPickerOpen(true);
                    }, 500);
                  }}
                  onTouchEnd={() => {
                    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
                  }}
                  onTouchMove={() => {
                    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
                  }}
                  title={isMe ? 'Tap for menu · Right-click for QuickChat' : canOpenProfile ? 'View profile' : undefined}
                >
                  {seat?.avatarConfig ? (
                    <AvatarView
                      config={seat.avatarConfig as unknown as AvatarConfig}
                      emotion={activeEmotion}
                      trackMouse={isMe}
                      roamEyes={!isMe && !isActing}
                      forceAsleep={seat?.seatStatus === 'sitting_out'}
                      compact
                      className="h-full w-full"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-slate-400">
                      {seat?.displayName?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                </div>
              </div>
              <span className="mt-0.5 max-w-[52px] truncate text-center text-[8px] font-semibold leading-tight text-white/70">
                {seat?.displayName?.slice(0, 8) ?? (seat?.playerAddress ? `${seat.playerAddress.slice(0, 4)}…` : '')}
              </span>
            </div>
          );
        })}
      </div>

      {myPosition !== null && playerMainMenuItems.length > 0 && (
        <RadialMenuFloating
          open={playerRadialOpen}
          onOpenChange={(o) => {
            setPlayerRadialOpen(o);
            if (!o) setPlayerRadialPage('main');
          }}
          anchorRef={myAvatarDockRef}
          menuItems={playerRadialPage === 'main' ? playerMainMenuItems : playerRadialPage === 'expressions' ? emotionMenuWithBack : settingsMenuItems}
          onSelect={handlePlayerRadialSelect}
          size={playerRadialPage === 'expressions' ? 220 : playerRadialPage === 'settings' ? 240 : 260}
          iconSize={playerRadialPage === 'expressions' ? 13 : 16}
          bandWidth={playerRadialPage === 'expressions' ? 38 : 44}
          showLabels
        />
      )}

      <AnimatePresence>
        {quickChatPickerOpen && myPosition !== null && (
          <motion.div
            className="fixed inset-0 z-[45]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setQuickChatPickerOpen(false)}
            aria-hidden
          />
        )}
      </AnimatePresence>

      <EditQuickChatModal open={editQuickChatOpen} onClose={() => setEditQuickChatOpen(false)} selectedPhrases={quickChatPhrases} onSave={setQuickChatPhrases} />
    </>
  );
}

