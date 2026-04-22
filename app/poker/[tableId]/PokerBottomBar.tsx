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

/** Poker shell sets padding on the main row from this (measured bar height). */
export const POKER_BOTTOM_RESERVE_VAR = '--poker-bottom-reserve';

export function PokerBottomBar({
  fullscreen = false,
  renderedState,
  mySeat,
  actions,
}: PokerBottomBarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const show = !!(renderedState && mySeat && actions);

  // Reserve vertical space so the table flex area does not draw under this overlay.
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

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      shell.style.removeProperty(POKER_BOTTOM_RESERVE_VAR);
    };
  }, [show, fullscreen]);

  if (!show) return null;

  return (
    <div
      ref={rootRef}
      data-poker-bottom
      className="pointer-events-auto absolute bottom-0 left-0 right-0 z-40"
      style={
        fullscreen
          ? {
              background: 'linear-gradient(to top, rgba(0,0,0,0.75) 60%, transparent)',
            }
          : {
              background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 100%)',
            }
      }
    >
      {fullscreen ? (
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
      ) : (
        <div className="px-2 pt-1 pb-[max(4px,env(safe-area-inset-bottom,0px))] sm:px-4 sm:pt-1.5 sm:pb-[max(6px,env(safe-area-inset-bottom,0px))]">
          <div
            className="mx-auto w-full max-w-[min(100%,56rem)] rounded-2xl border border-cyan-500/25 px-2 py-2 sm:px-3 sm:py-2.5"
            style={{
              background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.9), rgba(40, 40, 40, 0.78))',
              boxShadow:
                'inset 0 3px 6px rgba(0, 0, 0, 0.75), inset 0 -2px 5px rgba(255, 255, 255, 0.06), 0 6px 28px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(34, 211, 238, 0.08)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
            }}
          >
            {actions}
          </div>
        </div>
      )}
    </div>
  );
}
