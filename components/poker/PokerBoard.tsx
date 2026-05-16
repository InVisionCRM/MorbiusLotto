'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { POKER_BETWEEN_HANDS_DELAY_MS } from '@/lib/poker-between-hands-delay';
import { CardDisplay, formatPokerCardIndexLabel, POKER_RANK_SUIT_LABEL_COLORS, pokerCardSuitIndex } from './CardDisplay';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';

export interface PokerBoardProps {
  communityCards: number[];
  /** Scalar fallback — sum of all pots. */
  pot: string;
  /**
   * Structured pots from the server. Each entry renders as its own labeled
   * stack so side pots and uncalled refunds are visually distinct from the
   * main pot. Pass `undefined` (legacy backend) and the component renders
   * a single pot from the `pot` scalar.
   */
  pots?: { amount: string; label: string }[];
  /** At showdown: 5 card indices that form the winning hand (highlighted via brightness) */
  winningCardIndices?: number[];
  /** At showdown: dim non-winning community cards so winners stand out. */
  dimNonWinning?: boolean;
  /** When true, wrap the pot in an element with data-tutorial-target="pot" for tutorial spotlight */
  dataTutorialTargetPot?: boolean;
  /** Wall-clock ISO when the next hand starts; shows a thin countdown bar under the board. */
  betweenHandsNextHandAtIso?: string | null;
  /** During showdown staging: skip Shockwave Slam so board cards do not replay deal-in. */
  suppressCommunityEntryMotion?: boolean;
}

function BetweenHandsProgressBar({ nextHandAtIso }: { nextHandAtIso: string }) {
  const endMs = useMemo(() => {
    const t = new Date(nextHandAtIso).getTime();
    return Number.isFinite(t) ? t : 0;
  }, [nextHandAtIso]);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (endMs <= 0) return;
    const id = setInterval(() => setTick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [endMs]);

  if (endMs <= 0) return null;

  const now = Date.now();
  const remainingMs = Math.max(0, endMs - now);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const startedAtMs = endMs - POKER_BETWEEN_HANDS_DELAY_MS;
  const fillPct = Math.min(
    100,
    Math.max(0, ((now - startedAtMs) / POKER_BETWEEN_HANDS_DELAY_MS) * 100),
  );

  return (
    <div
      className="mt-2 flex w-full max-w-[min(100%,28rem)] flex-col items-stretch gap-1 sm:max-w-[min(100%,32rem)]"
      aria-live="polite"
      aria-label={`Next hand in about ${remainingSec} seconds`}
    >
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span
          className="font-jost text-[9px] font-medium uppercase tracking-[0.18em] sm:text-[10px]"
          style={{ color: 'rgba(255, 255, 255, 0.45)' }}
        >
          Next hand
        </span>
        <span
          className="font-jost text-sm font-bold tabular-nums sm:text-base"
          style={{
            color: 'rgb(165, 243, 252)',
            textShadow: '0 0 12px rgba(34, 211, 238, 0.45)',
          }}
        >
          {remainingSec}
          <span className="ml-0.5 text-xs font-semibold text-cyan-200/80">s</span>
        </span>
      </div>
      <div
        className="relative h-2 w-full overflow-hidden rounded-full sm:h-2.5"
        style={{
          background: 'linear-gradient(180deg, rgba(0, 0, 0, 0.58), rgba(255, 255, 255, 0.05))',
          boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.78)',
          border: '1px inset rgba(60, 60, 60, 0.45)',
        }}
      >
        <div
          className="h-full rounded-full transition-[width] duration-200 ease-linear"
          style={{
            width: `${fillPct}%`,
            background: 'linear-gradient(90deg, rgb(6, 120, 150), rgb(34, 211, 238), rgb(56, 189, 248))',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 0 12px rgba(34, 211, 238, 0.45)',
          }}
        />
      </div>
    </div>
  );
}

function parsePotChips(chips: string): number {
  try {
    const n = toBigIntSafe(chips);
    return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : Number.MAX_SAFE_INTEGER;
  } catch {
    return 0;
  }
}

function AnimatedPotValue({ pot, fontSize }: { pot: string; fontSize?: string }) {
  const potNum = useMemo(() => parsePotChips(pot), [pot]);
  const mv = useMotionValue(potNum);
  const spring = useSpring(mv, { stiffness: 180, damping: 28 });
  const display = useTransform(spring, (v) =>
    Math.floor(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
  );

  useEffect(() => { mv.set(potNum); }, [potNum, mv]);

  return (
    <motion.span
      className="font-jost font-bold tabular-nums drop-shadow-[0_0_8px_var(--poker-accent)]"
      style={{ color: 'var(--poker-text)', fontSize: fontSize ?? 'clamp(18px, 2.6cqw, 28px)' }}
    >
      {display}
    </motion.span>
  );
}

/**
 * One pot stack — label + animated chip count + the chip sprite imagery.
 * Width scales with pot size relative to siblings (poker rooms show fatter
 * stacks for fatter pots so side-pot relative sizes are visible at a glance).
 */
function PotStack({
  label,
  amount,
  isUncalled,
  prominent,
}: {
  label: string;
  amount: string;
  isUncalled: boolean;
  prominent: boolean;
}) {
  // Color theme per pot type. Main pot = warm gold, side pots = cool cyan,
  // uncalled refund = muted gray (so it visually reads as "going back, not won").
  const tone = isUncalled
    ? { accent: 'rgba(148,163,184,0.55)', glow: 'rgba(148,163,184,0.0)', label: 'rgba(203,213,225,0.7)' }
    : prominent
    ? { accent: 'rgba(251,191,36,0.85)', glow: 'rgba(251,191,36,0.35)', label: 'rgba(254,240,138,0.95)' }
    : { accent: 'rgba(34,211,238,0.75)', glow: 'rgba(34,211,238,0.28)', label: 'rgba(165,243,252,0.95)' };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.6, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.6, y: 8 }}
      transition={{ type: 'spring', stiffness: 280, damping: 22 }}
      className="flex flex-col items-center px-2 py-1 rounded-md"
      style={{
        background: 'rgba(10, 16, 28, 0.62)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: `1px solid ${tone.accent}`,
        boxShadow: `0 3px 14px rgba(0,0,0,0.4), 0 0 18px ${tone.glow}, inset 0 1px 0 rgba(255,255,255,0.06)`,
      }}
    >
      <span
        className="font-jost-normal uppercase font-semibold leading-none whitespace-nowrap"
        style={{
          color: tone.label,
          fontSize: 'clamp(8px, 1.0cqw, 11px)',
          letterSpacing: 'var(--poker-tracking)',
        }}
      >
        {label}
      </span>
      <AnimatedPotValue pot={amount} fontSize={prominent ? 'clamp(18px, 2.6cqw, 28px)' : 'clamp(14px, 2.0cqw, 22px)'} />
    </motion.div>
  );
}

