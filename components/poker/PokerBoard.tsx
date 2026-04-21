'use client';

import React, { useEffect, useMemo } from 'react';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { CardDisplay } from './CardDisplay';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';

export interface PokerBoardProps {
  communityCards: number[];
  pot: string;
  /** At showdown: 5 card indices that form the winning hand (for cyan highlight) */
  winningCardIndices?: number[];
  /** When true, wrap the pot in an element with data-tutorial-target="pot" for tutorial spotlight */
  dataTutorialTargetPot?: boolean;
}

function parsePotChips(chips: string): number {
  try {
    const n = toBigIntSafe(chips);
    return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : Number.MAX_SAFE_INTEGER;
  } catch {
    return 0;
  }
}

function AnimatedPotValue({ pot }: { pot: string }) {
  const potNum = useMemo(() => parsePotChips(pot), [pot]);
  const mv = useMotionValue(potNum);
  const spring = useSpring(mv, { stiffness: 180, damping: 28 });
  const display = useTransform(spring, (v) =>
    Math.floor(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
  );

  useEffect(() => { mv.set(potNum); }, [potNum, mv]);

  return (
    <motion.span
      className="font-jost text-xl sm:text-2xl font-bold tabular-nums drop-shadow-[0_0_8px_var(--poker-accent)]"
      style={{ color: 'var(--poker-text)' }}
    >
      {display}
    </motion.span>
  );
}

export function PokerBoard({ communityCards, pot, winningCardIndices, dataTutorialTargetPot }: PokerBoardProps) {
  const potNum = useMemo(() => parsePotChips(pot), [pot]);

  const potInner = (
    <div
      data-testid="poker-pot"
      className="flex flex-col items-center px-3 py-1 rounded-lg"
      style={{
        background: 'rgba(255,255,255,0.04)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 3px 14px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <span className="font-jost-normal text-[var(--poker-danger)] text-[9px] tracking-[var(--poker-tracking)] uppercase">POT</span>
      <div className="flex items-center gap-1">
        <AnimatedPotValue pot={pot} />
        { }
        <img src="/morbius/MorbiusLogo (3).png" alt="MORBIUS" className="w-4 h-4 sm:w-5 sm:h-5 rounded-full" />
      </div>
    </div>
  );

  return (
    <div className="relative flex flex-col items-center">
      {/* POT floats above cards without shifting their position */}
      <AnimatePresence>
        {potNum > 0 && (
          <motion.div
            key="pot"
            initial={{ opacity: 0, scale: 0.8, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 6 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="absolute bottom-full mb-2 flex flex-col items-center"
          >
            {dataTutorialTargetPot ? (
              <div className="flex flex-col items-center" data-tutorial-target="pot">
                {potInner}
              </div>
            ) : (
              potInner
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2 sm:gap-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <AnimatePresence key={i} mode="wait">
            <div data-testid="poker-community-cards">
              {communityCards[i] != null ? (
                <CardDisplay
                  key={communityCards[i]}
                  cardIndex={communityCards[i]}
                  dealDelay={i * 0.12}
                  isWinningCard={winningCardIndices?.includes(communityCards[i])}
                  showCenterRankSuitOverlay
                  variant="community"
                />
              ) : (
                <CardDisplay key={`empty-${i}`} cardIndex={undefined} />
              )}
            </div>
          </AnimatePresence>
        ))}
      </div>
    </div>
  );
}
