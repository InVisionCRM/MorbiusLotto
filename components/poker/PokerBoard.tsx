'use client';

import React, { useEffect, useMemo } from 'react';
import { formatEther } from 'viem';
import { CardDisplay } from './CardDisplay';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';

export interface PokerBoardProps {
  communityCards: number[];
  pot: string;
  /** When true, wrap the pot in an element with data-tutorial-target="pot" for tutorial spotlight */
  dataTutorialTargetPot?: boolean;
}

function parsePotNum(wei: string): number {
  try { return Number(formatEther(BigInt(wei))); } catch { return 0; }
}

function AnimatedPotValue({ pot }: { pot: string }) {
  const potNum = useMemo(() => parsePotNum(pot), [pot]);
  const mv = useMotionValue(potNum);
  const spring = useSpring(mv, { stiffness: 180, damping: 28 });
  const display = useTransform(spring, (v) =>
    Number.isInteger(Math.round(v))
      ? Math.round(v).toLocaleString(undefined, { maximumFractionDigits: 0 })
      : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );

  useEffect(() => { mv.set(potNum); }, [potNum, mv]);

  return (
    <motion.span
      className="font-jost text-xl sm:text-2xl font-bold tabular-nums drop-shadow-[0_0_10px_var(--poker-accent)]"
      style={{ color: 'var(--poker-text)' }}
    >
      {display}
    </motion.span>
  );
}

export function PokerBoard({ communityCards, pot, dataTutorialTargetPot }: PokerBoardProps) {
  const potNum = useMemo(() => parsePotNum(pot), [pot]);

  const potInner = (
    <>
      <span className="font-jost-normal text-[var(--poker-danger)] text-[10px] tracking-[var(--poker-tracking)] uppercase">POT</span>
      <AnimatedPotValue pot={pot} />
    </>
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
            {communityCards[i] != null ? (
              <CardDisplay
                key={communityCards[i]}
                cardIndex={communityCards[i]}
                dealDelay={i * 0.07}
              />
            ) : (
              <CardDisplay key={`empty-${i}`} cardIndex={undefined} />
            )}
          </AnimatePresence>
        ))}
      </div>
    </div>
  );
}
