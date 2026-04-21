'use client';

import type React from 'react';
import type { PokerTableState } from '@/lib/websocket-client';

interface PokerBottomBarProps {
  fullscreen?: boolean;
  renderedState: PokerTableState | null;
  mySeat: PokerTableState['seats'][number] | null;
  actions: React.ReactNode;
}

export function PokerBottomBar({
  fullscreen = false,
  renderedState,
  mySeat,
  actions,
}: PokerBottomBarProps) {
  // LANDSCAPE NOTE: In landscape mobile the CSS in globals.css compacts this
  // bar. Do NOT move the actions to a different DOM position for landscape — the CSS handles it.

  // Fullscreen: horizontal strip anchored to the bottom of the table
  if (fullscreen) {
    return renderedState && mySeat && actions ? (
      <div className="absolute bottom-0 left-0 right-0 z-40 px-4 pb-1 pt-2"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.75) 60%, transparent)',
        }}
      >
        <div
          className="w-full mx-auto rounded-sm px-4 py-2.5"
          style={{
            maxWidth: 900,
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
    ) : null;
  }

  return (
    <>
      <div data-poker-bottom className="flex-shrink-0 min-h-0 w-full">
        <div className="min-w-0 flex-shrink-0">{renderedState && mySeat && actions}</div>
      </div>
    </>
  );
}
