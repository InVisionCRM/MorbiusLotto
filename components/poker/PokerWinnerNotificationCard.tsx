'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { CardDisplay } from './CardDisplay';

const SHOWDOWN_DURATION_S = 15;

/** Keyframe names must match `app/globals.css` (for `animationend` filtering). */
const ANIM_IN_NAME = 'poker-winner-shockwave-in';
const ANIM_OUT_NAME = 'poker-winner-slide-down-out';

export interface PokerWinnerNotificationCardProps {
  isOpen: boolean;
  handId?: string | null;
  winnerName: string;
  winnerAmount: string;
  winnerHandName?: string;
  winnerAddress?: string;
  winnerAvatarUrl?: string | null;
  winnerHoleCards?: number[];
  communityCards?: number[];
  winningCardIndices?: number[];
  splitLabel?: string;
  splitAmount?: string;
  formatChips: (wei: string | number) => string;
}

type PanelMode = 'in' | 'idle' | 'out';

function WinnerPanelFrame({
  active,
  onExitComplete,
  children,
  boxStyle,
}: {
  active: boolean;
  onExitComplete: () => void;
  children: ReactNode;
  boxStyle: CSSProperties;
}) {
  const [mode, setMode] = useState<PanelMode>('in');
  const modeRef = useRef<PanelMode>(mode);
  modeRef.current = mode;

  useEffect(() => {
    if (active) setMode('in');
    else setMode('out');
  }, [active]);

  const onAnimEnd = useCallback(
    (e: React.AnimationEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      const name = e.animationName;
      if (name === ANIM_IN_NAME) {
        setMode((m) => (m === 'in' ? 'idle' : m));
        return;
      }
      if (name === ANIM_OUT_NAME && modeRef.current === 'out') {
        onExitComplete();
      }
    },
    [onExitComplete],
  );

  const animClass =
    mode === 'in' ? 'poker-winner-anim-in-shockwave' : mode === 'out' ? 'poker-winner-anim-out-slide-down' : '';

  return (
    <div
      className={`relative rounded-2xl overflow-hidden ${animClass}`}
      style={boxStyle}
      onAnimationEnd={onAnimEnd}
    >
      {children}
    </div>
  );
}

