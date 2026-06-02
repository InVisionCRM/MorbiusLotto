'use client';

import type React from 'react';
import type { PokerTableState } from '@/lib/websocket-client';
import { PokerTable } from '@/components/poker/PokerTable';
import type { Emotion } from '@/components/avatar';
import type { DirectedEmoteFlight, StuckArrow } from './PokerSeatOverlays';
import type { PokerDirectedEmoteKind } from '@/lib/poker-directed-emotes';
import { POKER_TABLE_REF_W, POKER_TABLE_REF_H } from './PokerMobileZoomLock';

interface PokerTableViewProps {
  tableId: string;
  /** Scale factor from usePokerMobileZoomLock. 1.0 on desktop, <1 on mobile landscape. */
  tableScale?: number;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  renderedState: PokerTableState | null;
  effectivePlayerAddress: string | null;
  handleLeaveClick: () => void;
  setActivityMobileOpenSerial: React.Dispatch<React.SetStateAction<number>>;
  timeLeft: number;
  chatBubbleBySeatIndex: Record<number, string> | undefined;
  reactionBySeatIndex: Record<number, string>;
  broadcastEmotionBySeatIndex: Record<number, Emotion>;
  directedEmotes: DirectedEmoteFlight[];
  stuckArrowsBySeatIndex: Record<number, StuckArrow[]>;
  hitBySeatIndex: Record<number, { key: number; fromSeatIndex: number; kind: PokerDirectedEmoteKind }>;
  onSendDirectedEmote?: (toSeatIndex: number, kind: PokerDirectedEmoteKind) => void;
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
  tipAnimating: boolean;
  setTipAnimating: React.Dispatch<React.SetStateAction<boolean>>;
  onTipDealer: () => Promise<void>;
  /** Fullscreen mode hides the page header — show Logo/Tip on the table using this callback. */
  onOpenLogoSponsor?: () => void;
  onSitOut?: () => void;
  onSitBack?: () => void;
  onShowCards?: () => void;
  onMuckCards?: () => void;
}

/* LANDSCAPE NOTE: The old formula `calc((100dvh - 160px) * 2.4)` punished
   landscape viewports by shrinking the table when the screen is short.
   Using a larger multiplier (3.2) keeps the table usable in landscape while
   still constraining it in ultra-wide desktop windows. The landscape CSS
   overrides in globals.css further relax this for phones. Do NOT reduce
   the multiplier below ~2.8 or landscape mobile will break again. */
/** Extra vertical room so max table width tracks the padded column (keeps aspect sane). */
const POKER_VIEW_VERTICAL_CHROME_PX = 140;

const POKER_MAIN_PANEL_STYLE: React.CSSProperties = {
  /** Narrower felt: was 90vw × 2.50 — more margin to side rails / HUD. */
  maxWidth: `min(78vw, calc((100dvh - ${POKER_VIEW_VERTICAL_CHROME_PX}px) * 2.22))`,
  marginLeft: 'auto',
  marginRight: 'auto',
  width: '100%',
};

