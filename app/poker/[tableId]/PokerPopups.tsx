'use client';

import { AnimatePresence } from 'framer-motion';
import type React from 'react';
import type { BlackjackWebSocketClient, PokerTableState } from '@/lib/websocket-client';
import { PokerDepositModal } from '@/components/poker/PokerDepositModal';
import { PokerStatsModal } from '@/components/poker/PokerStatsModal';
import { PokerSoundsSettingsModal } from '@/components/poker/PokerSoundsSettingsModal';
import { PokerTableSettingsModal } from '@/components/poker/PokerTableSettingsModal';
import { EditQuickChatModal } from '@/components/poker/EditQuickChatModal';
import { PokerHowToPlayModal } from '@/components/poker/PokerHowToPlayModal';
import { PokerOpponentProfileCard } from '@/components/poker/PokerOpponentProfileCard';
import { ProfileAvatarModal } from '@/components/shared/ProfileAvatarModal';

interface PokerPopupsProps {
  showDepositModal: boolean;
  setShowDepositModal: React.Dispatch<React.SetStateAction<boolean>>;
  depositModalTab: 'deposit' | 'reup';
  mySeat: PokerTableState['seats'][number] | null;
  wsClient: BlackjackWebSocketClient | null;
  tableId: string;
  setState: React.Dispatch<React.SetStateAction<PokerTableState | null>>;
  canReup: boolean;

  showStatsModal: boolean;
  setShowStatsModal: React.Dispatch<React.SetStateAction<boolean>>;
  statsModalAddress: string | null;

  showSoundsModal: boolean;
  setShowSoundsModal: React.Dispatch<React.SetStateAction<boolean>>;
  showTableSettingsModal: boolean;
  setShowTableSettingsModal: React.Dispatch<React.SetStateAction<boolean>>;
  isAdmin: boolean;
  renderedState: PokerTableState | null;

  showEditQuickChatModal: boolean;
  setShowEditQuickChatModal: React.Dispatch<React.SetStateAction<boolean>>;
  quickChatPhrases: string[];
  setQuickChatPhrases: React.Dispatch<React.SetStateAction<string[]>>;

  showHowToPlay: boolean;
  setShowHowToPlay: React.Dispatch<React.SetStateAction<boolean>>;

  showLeaveConfirm: boolean;
  setShowLeaveConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  fmtChips: (wei: string | number) => string;
  handleLeave: () => void;

  opponentProfileAddress: string | null;
  setOpponentProfileAddress: React.Dispatch<React.SetStateAction<string | null>>;
  setStatsModalAddress: React.Dispatch<React.SetStateAction<string | null>>;

  showAvatarModal: boolean;
  setShowAvatarModal: React.Dispatch<React.SetStateAction<boolean>>;
  onAvatarSaved: () => void;

  /** Opens chip cage (MORBIUS ↔ poker chips); parent closes wallet first. */
  onOpenPokerChipExchange?: () => void;
}

export function PokerPopups({
  showDepositModal,
  setShowDepositModal,
  depositModalTab,
  mySeat,
  wsClient,
  tableId,
  setState,
  canReup,
  showStatsModal,
  setShowStatsModal,
  statsModalAddress,
  showSoundsModal,
  setShowSoundsModal,
  showTableSettingsModal,
  setShowTableSettingsModal,
  isAdmin,
  renderedState,
  showEditQuickChatModal,
  setShowEditQuickChatModal,
  quickChatPhrases,
  setQuickChatPhrases,
  showHowToPlay,
  setShowHowToPlay,
  showLeaveConfirm,
  setShowLeaveConfirm,
  fmtChips,
  handleLeave,
  opponentProfileAddress,
  setOpponentProfileAddress,
  setStatsModalAddress,
  showAvatarModal,
  setShowAvatarModal,
  onAvatarSaved,
  onOpenPokerChipExchange,
}: PokerPopupsProps) {
  return (
    <>
      {showDepositModal && (
        <PokerDepositModal
          isOpen={showDepositModal}
          onClose={() => setShowDepositModal(false)}
          defaultTab={depositModalTab}
          balanceLabel="Poker Balance"
          wsClient={mySeat ? wsClient : undefined}
          tableId={mySeat ? tableId : undefined}
          currentStack={mySeat?.stack}
          onReupSuccess={(s) => {
            if (s) setState(s);
          }}
          enablePokerReup={canReup}
          onOpenPokerChipExchange={onOpenPokerChipExchange}
        />
      )}
      <PokerStatsModal
        isOpen={showStatsModal}
        onClose={() => setShowStatsModal(false)}
        playerAddress={statsModalAddress}
      />
      <PokerSoundsSettingsModal
        isOpen={showSoundsModal}
        onClose={() => setShowSoundsModal(false)}
      />
      <PokerTableSettingsModal
        isOpen={showTableSettingsModal}
        onClose={() => setShowTableSettingsModal(false)}
        isAdmin={isAdmin}
        currentLogo={renderedState?.tableLogo}
        currentLogoOpacity={renderedState?.tableLogoOpacity}
        wsClient={wsClient}
        tableId={tableId}
      />
      <EditQuickChatModal
        open={showEditQuickChatModal}
        onClose={() => setShowEditQuickChatModal(false)}
        selectedPhrases={quickChatPhrases}
        onSave={setQuickChatPhrases}
      />
      <PokerHowToPlayModal isOpen={showHowToPlay} onClose={() => setShowHowToPlay(false)} />
      {showLeaveConfirm && mySeat && (
        <div className="surface-modal-shell">
          <div
            className="surface-modal-card max-w-sm p-5"
            style={{ boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)' }}
          >
            <p className="text-slate-200 text-sm mb-1">Leaving amount</p>
            <p className="text-cyan-400 font-semibold tabular-nums text-lg mb-4">{fmtChips(mySeat.stack ?? '0')} chips</p>
            <p className="text-slate-300 text-sm mb-5">Are you sure you want to leave?</p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:brightness-110"
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  color: 'rgba(255,255,255,0.9)',
                  border: '1px solid rgba(255,255,255,0.2)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLeave}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:brightness-110"
                style={{
                  background: 'linear-gradient(180deg, #8b1a1a 0%, #6b1111 100%)',
                  border: '1px solid rgba(255,255,255,0.12)',
                }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
      <AnimatePresence>
        {opponentProfileAddress &&
          (() => {
            const seat = renderedState?.seats.find((s) => s.playerAddress === opponentProfileAddress);
            return (
              <PokerOpponentProfileCard
                key={opponentProfileAddress}
                address={opponentProfileAddress}
                displayName={seat?.displayName}
                avatarConfig={seat?.avatarConfig}
                onClose={() => setOpponentProfileAddress(null)}
                onViewFullProfile={(addr) => {
                  setStatsModalAddress(addr);
                  setShowStatsModal(true);
                }}
              />
            );
          })()}
      </AnimatePresence>

      <ProfileAvatarModal
        open={showAvatarModal}
        onClose={() => setShowAvatarModal(false)}
        wsClient={wsClient}
        onSave={onAvatarSaved}
      />
    </>
  );
}
