'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { pickLoadingTipForSession, pickRandomLoadingTip } from '@/lib/loading-tips';
import { cn } from '@/lib/utils';

function tipToNodes(text: string): ReactNode[] {
  const segments = text.split(/(\*\*[^*]+\*\*)/g);
  return segments.map((seg, i) => {
    if (seg.startsWith('**') && seg.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-white">
          {seg.slice(2, -2)}
        </strong>
      );
    }
    return seg;
  });
}

const embossedPanel: React.CSSProperties = {
  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  border: '1px inset rgba(60, 60, 60, 0.5)',
};

export type LoadingTipProps = {
  /** Inline: lazy section fallbacks. Full: route-level loading overlay. */
  variant?: 'inline' | 'full';
  className?: string;
  showSpinner?: boolean;
};

export function LoadingTip({ variant = 'inline', className, showSpinner = true }: LoadingTipProps) {
  const [tip, setTip] = useState<string | null>(null);

  useEffect(() => {
    if (variant === 'full') {
      setTip(pickLoadingTipForSession());
    } else {
      setTip(pickRandomLoadingTip());
    }
  }, [variant]);

  const nodes = useMemo(() => (tip ? tipToNodes(tip) : []), [tip]);

  const textClass =
    variant === 'full'
      ? 'text-sm sm:text-base text-white/85 leading-relaxed text-center max-w-xl'
      : 'text-xs sm:text-sm text-white/80 leading-relaxed text-center';

  const inner = (
    <>
      {showSpinner && (
        <Loader2
          className={cn(
            'shrink-0 animate-spin text-cyan-400/90',
            variant === 'full' ? 'h-8 w-8 mb-4' : 'h-5 w-5',
          )}
          aria-hidden
        />
      )}
      <AnimatePresence mode="wait">
        {tip ? (
          <motion.p
            key={tip}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            className={textClass}
          >
            {nodes}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </>
  );

  if (variant === 'full') {
    return (
      <div
        className={cn(
          'fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm p-4',
          className,
        )}
      >
        <div
          className="rounded-2xl border-2 border-cyan-500/30 p-6 sm:p-8 max-w-lg w-full flex flex-col items-center shadow-2xl overflow-hidden relative"
          style={embossedPanel}
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.15),transparent_70%)]" />
          <div className="relative flex flex-col items-center gap-1">{inner}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'w-full min-h-28 rounded-lg flex flex-col items-center justify-center gap-2 px-3 py-4 relative overflow-hidden border border-cyan-500/25',
        className,
      )}
      style={embossedPanel}
      role="status"
      aria-live="polite"
      aria-busy={tip === null}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.12),transparent_65%)]" />
      <div className="relative flex flex-col items-center gap-2 w-full max-w-md">{inner}</div>
    </div>
  );
}
