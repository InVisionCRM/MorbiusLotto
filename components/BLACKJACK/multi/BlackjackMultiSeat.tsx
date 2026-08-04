'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatEther } from 'viem';
import { ArrowLeft, LogOut, MessageCircle, Palette, Settings2, Smile, SmilePlus, Trophy, UserPlus, Volume2, Zap, Flame, Frown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import PlayingCard from '@/components/BLACKJACK/PlayingCard';
import { useBlackjackTableLayout } from '@/components/BLACKJACK/BlackjackTableLayoutContext';
import { BetChip, formatChipLabel } from '@/components/ui/BetChip';
import { AvatarView, type Emotion } from '@/components/avatar';
import { VipAvatarBadge } from '@/components/vip/VipTierBadge';
import { RadialMenuFloating, type RadialMenuItem } from '@/components/ui/radial-menu';
import { useQuickChatPhrases } from '@/hooks/useQuickChatPhrases';
import { EditQuickChatModal } from '@/components/poker/EditQuickChatModal';
import { DEFAULT_BLACKJACK_QUICKCHAT_PHRASES } from '@/components/poker/quickchat-phrases';
import type { BJMultiHandObj, BJMultiSeatState, AvatarConfig } from '@/lib/websocket-client';
import type { CardValue, Suit } from '@/app/BLACKJACK/types';

// ── Constants ────────────────────────────────────────────────────────────────

const AVATAR_SIZE = 44;
const TURN_TIMEOUT = 30;
const BETTING_TIMEOUT = 15;
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
  happy: Smile, wink: SmilePlus, surprised: Zap, angry: Flame, sad: Frown, dance: Trophy, jackpot: Trophy,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

type SeatResultSummary = 'win' | 'loss' | 'push' | 'mixed' | 'none';

function indexToCard(idx: number) {
  const rank = (idx % 13) + 1;
  const suitIdx = Math.floor(idx / 13);
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  return { value: rank as CardValue, suit: suits[suitIdx] };
}

function formatMorbius(wei: string): string {
  try {
    const n = Number(formatEther(BigInt(wei)));
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  } catch { return '0'; }
}

function seatTableBetWei(seat: BJMultiSeatState): bigint {
  try {
    const pb = BigInt(seat.pendingBet || '0');
    if (pb > 0n) return pb;
    if (seat.hands?.length) return seat.hands.reduce((a, h) => a + BigInt(h.betAmount || '0'), 0n);
    return BigInt(seat.betAmount || '0');
  } catch { return 0n; }
}

function summarizeSeatHands(hands: BJMultiHandObj[]): SeatResultSummary {
  if (!hands.length) return 'none';
  const hasWin = hands.some((h) => h.result === 'win' || h.result === 'blackjack');
  const hasLoss = hands.some((h) => h.result === 'loss');
  const hasPush = hands.some((h) => h.result === 'push');
  if (hasWin && !hasLoss && !hasPush) return 'win';
  if (!hasWin && hasLoss && !hasPush) return 'loss';
  if (!hasWin && !hasLoss && hasPush) return 'push';
  return 'mixed';
}

function seatOutcomeLabelFromSummary(summary: SeatResultSummary, payoutWei: string) {
  if (summary === 'win') return { text: `WON +${formatMorbius(payoutWei || '0')}`, cls: 'text-emerald-300' };
  if (summary === 'loss') return { text: 'LOST', cls: 'text-red-300' };
  if (summary === 'push') return { text: 'PUSH', cls: 'text-yellow-300' };
  if (summary === 'mixed') return { text: 'MIXED', cls: 'text-cyan-200' };
  return null;
}

function getCountdownSeconds(startedAt: string | null, maxSeconds: number, nowMs: number) {
  if (!startedAt) return maxSeconds;
  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs) || startMs <= 0) return maxSeconds;
  return Math.max(0, maxSeconds - (nowMs - startMs) / 1000);
}