export function PokerWinnerNotificationCard({
  isOpen,
  handId,
  winnerName,
  winnerAmount,
  winnerHandName,
  winnerHoleCards = [],
  communityCards = [],
  winningCardIndices: _winningCardIndices = [],
  splitLabel,
  splitAmount,
  formatChips,
}: PokerWinnerNotificationCardProps) {
  const hole = [winnerHoleCards[0] ?? null, winnerHoleCards[1] ?? null];
  const board = Array.from({ length: 5 }, (_, i) => communityCards[i] ?? null);

  const [mounted, setMounted] = useState(isOpen);
  const [shellKey, setShellKey] = useState(0);
  /** Local override: once the countdown hits 0 we self-dismiss even if the parent's `isOpen` is still true. */
  const [expired, setExpired] = useState(false);
  const prevIsOpenRef = useRef(isOpen);
  const prevHandIdRef = useRef<string | null | undefined>(handId);

  const [countdown, setCountdown] = useState(SHOWDOWN_DURATION_S);

  useLayoutEffect(() => {
    if (isOpen) {
      setMounted(true);
      const wasOpen = prevIsOpenRef.current;
      const prevHand = prevHandIdRef.current;
      const handChanged = prevHand !== undefined && prevHand !== handId;
      if (!wasOpen || handChanged) {
        setShellKey((k) => k + 1);
        setExpired(false);
      }
      prevIsOpenRef.current = true;
      prevHandIdRef.current = handId;
    } else {
      prevIsOpenRef.current = false;
    }
  }, [isOpen, handId]);

  const activeForPanel = isOpen && !expired;

  const handleExitDone = useCallback(() => {
    setMounted(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setCountdown(SHOWDOWN_DURATION_S);
      return;
    }
    setCountdown(SHOWDOWN_DURATION_S);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, shellKey]);

  const boxStyle: CSSProperties = {
    background: '#000000',
    boxShadow:
      'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5), 0 14px 34px rgba(0, 0, 0, 0.5)',
    border: '1px inset rgba(60, 60, 60, 0.5)',
    width: 'min(40vw, 380px)',
    maxHeight: '80vh',
  };

  if (!mounted) return null;

  return (
    <div
      data-testid="poker-winner-banner"
      data-card="poker-winner-notification-card"
      className="fixed inset-0 z-[120] pointer-events-none flex items-center justify-center px-2 sm:px-4"
    >
      <WinnerPanelFrame key={shellKey} active={activeForPanel} onExitComplete={handleExitDone} boxStyle={boxStyle}>
        <div className="relative z-[1] flex flex-col overflow-y-auto font-jost-normal" style={{ maxHeight: '70vh' }}>

          {/* ── Top: 3-column header (Amount | Winner | Hand Rank) ── */}
          <div className="flex items-stretch" style={{ minHeight: '60%' }}>

            {/* Left column — Amount won */}
            <div className="flex-1 flex flex-col items-center justify-start pt-4 p-2 sm:p-3 min-w-0">
              <div className="font-jost text-[12px] text-white uppercase tracking-wider mb-5">Won</div>
              <div className="flex-1 flex items-center justify-center gap-1.5 min-w-0">
                <img
                  src="/morbius/MorbiusLogo%20(3).png"
                  alt=""
                  aria-hidden
                  className="flex-none"
                  style={{ height: '1em', width: 'auto' }}
                />
                <div className="font-jost text-white leading-tight tabular-nums truncate" style={{ fontSize: 'clamp(10px, 2.2vw, 20px)', letterSpacing: '-0.01em' }}>
                  +{formatChips(winnerAmount)}
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px self-stretch" style={{ background: 'rgba(34, 211, 238, 0.5)' }} />

            {/* Center column — Winner + name */}
            <div className="flex-[1.3] flex flex-col items-center justify-start pt-4 p-2 sm:p-3 min-w-0">
              <span className="font-jost text-[12px] uppercase tracking-[0.2em] text-white mb-5">
                WINNER
              </span>
              <div className="flex-1 flex items-center justify-center">
                <h3 className="font-jost text-cyan-500 text-[clamp(13px,2vw,18px)] leading-tight tracking-[-0.01em] truncate max-w-full text-center">
                  {winnerName}
                </h3>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px self-stretch" style={{ background: 'rgba(34, 211, 238, 0.35)' }} />

            {/* Right column — Hand Rank */}
            <div className="flex-1 flex flex-col items-center justify-start pt-4 p-2 sm:p-3 min-w-0">
              <div className="font-jost text-[12px] text-white uppercase text-wrap tracking-wider mb-5">Hand</div>
              <div className="flex-1 flex items-center justify-center">
                <div className="font-jost text-cyan-500 text-[clamp(13px,2vw,18px)] leading-tight text-center break-words max-w-full">
                  {winnerHandName || '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Horizontal divider */}
          <div className="h-px w-full" style={{ background: 'rgba(34, 211, 238, 0.33)' }} />

          {/* ── Bottom: Cards + countdown ── */}
          <div className="flex flex-col p-2 sm:p-3 gap-2">

            {/* Cards: hole + community */}
            <div className="rounded-sm bg-black/50 border border-cyan-500/30 px-2 py-3 sm:px-2 sm:py-2 flex flex-col gap-6 min-h-[8rem] sm:min-h-[8rem]">
              <div className="flex items-center justify-center gap-3 mt-3">
                {hole.map((cardIndex, i) => (
                  <div key={`winner-hole-${i}`} className="flex-none">
                    <CardDisplay cardIndex={cardIndex} small />
                  </div>
                ))}
              </div>

              <div className="flex flex-1 items-center justify-center gap-3 overflow-visible py-2 min-h-[6.5rem] sm:min-h-[6.5rem]">
                {board.map((cardIndex, i) => (
                  <CardDisplay key={`winner-board-${i}-${cardIndex ?? 'empty'}`} cardIndex={cardIndex} small />
                ))}
              </div>
            </div>

            {/* Split pot */}
            {splitLabel && splitAmount && (
              <div className="rounded-lg bg-black/50 border border-cyan-500/30 px-2.5 py-1">
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="font-jost-normal text-[12px] text-white truncate">{splitLabel}</span>
                  <span className="font-jost text-[12px] tabular-nums text-cyan-500 shrink-0">{splitAmount}</span>
                </div>
              </div>
            )}

            {/* Countdown timer */}
            <div className="flex flex-col items-center gap-0.5">
              <span className="font-jost-normal text-[9px] text-white uppercase tracking-wider tabular-nums">
                Next hand in {countdown}s
              </span>
              <div
                className="w-full h-1 rounded-full overflow-hidden"
                style={{ background: 'rgba(83, 233, 13, 0.85)' }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, #06b6d4, #22d3ee)' }}
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: SHOWDOWN_DURATION_S, ease: 'linear' }}
                />
              </div>
            </div>
          </div>
        </div>
      </WinnerPanelFrame>
    </div>
  );
}