export function PokerBoard({
  communityCards,
  pot,
  pots,
  winningCardIndices,
  dimNonWinning,
  dataTutorialTargetPot,
  betweenHandsNextHandAtIso,
  suppressCommunityEntryMotion = false,
}: PokerBoardProps) {
  const potNum = useMemo(() => parsePotChips(pot), [pot]);
  // Filter out zero-amount pots so an empty trailing pot doesn't render an
  // empty stack — and fall back to a single synthetic pot from `pot` when
  // the server hasn't sent the structured breakdown (legacy / between hands).
  const renderedPots = useMemo(() => {
    if (pots && pots.length > 0) {
      const non = pots.filter((p) => parsePotChips(p.amount) > 0);
      if (non.length > 0) return non;
    }
    return potNum > 0 ? [{ amount: pot, label: 'Pot' }] : [];
  }, [pots, pot, potNum]);
  const hasMultiplePots = renderedPots.length > 1;

  const potRow = (
    <div data-testid="poker-pot" className="flex items-end justify-center gap-1.5">
      <AnimatePresence mode="popLayout" initial={false}>
        {renderedPots.map((p) => {
          const isUncalled = p.label.toLowerCase().startsWith('uncalled');
          // The "main" pot is the biggest visual anchor — full font on
          // single-pot hands and on labeled "Main Pot" entries in multi-pot rows.
          const isMain = !hasMultiplePots || p.label === 'Main Pot' || p.label === 'Pot';
          return (
            <PotStack
              key={p.label}
              label={p.label}
              amount={p.amount}
              isUncalled={isUncalled}
              prominent={isMain}
            />
          );
        })}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="relative flex flex-col items-center">
      {/* POT floats above cards without shifting their position */}
      <AnimatePresence>
        {renderedPots.length > 0 && (
          <motion.div
            key="pot-row"
            initial={{ opacity: 0, scale: 0.8, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 6 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="absolute bottom-full mb-2 flex flex-col items-center"
          >
            {dataTutorialTargetPot ? (
              <div className="flex flex-col items-center" data-tutorial-target="pot">
                {potRow}
              </div>
            ) : (
              potRow
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2 sm:gap-3" data-testid="poker-community-cards">
        {[0, 1, 2, 3, 4].map((i) => {
          // Each card starts at the pot (board center) and flies out to its slot.
          // Approximate cell width (card + gap) — tuned for the `clamp()` sizes in CardDisplay.
          const CELL_WIDTH_PX = 84;
          const dealFromOffset = { dx: (2 - i) * CELL_WIDTH_PX, dy: 0 };
          const idx = communityCards[i];
          const suitIdx = idx != null ? pokerCardSuitIndex(idx) : null;
          const labelColor =
            suitIdx != null ? POKER_RANK_SUIT_LABEL_COLORS[suitIdx] : 'rgba(255, 255, 255, 1)';
          return (
            <AnimatePresence key={i} mode="wait">
              <div className="flex min-w-0 flex-col items-center gap-0.5">
                {idx != null ? (
                  <CardDisplay
                    key={idx}
                    cardIndex={idx}
                    dealDelay={i * 0.12}
                    suppressEntryMotion={suppressCommunityEntryMotion}
                    isWinningCard={winningCardIndices?.includes(idx)}
                    isDimmed={dimNonWinning && !winningCardIndices?.includes(idx)}
                    showCenterRankSuitOverlay
                    variant="community"
                    dealFromOffset={dealFromOffset}
                  />
                ) : (
                  <CardDisplay key={`empty-${i}`} cardIndex={undefined} />
                )}
                {idx != null && (
                  <span
                    className="font-jost font-bold max-w-full truncate text-center text-[17px] leading-tight tracking-tight sm:text-[18px] tabular-nums"
                    style={{ color: labelColor }}
                    aria-hidden
                  >
                    {formatPokerCardIndexLabel(idx)}
                  </span>
                )}
              </div>
            </AnimatePresence>
          );
        })}
      </div>
      {betweenHandsNextHandAtIso ? (
        <BetweenHandsProgressBar nextHandAtIso={betweenHandsNextHandAtIso} />
      ) : null}
    </div>
  );
}
