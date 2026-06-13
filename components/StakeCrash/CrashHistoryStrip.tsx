'use client';

/**
 * CrashHistoryStrip — the floating recent-crash-points strip (/crash).
 * Faithful port of the prototype's HistoryPanel: color-tiered pills
 * (gray < 2x, orange ≥ 2x, purple ≥ 10x) with scroll chevrons.
 */

import { useCrashStore } from './useCrashStore';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef } from 'react';

export default function CrashHistoryStrip() {
  const { history } = useCrashStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollLeftOrUp = () => {
    if (scrollRef.current) {
      // scroll vertically on mobile, horizontally on desktop
      if (window.innerWidth < 1024) {
        scrollRef.current.scrollBy({ top: -100, behavior: 'smooth' });
      } else {
        scrollRef.current.scrollBy({ left: -200, behavior: 'smooth' });
      }
    }
  };

  const scrollRightOrDown = () => {
    if (scrollRef.current) {
      if (window.innerWidth < 1024) {
        scrollRef.current.scrollBy({ top: 100, behavior: 'smooth' });
      } else {
        scrollRef.current.scrollBy({ left: 200, behavior: 'smooth' });
      }
    }
  };

  return (
    <div className="w-full h-full flex flex-col lg:flex-row items-center gap-1.5 lg:gap-3 min-w-0">
      <button
        onClick={scrollLeftOrUp}
        className="hidden lg:flex w-8 h-8 items-center justify-center shrink-0 rounded-full bg-white/5 hover:bg-white/10 text-[#848ca1] hover:text-white transition-colors"
      >
        <ChevronLeft size={16} className="hidden lg:block" />
      </button>

      <div
        ref={scrollRef}
        className="flex flex-col lg:flex-row items-center gap-1.5 lg:gap-3 overflow-y-auto lg:overflow-y-hidden overflow-x-hidden lg:overflow-x-auto w-full h-full no-scrollbar pb-2 lg:pb-0"
      >
        {history.map((mult, i) => {
          let styleWrapper = 'text-[#848ca1] border-white/10 bg-white/5';

          if (mult >= 10) {
            styleWrapper =
              'text-[#7000ff] border-[#7000ff] bg-[#7000ff]/10 shadow-[0_0_10px_rgba(112,0,255,0.2)]';
          } else if (mult >= 2) {
            styleWrapper =
              'text-[#ff9d00] border-[#ff9d00] bg-[#ff9d00]/10 shadow-[0_0_10px_rgba(255,157,0,0.2)]';
          }

          return (
            <div
              key={i}
              className={`px-2 py-1 lg:px-4 lg:py-2 rounded-[16px] lg:rounded-full font-mono font-bold text-[9px] lg:text-[14px] border whitespace-nowrap min-w-[38px] lg:min-w-[76px] text-center shrink-0 transition-all ${styleWrapper}`}
            >
              {mult.toFixed(2)}x
            </div>
          );
        })}
      </div>

      <button
        onClick={scrollRightOrDown}
        className="hidden lg:flex w-8 h-8 items-center justify-center shrink-0 rounded-full bg-white/5 hover:bg-white/10 text-[#848ca1] hover:text-white transition-colors"
      >
        <ChevronRight size={16} className="hidden lg:block" />
      </button>
    </div>
  );
}
