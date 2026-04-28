'use client';

import { motion } from 'framer-motion';

export interface DealerButtonProps {
  /** Fractional x-coordinate (0–1) within the table root. */
  fx: number;
  /** Fractional y-coordinate (0–1) within the table root. */
  fy: number;
}

/**
 * Physical dealer button (the cream/gold disc with "D" engraved) that sits on
 * the felt next to the dealer's seat. Animates between fractional positions so
 * it slides around the table when the dealer moves at hand boundaries.
 */
export function DealerButton({ fx, fy }: DealerButtonProps) {
  return (
    <motion.div
      data-testid="poker-dealer-button"
      className="absolute pointer-events-none"
      style={{ transform: 'translate(-50%, -50%)', zIndex: 19 }}
      initial={false}
      animate={{ left: `${fx * 100}%`, top: `${fy * 100}%` }}
      transition={{ type: 'spring', stiffness: 90, damping: 20, mass: 0.9 }}
    >
      <div
        style={{
          width: 30,
          height: 30,
          borderRadius: '9999px',
          background:
            'radial-gradient(circle at 35% 30%, #fffaf0 0%, #f4e7b6 55%, #d4af37 100%)',
          border: '1.5px solid #8a6a1f',
          boxShadow:
            '0 4px 8px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.7), inset 0 -2px 3px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Inner ring etched into the face */}
        <div
          aria-hidden
          className="absolute"
          style={{
            inset: 3,
            borderRadius: '9999px',
            border: '1px solid rgba(138, 106, 31, 0.55)',
            boxShadow: 'inset 0 0 4px rgba(212, 175, 55, 0.35)',
          }}
        />
        <span
          style={{
            fontFamily: 'serif',
            fontWeight: 900,
            fontSize: 14,
            color: '#1a1408',
            letterSpacing: '-0.02em',
            textShadow: '0 1px 0 rgba(255,255,255,0.4)',
            lineHeight: 1,
            zIndex: 1,
          }}
        >
          D
        </span>
      </div>
    </motion.div>
  );
}