// ── Timer ring ───────────────────────────────────────────────────────────────

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

// ── Types ────────────────────────────────────────────────────────────────────

export type BlackjackMultiSeatProps = {
  seat: BJMultiSeatState | null;
  position: number;
  /** Rotation angle in degrees for the whole seat (positive = clockwise). */
  angle: number;
  isMe: boolean;
  isEmpty: boolean;
  isActing: boolean;
  phase: string;
  onTakeSeat: () => void;
  canTakeSeat: boolean;
  afkTimeoutsBeforeKick: number;
  balanceLabel?: string | null;
  onOpenProfile?: (address: string) => void;
  showOutcomeLabel?: boolean;
  turnStartedAt?: string | null;
  bettingStartedAt?: string | null;
  onLeaveSeat?: () => void;
  onToggleSoundPanel?: () => void;
  onSendChatMessage?: (msg: string) => void;
  /** Directed-emote reaction broadcast to the table (shows on any seat, incl. mine when targeted). */
  broadcastEmotion?: Emotion;
  /** Round clear: match single-player card fly-out */
  cardsExiting?: boolean;
  /** Key `${position}-${handIndex}` → card indices that just arrived (deal-in) */
  newPlayerCardByHandKey?: Record<string, Set<number>>;
};

// ── Component ────────────────────────────────────────────────────────────────

