'use client';

/**
 * CrashMultiplierDisplay — the giant gradient multiplier overlay (/crash).
 * Faithful port of the prototype's MultiplierDisplay; the betting-phase copy
 * adapts to the per-player flow (idle vs. armed countdown).
 */

import { useCrashStore } from './useCrashStore';
import { motion, AnimatePresence } from 'motion/react';

export default function CrashMultiplierDisplay() {
  const { multiplier, phase, hasBet, countingDown } = useCrashStore();

  const isCrashed = phase === 'crashed';
  const isBetting = phase === 'betting';

  const displayVal = multiplier.toFixed(2);

  // Gradient setups to mimic linear-gradient with text clip
  const gradientClass = isCrashed ? 'from-[#ffffff] to-[#ff3e3e]' : 'from-[#ffffff] to-[#00ffa3]';

  const dropShadow = isCrashed
    ? 'drop-shadow-[0_0_20px_rgba(255,62,62,0.4)]'
    : 'drop-shadow-[0_0_20px_rgba(0,255,163,0.4)]';

  const statusBadge = isCrashed
    ? 'text-[#ff3e3e] border-[#ff3e3e] bg-[#ff3e3e]/10'
    : 'text-[#00ffa3] border-[#00ffa3] bg-[#00ffa3]/10';

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-50">
      <AnimatePresence mode="wait">
        {isBetting ? (
          <motion.div
            key="betting"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.2 }}
            className="flex flex-col items-center"
          >
            <h2 className="text-[70px] sm:text-[90px] lg:text-[110px] font-[800] leading-none bg-clip-text text-transparent bg-gradient-to-b from-[#ffffff] to-[#848ca1] filter drop-shadow-[0_0_20px_rgba(255,255,255,0.1)] mb-3">
              {hasBet && countingDown ? 'WAIT' : 'CRASH'}
            </h2>
            <div className="px-[12px] py-[4px] rounded-[100px] border text-[10px] sm:text-[12px] uppercase tracking-[2px] font-bold text-[#848ca1] border-[#848ca1] bg-white/5">
              {hasBet && countingDown ? 'Round Starting' : 'Place a bet to launch'}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="playing"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center mt-[-20px] lg:mt-0"
          >
            <span
              className={`text-[60px] sm:text-[90px] lg:text-[110px] font-[800] leading-none bg-clip-text text-transparent bg-gradient-to-b ${gradientClass} filter ${dropShadow} mb-1 sm:mb-[10px]`}
            >
              {displayVal}
              <span className="text-[30px] sm:text-[50px] lg:text-[60px] tracking-normal inline-block align-baseline ml-1">
                x
              </span>
            </span>
            <motion.div
              layout
              className={`inline-block px-[10px] lg:px-[12px] py-[2px] lg:py-[4px] border rounded-[100px] text-[10px] sm:text-[12px] uppercase tracking-[2px] font-bold ${statusBadge}`}
            >
              {isCrashed ? 'Crashed' : 'Flying High'}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
