'use client';

import type React from 'react';
import type { BlackjackWebSocketClient, PokerTableState } from '@/lib/websocket-client';
import { PokerTable } from '@/components/poker/PokerTable';
import { IconButton } from '@/components/animate-ui/components/buttons/icon';
import type { Emotion } from '@/components/avatar';
import { POKER_TABLE_REF_W, POKER_TABLE_REF_H } from './PokerMobileZoomLock';

interface PokerTableViewProps {
  /** Scale factor from usePokerMobileZoomLock. 1.0 on desktop, <1 on mobile landscape. */
  tableScale?: number;
  renderedState: PokerTableState | null;
  effectivePlayerAddress: string | null;
  handleLeaveClick: () => void;
  setActivityMobileOpenSerial: React.Dispatch<React.SetStateAction<number>>;
  timeLeft: number;
  chatBubbleBySeatIndex: Record<number, string> | undefined;
  reactionBySeatIndex: Record<number, string>;
  broadcastEmotionBySeatIndex: Record<number, Emotion>;
  mySeatIndex: number;
  onPhraseReaction: (phrase: string) => void;
  onAnimationReaction: (emotion: Emotion) => void;
  canReup: boolean;
  openReupModal: () => void;
  mySeat: PokerTableState['seats'][number] | null;
  setShowAvatarModal: React.Dispatch<React.SetStateAction<boolean>>;
  setOpponentProfileAddress: React.Dispatch<React.SetStateAction<string | null>>;
  onOpponentRadialAction: (action: 'profile' | 'follow' | 'gift', addr: string) => void | Promise<void>;
  quickChatPhrases: string[];
  setQuickChatPhrases: React.Dispatch<React.SetStateAction<string[]>>;
  setShowEditQuickChatModal: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  showDashboard: boolean;
  showMyStats: boolean;
  wsConnected: boolean;
  wsClient: BlackjackWebSocketClient | null;
  tipAnimating: boolean;
  setTipAnimating: React.Dispatch<React.SetStateAction<boolean>>;
  onTipDealer: () => Promise<void>;
}

/* LANDSCAPE NOTE: The old formula `calc((100dvh - 160px) * 2.4)` punished
   landscape viewports by shrinking the table when the screen is short.
   Using a larger multiplier (3.2) keeps the table usable in landscape while
   still constraining it in ultra-wide desktop windows. The landscape CSS
   overrides in globals.css further relax this for phones. Do NOT reduce
   the multiplier below ~2.8 or landscape mobile will break again. */
const POKER_MAIN_PANEL_STYLE: React.CSSProperties = {
  maxWidth: 'min(100vw, calc((100dvh - 100px) * 3.2))',
  marginLeft: 'auto',
  marginRight: 'auto',
  width: '100%',
};

export function PokerTableView({
  tableScale = 1,
  renderedState,
  effectivePlayerAddress,
  handleLeaveClick,
  setActivityMobileOpenSerial,
  timeLeft,
  chatBubbleBySeatIndex,
  reactionBySeatIndex,
  broadcastEmotionBySeatIndex,
  mySeatIndex,
  onPhraseReaction,
  onAnimationReaction,
  canReup,
  openReupModal,
  mySeat,
  setShowAvatarModal,
  setOpponentProfileAddress,
  onOpponentRadialAction,
  quickChatPhrases,
  setQuickChatPhrases,
  setShowEditQuickChatModal,
  error,
  showDashboard,
  showMyStats,
  wsConnected,
  wsClient,
  tipAnimating,
  setTipAnimating,
  onTipDealer,
}: PokerTableViewProps) {
  const isMobileScale = tableScale < 1;

  // The inner table content (tip button + PokerTable + loading/error states).
  // When scaling, this renders at the fixed reference size and gets shrunk via
  // CSS transform. PokerTable's ResizeObserver sees POKER_TABLE_REF_W/H so
  // seat positions are always computed for the same reference size.
  const tableContent = (
    <>
      {effectivePlayerAddress && wsConnected && wsClient && mySeat && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center">
          <IconButton
            variant="tip"
            size="tip"
            onClick={async () => {
              if (tipAnimating) return;
              setTipAnimating(true);
              try {
                await onTipDealer();
              } finally {
                setTimeout(() => setTipAnimating(false), 900);
              }
            }}
            disabled={tipAnimating}
          >
            Tip 2,000
          </IconButton>
          {tipAnimating && (
            <div className="absolute pointer-events-none" style={{ top: 0, left: '50%', transform: 'translateX(-50%)' }}>
              <div className="tip-chip-fly">
                <div className="w-6 h-6 rounded-full border-2 border-amber-400 bg-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/40">
                  <span className="text-white text-[8px] font-bold">$</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {renderedState ? (
        <PokerTable
          state={renderedState}
          currentPlayerAddress={effectivePlayerAddress}
          onLeave={handleLeaveClick}
          onRequestMobileActivity={() => setActivityMobileOpenSerial((n) => n + 1)}
          timeLeft={timeLeft}
          chatBubbleBySeatIndex={chatBubbleBySeatIndex}
          reactionBySeatIndex={reactionBySeatIndex}
          broadcastEmotionBySeatIndex={broadcastEmotionBySeatIndex}
          onPhraseReaction={mySeatIndex >= 0 ? onPhraseReaction : undefined}
          onAnimationReaction={mySeatIndex >= 0 ? onAnimationReaction : undefined}
          onReUpClick={canReup ? openReupModal : undefined}
          onMenuClick={mySeat ? () => setShowAvatarModal(true) : undefined}
          onOpponentClick={(addr) => setOpponentProfileAddress(addr)}
          onOpponentRadialAction={onOpponentRadialAction}
          quickChatPhrases={quickChatPhrases}
          setQuickChatPhrases={setQuickChatPhrases}
          onOpenEditQuickChat={() => setShowEditQuickChatModal(true)}
        />
      ) : !error ? (
        <div className="absolute inset-0 flex items-center justify-center text-[var(--poker-text-muted)] text-sm">
          Loading table...
        </div>
      ) : null}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-4">
          <p className="text-[var(--poker-danger)] text-sm text-center">{error}</p>
        </div>
      )}
    </>
  );

  if (isMobileScale) {
    // Mobile landscape: outer flex-1 div centers the scaled table in the
    // available space. The middle div occupies the exact scaled footprint so
    // the flex layout accounts for it correctly. The inner div is the full
    // reference size, shrunk down via transform: scale.
    return (
      <div
        style={{
          flex: '1 1 0',
          minHeight: 0,
          display: showDashboard || showMyStats ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'visible',
        }}
      >
        {/* Footprint div — takes up exactly the scaled space in the flex layout */}
        <div
          style={{
            position: 'relative',
            width: POKER_TABLE_REF_W * tableScale,
            height: POKER_TABLE_REF_H * tableScale,
            flexShrink: 0,
          }}
        >
          {/* Reference-size container, scaled to fit */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: POKER_TABLE_REF_W,
              height: POKER_TABLE_REF_H,
              transform: `scale(${tableScale})`,
              transformOrigin: 'top left',
            }}
          >
            {tableContent}
          </div>
        </div>
      </div>
    );
  }

  // Desktop / tablet: existing layout unchanged
  return (
    <div
      className="flex-1 relative"
      style={{
        minHeight: 0,
        ...POKER_MAIN_PANEL_STYLE,
        display: showDashboard || showMyStats ? 'none' : undefined,
      }}
    >
      {tableContent}
    </div>
  );
}