export function BlackjackMultiSeat({
  seat,
  position,
  angle,
  isMe,
  isEmpty,
  isActing,
  phase,
  onTakeSeat,
  canTakeSeat,
  afkTimeoutsBeforeKick,
  balanceLabel,
  onOpenProfile,
  showOutcomeLabel,
  turnStartedAt,
  bettingStartedAt,
  onLeaveSeat,
  onToggleSoundPanel,
  onSendChatMessage,
  broadcastEmotion,
  cardsExiting = false,
  newPlayerCardByHandKey,
}: BlackjackMultiSeatProps) {
  const cardClearStaggerMs = useBlackjackTableLayout().motion.clearOut.playerStaggerMs;
  const canOpenProfile = !!seat?.playerAddress && !!onOpenProfile && !isMe;
  const seatOutcomeLabel = seat
    ? seatOutcomeLabelFromSummary(summarizeSeatHands(seat.hands), seat.payout || '0')
    : null;

  // ── Avatar interactive state (only used for my seat) ──
  const avatarRef = useRef<HTMLDivElement | null>(null);
  const [localEmotion, setLocalEmotion] = useState<Emotion | null>(null);
  const localEmotionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playerRadialOpen, setPlayerRadialOpen] = useState(false);
  const [playerRadialPage, setPlayerRadialPage] = useState<'main' | 'expressions' | 'settings'>('main');
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const [quickChatPickerOpen, setQuickChatPickerOpen] = useState(false);
  const [editQuickChatOpen, setEditQuickChatOpen] = useState(false);
  const [overlayPhrase, setOverlayPhrase] = useState<string | null>(null);
  const phraseOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [quickChatPhrases, setQuickChatPhrases] = useQuickChatPhrases('morb_blackjack_quickchat', DEFAULT_BLACKJACK_QUICKCHAT_PHRASES);

  // Timer countdown
  const [nowMs, setNowMs] = useState(() => Date.now());
  const timerActive = phase === 'playing' || phase === 'betting';
  useEffect(() => {
    if (!timerActive) return;
    const id = setInterval(() => setNowMs(Date.now()), 200);
    return () => clearInterval(id);
  }, [timerActive]);
  const turnRemaining = getCountdownSeconds(isActing ? (turnStartedAt ?? null) : null, TURN_TIMEOUT, nowMs);
  const betRemaining = getCountdownSeconds(phase === 'betting' ? (bettingStartedAt ?? null) : null, BETTING_TIMEOUT, nowMs);

  // Avatar emotion
  const resultEmotion: Emotion = (() => {
    if (!seat?.result) return 'neutral';
    if (seat.result === 'blackjack') return 'jackpot';
    if (seat.result === 'win') return 'happy';
    if (seat.result === 'loss') return 'sad';
    if (seat.result === 'push') return 'surprised';
    return 'neutral';
  })();
  const hasMenuOpen = quickChatPickerOpen || playerRadialOpen;
  const activeEmotion: Emotion = (isMe && hasMenuOpen)
    ? 'neutral'
    : isMe
      ? (localEmotion ?? broadcastEmotion ?? (phase === 'completed' ? resultEmotion : 'neutral'))
      : (broadcastEmotion ?? (phase === 'completed' ? resultEmotion : 'neutral'));

  useEffect(() => { setPlayerRadialOpen(false); setPlayerRadialPage('main'); setQuickChatPickerOpen(false); }, [phase]);

  const emotionRadialItems = useMemo(() =>
    AVATAR_ANIMATIONS.map(({ title, emotion }) => ({
      id: emotion, label: title, icon: EMOTION_RADIAL_ICONS[emotion] ?? Smile,
    })), []);
  const emotionMenuWithBack = useMemo((): RadialMenuItem[] => [{ id: '_back', label: 'Back', icon: ArrowLeft }, ...emotionRadialItems], [emotionRadialItems]);
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

  const handleAnimationSelect = useCallback((emotion: Emotion) => {
    setLocalEmotion(emotion);
    if (localEmotionTimerRef.current) clearTimeout(localEmotionTimerRef.current);
    localEmotionTimerRef.current = setTimeout(() => setLocalEmotion(null), emotion === 'wink' ? AVATAR_EMOTION_WINK_MS : AVATAR_EMOTION_DURATION_MS);
  }, []);

  const handlePlayerRadialSelect = useCallback((item: RadialMenuItem) => {
    const id = String(item.id);
    if (playerRadialPage === 'expressions') {
      if (id === '_back') { setPlayerRadialPage('main'); return; }
      handleAnimationSelect(item.id as Emotion);
      setPlayerRadialOpen(false); setPlayerRadialPage('main'); return;
    }
    if (playerRadialPage === 'settings') {
      if (id === '_back') { setPlayerRadialPage('main'); return; }
      if (id === 'sounds') onToggleSoundPanel?.();
      else if (id === 'edit_quickchat') setEditQuickChatOpen(true);
      else if (id === 'theme') toast.info('Table theme picker coming soon');
      setPlayerRadialOpen(false); setPlayerRadialPage('main'); return;
    }
    if (id === 'expressions') { setPlayerRadialPage('expressions'); return; }
    if (id === 'settings') { setPlayerRadialPage('settings'); return; }
    if (id === 'leave') onLeaveSeat?.();
    setPlayerRadialOpen(false); setPlayerRadialPage('main');
  }, [playerRadialPage, handleAnimationSelect, onToggleSoundPanel, onLeaveSeat]);

  const handleQuickChatSelect = useCallback((phrase: string) => {
    setQuickChatPickerOpen(false);
    if (onSendChatMessage) { onSendChatMessage(phrase); return; }
    setOverlayPhrase(phrase);
    if (phraseOverlayTimeoutRef.current) clearTimeout(phraseOverlayTimeoutRef.current);
    phraseOverlayTimeoutRef.current = setTimeout(() => { setOverlayPhrase(null); phraseOverlayTimeoutRef.current = null; }, PHRASE_OVERLAY_DURATION_MS);
  }, [onSendChatMessage]);

  // ── Render ────────────────────────────────────────────────────────────────
  //
  // Layout: single column flex, anchored by bottom-center.
  // The outer wrapper is positioned by BlackjackMultiSeatGrid via
  // { left: cx, bottom: floorY, transform: 'translateX(-50%)' }.
  // Everything inside stacks top-to-bottom: avatar → cards → tag.
  // The whole column rotates together via `angle`; name tag counter-rotates
  // so text stays upright.

  const hasSeatData = !isEmpty && seat;
  const totalBetWei = hasSeatData ? seatTableBetWei(seat) : 0n;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        transform: `rotate(${angle}deg)`,
        transformOrigin: 'bottom center',
        pointerEvents: 'auto',
      }}
    >
      {/* ── Empty seat ── */}
      {isEmpty && (
        <div
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 transition-all ${
            canTakeSeat
              ? 'cursor-pointer border-cyan-400/70 bg-cyan-900/20 shadow-[0_0_15px_rgba(6,182,212,0.15)] hover:scale-105 hover:border-cyan-300 hover:bg-cyan-800/30'
              : 'border-white/25 bg-white/[0.03]'
          }`}
          style={{ minWidth: 80 }}
          onClick={canTakeSeat ? onTakeSeat : undefined}
        >
          {canTakeSeat ? (
            <>
              <UserPlus className="h-8 w-8 text-cyan-400/80" />
              <span className="text-xs font-semibold tracking-wide text-cyan-400/80">Seat {position + 1}</span>
            </>
          ) : (
            <span className="text-xs font-medium text-white/35">Seat {position + 1}</span>
          )}
        </div>
      )}

      {/* ── Occupied seat ── */}
      {hasSeatData && (
        <>
          {/* Cards area */}
          <div style={{ position: 'relative' }}>
            {/* Acting glow behind cards */}
            {isActing && (
              <div
                className="pointer-events-none absolute inset-0 -m-3 rounded-xl border border-cyan-400/60 bg-cyan-900/10 shadow-[0_0_16px_rgba(34,211,238,0.22),inset_0_0_10px_rgba(34,211,238,0.08)]"
                aria-hidden
              />
            )}

            {seat.hands.length > 0 ? (
              <div className={`flex justify-center items-start ${seat.hands.length > 1 ? 'flex-row gap-2' : 'flex-col items-center gap-1'}`}>
                {seat.hands.map((hand, hi) => {
                  const hasSplit = seat.hands.length > 1;
                  const isActiveHand = hasSplit && isActing && seat.activeHandIndex === hi;
                  const isCompletedHand = hasSplit && isActing && (hand.isBust || hi < seat.activeHandIndex);
                  return (
                    <div
                      key={hi}
                      className={`flex flex-col items-center gap-1 ${hasSplit ? 'rounded-md px-1.5 py-1 transition-all duration-300' : ''}`}
                      style={hasSplit ? {
                        background: isActiveHand ? 'linear-gradient(145deg, rgba(6, 182, 212, 0.15), rgba(6, 182, 212, 0.05))' : isCompletedHand ? 'linear-gradient(145deg, rgba(100, 100, 100, 0.1), rgba(50, 50, 50, 0.05))' : 'transparent',
                        border: isActiveHand ? '2px solid rgba(6, 182, 212, 0.5)' : isCompletedHand ? '1px solid rgba(100, 100, 100, 0.3)' : '1px solid rgba(60, 60, 60, 0.35)',
                        boxShadow: isActiveHand ? '0 0 16px rgba(6, 182, 212, 0.28), inset 0 0 8px rgba(6, 182, 212, 0.08)' : 'none',
                        opacity: isCompletedHand ? 0.72 : 1,
                        transform: isActiveHand ? 'scale(1.02)' : 'scale(1)',
                      } : undefined}
                    >
                      {hasSplit && (
                        <div className="mb-0 flex items-center gap-1">
                          <span className={`text-[9px] font-bold uppercase tracking-wider ${isActiveHand ? 'text-cyan-400' : 'text-white/45'}`}>Hand {hi + 1}</span>
                          {isActiveHand && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" aria-hidden />}
                        </div>
                      )}

                      {/* Score badge — sits above the cards, inside the card group */}
                      {hand.cards.length > 0 && (
                        <div className={`flex items-center gap-2 ${showOutcomeLabel && (hand.result === 'win' || hand.result === 'blackjack') ? 'card-counter-winner' : ''}`}>
                          <div className={`glass-counter relative flex h-10 w-10 items-center justify-center rounded-full transition-[background,box-shadow,border-color] duration-300 ${isActing && seat.activeHandIndex === hi ? 'card-counter-active' : ''}`}>
                            <span className={`font-black relative z-10 transition-colors duration-500 ${hand.isBust ? 'text-red-400' : hand.isBlackjack ? 'text-yellow-400' : showOutcomeLabel && (hand.result === 'win' || hand.result === 'blackjack') ? 'text-emerald-400' : isActiveHand ? 'text-white/90' : hasSplit ? 'text-white/50' : 'text-white/90'} ${hand.hasAce && !hand.isBlackjack && !hand.isBust && hand.total <= 21 ? 'text-sm' : 'text-xl'}`}>
                              {hand.hasAce && !hand.isBlackjack && !hand.isBust && hand.total <= 21
                                ? <>{hand.total - 10}<span className="text-white/40">/</span>{hand.total}</>
                                : hand.total}
                            </span>
                          </div>
                          {hand.isBlackjack && <span className="text-sm font-black text-yellow-400">BJ!</span>}
                          {hand.isBust && <span className="text-sm font-black text-red-400">BUST</span>}
                        </div>
                      )}

                      {/* Card fan */}
                      <div className="relative flex bj-hand-player">
                        {hand.cards.map((c, ci) => {
                          const nk = newPlayerCardByHandKey?.[`${position}-${hi}`];
                          const isNewCard = nk ? nk.has(ci) : false;
                          return (
                            <div key={ci} className={ci > 0 ? 'card-overlap-player' : ''} style={{ zIndex: ci }}>
                              <PlayingCard
                                card={indexToCard(c)}
                                owner="player"
                                className=""
                                size="small"
                                index={ci}
                                isNewCard={isNewCard}
                                exiting={cardsExiting}
                                exitDelay={(ci * cardClearStaggerMs) / 1000}
                              />
                            </div>
                          );
                        })}

                        {/* Bet chip — single hand only; overlaps top-right corner of card fan */}
                        {!hasSplit && totalBetWei > 0n && hand.cards.length >= 2 && (
                          <div style={{ position: 'absolute', top: -14, right: -14, zIndex: 20 }}>
                            <BetChip label={formatChipLabel(Math.floor(Number(formatEther(totalBetWei))))} size="clamp(32px, 6vw, 40px)" chipSrc="/morbius/MorbiusChip.png" />
                          </div>
                        )}
                      </div>

                      {hasSplit && phase !== 'betting' && BigInt(hand.betAmount || '0') > 0n && (
                        <span className="mt-0.5 text-[10px] font-bold text-white/70" style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>
                          {formatMorbius(hand.betAmount)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* No cards yet — placeholder dots during betting/waiting */
              phase === 'waiting' || phase === 'betting' ? (
                <div className="flex items-center justify-center gap-1" style={{ minHeight: 56 }}>
                  <div className="h-2.5 w-2.5 rounded-full border border-dashed border-white/20 bg-white/[0.02]" />
                  <div className="h-2.5 w-2.5 rounded-full border border-dashed border-white/20 bg-white/[0.02]" />
                </div>
              ) : (
                <div style={{ minHeight: 56 }} />
              )
            )}

            {/* Split hand bet chip — floats below the split cards */}
            {seat.hands.length > 1 && totalBetWei > 0n && (
              <div className="flex justify-center" style={{ marginTop: 4 }}>
                <BetChip label={formatChipLabel(Math.floor(Number(formatEther(totalBetWei))))} size="clamp(44px, 8vw, 56px)" chipSrc="/morbius/MorbiusChip.png" />
              </div>
            )}
          </div>

          {/* Name tag — always the bottom of the stack, anchors the seat.
              Avatar is an absolute overlay on the right side of the tag. */}
          <div
            style={{
              position: 'relative',
              // Counter-rotate so text stays upright regardless of seat angle
              transform: `rotate(${-angle}deg)`,
              transformOrigin: 'center center',
            }}
          >
            {/* Tag body — right padding makes room for the avatar circle */}
            <div
              className={`w-[140px] rounded-md border border-cyan-500/25 py-1 pl-2 pr-[44px] ${canOpenProfile ? 'cursor-pointer' : ''}`}
              style={{
                background: 'rgba(0, 0, 0, 0.9)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.5)',
              }}
              onClick={() => { if (canOpenProfile && seat?.playerAddress) onOpenProfile(seat.playerAddress); }}
              onKeyDown={(e) => { if (canOpenProfile && (e.key === 'Enter' || e.key === ' ') && seat?.playerAddress) { e.preventDefault(); onOpenProfile(seat.playerAddress); } }}
              role={canOpenProfile ? 'button' : undefined}
              tabIndex={canOpenProfile ? 0 : undefined}
            >
              <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-white/95">
                {seat?.displayName ?? (seat?.playerAddress ? `${seat.playerAddress.slice(0, 6)}…` : '—')}
                {isMe && <span className="ml-1 text-[9px] text-cyan-200/90">(you)</span>}
              </span>
              {balanceLabel != null && <span className="mt-0.5 block text-[10px] tabular-nums text-white/85">{balanceLabel}</span>}
              {(seat.consecutiveTimeouts ?? 0) > 0 && (
                <span
                  className={`mt-0.5 inline-block max-w-full rounded px-1 py-0.5 text-[8px] font-semibold leading-tight ${(seat.consecutiveTimeouts ?? 0) >= afkTimeoutsBeforeKick - 1 ? 'border border-orange-500/40 bg-orange-950/60 text-orange-100/95' : 'border border-cyan-500/25 bg-slate-900/80 text-cyan-100/90'}`}
                  title="Missed betting or turn timeouts. At 3 you are removed and chips refunded."
                >
                  {(seat.consecutiveTimeouts ?? 0)}/{afkTimeoutsBeforeKick} idle{isMe ? ' — act' : ''}
                </span>
              )}
              {showOutcomeLabel && seatOutcomeLabel && (
                <div className={`mt-0.5 text-[10px] font-bold leading-tight ${seatOutcomeLabel.cls}`}>{seatOutcomeLabel.text}</div>
              )}
              {seat.seatStatus === 'sitting_out' && <span className="text-[9px] text-white/30">sitting out</span>}
            </div>

            {/* Avatar — absolute overlay, right side of tag, -4px outside the border */}
            <div
              style={{
                position: 'absolute',
                right: -4,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 10,
              }}
            >
              {/* QuickChat phrase overlay */}
              <AnimatePresence>
                {isMe && overlayPhrase && (
                  <motion.div
                    className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-0.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/15 bg-black/90 px-2.5 py-1 text-[11px] font-medium text-white"
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                  >
                    {overlayPhrase}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* QuickChat picker */}
              {isMe && quickChatPickerOpen && (
                <div className="absolute bottom-full left-1/2 z-50 mb-1 -translate-x-1/2">
                  <div
                    className="max-h-[min(260px,55vh)] min-w-[160px] max-w-[220px] overflow-y-auto overflow-x-hidden rounded-xl"
                    style={{ background: 'rgba(10,10,10,0.96)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 4px 20px rgba(0,0,0,0.6)' }}
                  >
                    {quickChatPhrases.map((phrase) => (
                      <button key={phrase} type="button" onClick={() => handleQuickChatSelect(phrase)}
                        className="w-full truncate px-3 py-2 text-left text-sm text-white/80 transition-colors hover:bg-white/10">{phrase}</button>
                    ))}
                    <button type="button" onClick={() => { setQuickChatPickerOpen(false); setEditQuickChatOpen(true); }}
                      className="flex w-full items-center justify-center gap-2 border-t border-white/10 px-3 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10">
                      <span className="text-cyan-400">✎</span> Edit QuickChat
                    </button>
                  </div>
                </div>
              )}

              <div className="relative" style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}>
                {isActing && <CircularTimerRing size={AVATAR_SIZE} timeLeft={turnRemaining} maxTime={TURN_TIMEOUT} />}
                {!isActing && phase === 'betting' && <CircularTimerRing size={AVATAR_SIZE} timeLeft={betRemaining} maxTime={BETTING_TIMEOUT} />}
                <div
                  ref={avatarRef}
                  className="h-full w-full overflow-hidden rounded-full bg-slate-800"
                  style={{
                    border: isMe ? '2px solid rgba(34,211,238,0.55)' : isActing ? '2px solid transparent' : '2px solid rgba(255,255,255,0.12)',
                    cursor: isMe || canOpenProfile ? 'pointer' : 'default',
                  }}
                  onClick={() => {
                    if (longPressTriggered.current) { longPressTriggered.current = false; return; }
                    if (isMe && playerMainMenuItems.length > 0) { setPlayerRadialPage('main'); setPlayerRadialOpen(true); return; }
                    if (canOpenProfile && seat?.playerAddress) onOpenProfile(seat.playerAddress);
                  }}
                  onContextMenu={(e) => { if (isMe && onSendChatMessage) { e.preventDefault(); setPlayerRadialOpen(false); setQuickChatPickerOpen(true); } }}
                  onTouchStart={() => {
                    if (!isMe || !onSendChatMessage) return;
                    longPressTriggered.current = false;
                    longPressTimerRef.current = setTimeout(() => { longPressTriggered.current = true; setPlayerRadialOpen(false); setQuickChatPickerOpen(true); }, 500);
                  }}
                  onTouchEnd={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                  onTouchMove={() => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } }}
                >
                  {seat?.profileDisplayMode === 'photo' && seat?.profileImageUrl ? (
                    <img
                      src={seat.profileImageUrl}
                      alt={seat.displayName ?? 'Player'}
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  ) : seat?.avatarConfig ? (
                    <AvatarView
                      config={seat.avatarConfig as unknown as AvatarConfig}
                      emotion={activeEmotion}
                      trackMouse={isMe}
                      roamEyes={!isMe && !isActing}
                      forceAsleep={seat?.seatStatus === 'sitting_out'}
                      compact
                      className="h-full w-full"
                    />
                  ) : seat?.profileImageUrl ? (
                    <img
                      src={seat.profileImageUrl}
                      alt={seat.displayName ?? 'Player'}
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-slate-400">
                      {seat?.displayName?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                </div>
                {seat?.playerAddress && <VipAvatarBadge address={seat.playerAddress} />}
              </div>

              {/* Radial menu (my seat only) */}
              {isMe && playerMainMenuItems.length > 0 && (
                <RadialMenuFloating
                  open={playerRadialOpen}
                  onOpenChange={(o) => { setPlayerRadialOpen(o); if (!o) setPlayerRadialPage('main'); }}
                  anchorRef={avatarRef}
                  menuItems={playerRadialPage === 'main' ? playerMainMenuItems : playerRadialPage === 'expressions' ? emotionMenuWithBack : settingsMenuItems}
                  onSelect={handlePlayerRadialSelect}
                  size={playerRadialPage === 'expressions' ? 220 : playerRadialPage === 'settings' ? 240 : 260}
                  iconSize={playerRadialPage === 'expressions' ? 13 : 16}
                  bandWidth={playerRadialPage === 'expressions' ? 38 : 44}
                  showLabels
                />
              )}
              {isMe && <EditQuickChatModal open={editQuickChatOpen} onClose={() => setEditQuickChatOpen(false)} selectedPhrases={quickChatPhrases} onSave={setQuickChatPhrases} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
