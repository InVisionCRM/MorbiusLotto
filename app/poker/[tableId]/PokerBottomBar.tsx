'use client';

import type React from 'react';
import type { BlackjackWebSocketClient, PokerTableState } from '@/lib/websocket-client';
import { PokerActivityFeed } from '@/components/poker/PokerActivityFeed';

interface PokerBottomBarProps {
  fullscreen?: boolean;
  renderedState: PokerTableState | null;
  mySeat: PokerTableState['seats'][number] | null;
  actions: React.ReactNode;
  wsClient: BlackjackWebSocketClient | null;
  wsConnected: boolean;
  pokerChatRoomId: string;
  tableId: string;
  activityMobileOpenSerial: number;
}

export function PokerBottomBar({
  fullscreen = false,
  renderedState,
  mySeat,
  actions,
  wsClient,
  wsConnected,
  pokerChatRoomId,
  tableId,
  activityMobileOpenSerial,
}: PokerBottomBarProps) {
  // LANDSCAPE NOTE: In landscape mobile the CSS in globals.css collapses this
  // bar to max-height 52px. Do NOT move the actions or activity feed to a
  // different DOM position for landscape — the CSS handles it.

  // Fullscreen: floating bet panel only (no chat/activity), centered at bottom
  if (fullscreen) {
    return renderedState && mySeat && actions ? (
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4">
        <div className="rounded-xl bg-black/60 backdrop-blur-md border border-white/10 p-3">
          {actions}
        </div>
      </div>
    ) : null;
  }

  return (
    <>
      <div data-poker-bottom className="flex-shrink-0 grid grid-cols-1 md:grid-cols-[minmax(220px,0.8fr)_minmax(80px,0.25fr)_minmax(420px,1.7fr)] gap-0 min-h-0">
        <div className="min-w-0 md:order-1">
          {pokerChatRoomId && (
            <PokerActivityFeed
              wsClient={wsClient}
              wsConnected={wsConnected}
              roomId={pokerChatRoomId}
              tableId={tableId}
              state={renderedState}
              embedInLayout
              mobileOpenRequestSerial={activityMobileOpenSerial}
            />
          )}
        </div>
        <div className="hidden md:block min-w-0 md:order-2" />
        <div className="order-1 md:order-3 flex-shrink-0 min-w-0">
          {renderedState && mySeat && actions}
        </div>
      </div>
    </>
  );
}
