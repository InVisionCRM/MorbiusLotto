'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pointer } from 'lucide-react';

const GESTURE_TUTORIAL_DURATION_MS = 6000;

export interface GestureTutorialProps {
  /** When false, overlay is hidden. Dismiss after 6s or first Hit/Stand. */
  visible: boolean;
  /** Called when tutorial should be considered dismissed (e.g. start 6s timer from parent). */
  onDismiss?: () => void;
}

/**
 * Hand Ghost tutorial: overlays the table with a looping animation
 * (double-tap motion then horizontal swipe). pointer-events: none so it doesn't block clicks.
 * Parent should hide when visible becomes false after 6s or first Hit/Stand.
 */
const GestureTutorial: React.FC<GestureTutorialProps> = ({ visible, onDismiss }) => {
  React.useEffect(() => {
    if (!visible || !onDismiss) return;
    const t = setTimeout(onDismiss, GESTURE_TUTORIAL_DURATION_MS);
    return () => clearTimeout(t);
  }, [visible, onDismiss]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="absolute inset-0 z-25 flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          aria-hidden
        >
          {/* Subtle dark overlay so hand stands out */}
          <div
            className="absolute inset-0 bg-black/20"
            style={{ pointerEvents: 'none' }}
          />
          <div className="relative flex flex-col items-center justify-center gap-4">
            <motion.div
              className="flex items-center justify-center rounded-full bg-slate-900/90 border-2 border-cyan-500/40 p-4 shadow-xl"
              style={{
                boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 40px rgba(34, 211, 238, 0.15)',
              }}
            >
              {/* Hand: loop = double-tap (y down/up/down/up) then horizontal swipe (x left→right) */}
              <motion.div
                animate={{
                  x: [0, 0, 0, 0, -32, 32],
                  y: [0, 12, 0, 12, 0, 0],
                }}
                transition={{
                  duration: 3.2,
                  repeat: Number.POSITIVE_INFINITY,
                  repeatDelay: 0.8,
                  times: [0, 0.15, 0.3, 0.45, 0.6, 0.85, 1],
                }}
              >
                <Pointer
                  className="w-12 h-12 sm:w-14 sm:h-14 text-cyan-400/90"
                  strokeWidth={2}
                  aria-hidden
                />
              </motion.div>
            </motion.div>
            <p className="text-sm font-medium text-white/90 drop-shadow-md text-center px-4">
              Double-tap to <span className="text-red-400 font-semibold">Hit</span>
              <br />
              Swipe horizontally to <span className="text-blue-400 font-semibold">Stand</span>
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GestureTutorial;
