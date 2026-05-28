'use client';

import { useLayoutEffect, useRef } from 'react';
import type React from 'react';
import type { PokerTableState } from '@/lib/websocket-client';

interface PokerBottomBarProps {
  fullscreen?: boolean;
  /** Mobile landscape: render the actions as a fixed RIGHT-SIDE vertical strip
   * so the felt can use the full landscape height instead of being squished
   * by a bottom bar. */
  mobileLandscape?: boolean;
  renderedState: PokerTableState | null;
  mySeat: PokerTableState['seats'][number] | null;
  actions: React.ReactNode;
}

const SHELL_SELECTOR = '[data-poker-shell]';

/** Measured bar height (px). Consumed by fullscreen overlay padding AND landscape CSS
 * (legacy bottom-strip path). The mobile-landscape side-strip path uses
 * `POKER_SIDE_STRIP_W` instead — the bar's height is the viewport height there. */
export const POKER_BOTTOM_RESERVE_VAR = '--poker-bottom-reserve';

/** Width of the mobile-landscape right-side action strip. Consumed by the strip itself,
 * by `PokerMobileZoomLock` (subtracted from available width when scaling the table),
 * and by the shell row's `padding-right` so the felt doesn't sit under the strip. */
export const POKER_SIDE_STRIP_W = 96;

export function PokerBottomBar({
  fullscreen = false,
  mobileLandscape = false,
  renderedState,
  mySeat,
  actions,
}: PokerBottomBarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const show = !!(renderedState && mySeat && actions);

  // Measure the bar's height into a CSS var on the shell. Consumed by:
  //   • Fullscreen overlay: pads the main flex row by this amount (bar is absolute).
  //   • Legacy landscape bottom-strip path (no longer used now that mobile-landscape
  //     renders a side strip — see the mobileLandscape branch below).
  // Side-strip mode skips this measurement: it's a viewport-tall fixed column, not
  // a content-sized strip, and reservation is by fixed width (POKER_SIDE_STRIP_W).
  useLayoutEffect(() => {
    const shell = document.querySelector(SHELL_SELECTOR) as HTMLElement | null;
    if (!shell) return;

    const applyReserve = (px: number) => {
      shell.style.setProperty(POKER_BOTTOM_RESERVE_VAR, `${Math.max(0, Math.round(px))}px`);
    };

    if (!show || mobileLandscape) {
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
  }, [show, fullscreen, mobileLandscape]);

  if (!show) return null;

  // Mobile landscape: viewport-tall right-side column. Sits over the felt's right
  // edge; the shell row reserves the matching `padding-right` so the felt scales
  // into the remaining width (handled in page.tsx).
  if (mobileLandscape) {
    return (
      <div
        ref={rootRef}
        data-poker-bottom
        data-poker-bottom-side
        className="pointer-events-auto fixed right-0 top-0 bottom-0 z-40"
        style={{
          width: POKER_SIDE_STRIP_W,
          background: 'linear-gradient(to left, rgba(5,8,20,0.92), rgba(5,8,20,0.78))',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {actions}
      </div>
    );
  }

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