export function PokerTableView({
  tableId,
  tableScale = 1,
  fullscreen = false,
  onToggleFullscreen,
  renderedState,
  effectivePlayerAddress,
  handleLeaveClick,
  setActivityMobileOpenSerial,
  timeLeft,
  chatBubbleBySeatIndex,
  reactionBySeatIndex,
  broadcastEmotionBySeatIndex,
  directedEmotes,
  stuckArrowsBySeatIndex,
  hitBySeatIndex,
  onSendDirectedEmote,
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
  tipAnimating,
  setTipAnimating,
  onTipDealer,
  onOpenLogoSponsor,
  onSitOut,
  onSitBack,
  onShowCards,
  onMuckCards,
}: PokerTableViewProps) {
  const isMobileScale = tableScale < 1;

  /** Same shell as `PokerHeaderBar` secondary actions — used when header is hidden (fullscreen). */
  const headerSecondaryBtnClass =
    'pointer-events-auto rounded-sm px-2.5 sm:px-3 py-1.5 text-[10px] sm:text-[11px] font-bold tracking-wide transition-all hover:brightness-125 active:scale-[0.97] whitespace-nowrap';
  const headerSecondaryBtnStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.07)',
    color: 'rgba(255,255,255,0.75)',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
  };

  // The inner table content (tip button + PokerTable + loading/error states).
  // When scaling, this renders at the fixed reference size and gets shrunk via
  // CSS transform. PokerTable's ResizeObserver sees POKER_TABLE_REF_W/H so
  // seat positions are always computed for the same reference size.
  const tableContent = (
    <>
      {fullscreen &&
        effectivePlayerAddress &&
        wsConnected &&
        mySeat &&
        onOpenLogoSponsor && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenLogoSponsor()}
                className={headerSecondaryBtnClass}
                style={headerSecondaryBtnStyle}
              >
                Logo
              </button>
              <div className="relative">
                <button
                  type="button"
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
                  className={`${headerSecondaryBtnClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                  style={headerSecondaryBtnStyle}
                >
                  Tip 2,000
                </button>
                {tipAnimating && (
                  <div
                    className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
                    style={{ top: '100%', marginTop: 2 }}
                    aria-hidden
                  >
                    <div className="tip-chip-fly">
                      <div className="w-6 h-6 rounded-full border-2 border-amber-400 bg-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/40">
                        <span className="text-white text-[8px] font-bold">$</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      {/* ── Fullscreen toggle button (top-right corner of table, desktop only) ── */}
      {!isMobileScale && onToggleFullscreen && (
        <button
          onClick={onToggleFullscreen}
          aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          className="absolute top-2 right-2 z-30 flex items-center justify-center rounded-md bg-black/50 hover:bg-black/75 border border-white/20 text-white/70 hover:text-white transition-all"
          style={{ width: 32, height: 32 }}
        >
          {fullscreen ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="8 3 3 3 3 8" /><polyline points="21 8 21 3 16 3" />
              <polyline points="3 16 3 21 8 21" /><polyline points="16 21 21 21 21 16" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
              <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          )}
        </button>
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
          directedEmotes={directedEmotes}
          stuckArrowsBySeatIndex={stuckArrowsBySeatIndex}
          hitBySeatIndex={hitBySeatIndex}
          onSendDirectedEmote={onSendDirectedEmote}
          onPhraseReaction={mySeatIndex >= 0 ? onPhraseReaction : undefined}
          onAnimationReaction={mySeatIndex >= 0 ? onAnimationReaction : undefined}
          onReUpClick={canReup ? openReupModal : undefined}
          onMenuClick={mySeat ? () => setShowAvatarModal(true) : undefined}
          onOpponentClick={(addr) => setOpponentProfileAddress(addr)}
          onOpponentRadialAction={onOpponentRadialAction}
          quickChatPhrases={quickChatPhrases}
          setQuickChatPhrases={setQuickChatPhrases}
          onOpenEditQuickChat={() => setShowEditQuickChatModal(true)}
          onSitOut={onSitOut}
          onSitBack={onSitBack}
          onShowCards={onShowCards}
          onMuckCards={onMuckCards}
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
        className="py-3 sm:py-5"
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

  // Desktop / tablet: outer vertical padding insets the felt from the column edges.
  return (
    <div
      className={`flex-1 relative min-h-0 ${fullscreen ? 'py-6 md:py-10 px-4 md:px-8' : 'py-8 md:py-14 px-6 md:px-12'}`}
      style={{
        minHeight: 0,
        ...(fullscreen ? { width: '100%' } : POKER_MAIN_PANEL_STYLE),
        display: showDashboard || showMyStats ? 'none' : undefined,
      }}
    >
      {tableContent}
    </div>
  );
}
