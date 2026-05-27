'use client';

import { useLayoutEffect, useRef } from 'react';
import type React from 'react';
import type { PokerTableState } from '@/lib/websocket-client';

interface PokerBottomBarProps {
  fullscreen?: boolean;
  renderedState: PokerTableState | null;
  mySeat: PokerTableState['seats'][number] | null;
  actions: React.ReactNode;
}

const SHELL_SELECTOR = '[data-poker-shell]';

/** Measured bar height (px). Consumed by fullscreen overlay padding AND mobile-landscape CSS
 * (globals.css "Poker landscape" section pins the bar `position: fixed` and pads the shell row
 * using this var so the table doesn't sit under the bar). */
export const POKER_BOTTOM_RESERVE_VAR = '--poker-bottom-reserve';

export function PokerBottomBar({
  fullscreen = false,
  renderedState,
  mySeat,
  actions,
}: PokerBottomBarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const show = !!(renderedState && mySeat && actions);

  // Always measure the bar's height into a CSS var on the shell. Consumers:
  //   • Fullscreen overlay: pads the main flex row by this amount (bar is absolute).
  //   • Mobile-landscape (globals.css): bar becomes `position: fixed`; the same var pads
  //     the shell row so the felt doesn't get clipped under the bar. The previous
  //     hardcoded 80px reservation was far too small for the default mobile variant
  //     (~150–180px tall), which caused the bar to overlay the middle of the table.
  useLayoutEffect(() => {
    const shell = document.querySelector(SHELL_SELECTOR) as HTMLElement | null;
    if (!shell) return;

    const applyReserve = (px: number) => {
      shell.style.setProperty(POKER_BOTTOM_RESERVE_VAR, `${Math.max(0, Math.round(px))}px`);
    };

    if (!show) {
      applyReserve(0);
      return () => {
        shell.style.removeProperty(POKER_BOTTOM_RESERVE_VAR);
      };
    }

    const el = rootRef.current;
    if (!el) {
      applyReserve(0);
      return () => {
        shell.style.removeProperty(POKER_BOTTOM_RESERVE_VAR);
      };
    }

    const measure = () => applyReserve(el.offsetHeight);

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      shell.style.removeProperty(POKER_BOTTOM_RESERVE_VAR);
    };
  }, [show, fullscreen]);

  if (!show) return null;

  if (fullscreen) {
    return (
      <div
        ref={rootRef}
        data-poker-bottom
        className="pointer-events-auto absolute bottom-0 left-0 right-0 z-40"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.75) 60%, transparent)',
        }}
      >
        <div className="px-4 pb-1 pt-2">
          <div
            className="mx-auto w-full max-w-[900px] rounded-sm px-4 py-2.5"
            style={{
              background: 'rgba(5,8,20,0.72)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {actions}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      data-poker-bottom
      className="relative z-40 w-full shrink-0 pointer-events-auto"
      style={{
        background: 'linear-gradient(to top, rgba(0,0,0,0.35) 0%, transparent 100%)',
      }}
    >
      <div className="w-full max-sm:px-0 max-sm:pt-0 max-sm:pb-0 sm:px-3 sm:pt-1.5 sm:pb-[max(6px,env(safe-area-inset-bottom,0px))]">
        {actions}
      </div>
    </div>
  );
}
