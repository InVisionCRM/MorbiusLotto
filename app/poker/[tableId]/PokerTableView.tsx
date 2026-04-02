'use client';

import type React from 'react';
import type { BlackjackWebSocketClient, PokerTableState } from '@/lib/websocket-client';
import { PokerTable } from '@/components/poker/PokerTable';
import { MorbiusLoadingChip } from '@/components/shared/MorbiusLoadingChip';
import { IconButton } from '@/components/animate-ui/components/buttons/icon';
import type { Emotion } from '@/components/avatar';

interface PokerTableViewProps {
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

const POKER_MAIN_PANEL_STYLE: React.CSSProperties = {
  maxWidth: 'min(100vw, calc((100dvh - 160px) * 2.4))',
  marginLeft: 'auto',
  marginRight: 'auto',
  width: '100%',
};

export function PokerTableView({
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
  return (
    <div
      className="flex-1 relative"
      style={{
        minHeight: 0,
        ...POKER_MAIN_PANEL_STYLE,
        display: showDashboard || showMyStats ? 'none' : undefined,
      }}
    >
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
        <>
          <div className="absolute inset-0 flex items-center justify-center text-[var(--poker-text-muted)] text-sm">
            Loading table...
          </div>
          <MorbiusLoadingChip />
        </>
      ) : null}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-4">
          <p className="text-[var(--poker-danger)] text-sm text-center">{error}</p>
        </div>
      )}
    </div>
  );
}
