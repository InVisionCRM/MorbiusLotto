'use client';

import React from 'react';
import PresetAmountsModal from '@/components/PLINKO/PresetAmountsModal';
import ExtendedHistoryModal from '@/components/PLINKO/ExtendedHistoryModal';
import { PlinkoHistoryModal } from '@/components/PLINKO/PlinkoHistoryModal';
import SlotMachine from '@/components/shared/SlotMachine';
import { PlayerProfileModal, type PlayerProfileGame } from '@/components/shared/PlayerProfileModal';
import { PlinkoDrop, PlinkoPlayerStats } from '@/lib/plinko-types';
import { RiskLevel } from '@/app/PLINKO/types';

interface HistoryItem {
  id: number;
  multiplier: number;
  risk: RiskLevel;
}

interface PlinkoModalsHostProps {
  showPresetModal: boolean;
  onShowPresetModalChange: (open: boolean) => void;
  onSelectPresetAmount: (amount: number | ((prev: number) => number)) => void;

  showExtendedHistory: boolean;
  onShowExtendedHistoryChange: (open: boolean) => void;
  history: HistoryItem[];

  showPlinkoHistory: boolean;
  onShowPlinkoHistoryChange: (open: boolean) => void;
  drops: PlinkoDrop[];
  stats: PlinkoPlayerStats | null;
  isHistoryConnected: boolean;
  historyPlayerKey: string;
  onExportHistory: () => void;
  onClearHistory: () => Promise<void>;

  playerProfileOpen: boolean;
  onClosePlayerProfile: () => void;
  playerAddress: string | null;
  playerProfileGame: PlayerProfileGame;

  showMultiplierTable: boolean;
  onShowMultiplierTableChange: (open: boolean) => void;
  multipliers: {
    GREEN: number[];
    YELLOW: number[];
    RED: number[];
  };

  isConfirmingTransaction: boolean;
  confirmationStage: 'broadcast' | 'mempool' | 'mined' | null;

  showSlotMachineTest: boolean;
  onShowSlotMachineTestChange: (open: boolean) => void;
}

export default function PlinkoModalsHost({
  showPresetModal,
  onShowPresetModalChange,
  onSelectPresetAmount,
  showExtendedHistory,
  onShowExtendedHistoryChange,
  history,
  showPlinkoHistory,
  onShowPlinkoHistoryChange,
  drops,
  stats,
  isHistoryConnected,
  historyPlayerKey,
  onExportHistory,
  onClearHistory,
  playerProfileOpen,
  onClosePlayerProfile,
  playerAddress,
  playerProfileGame,
  showMultiplierTable,
  onShowMultiplierTableChange,
  multipliers,
  isConfirmingTransaction,
  confirmationStage,
  showSlotMachineTest,
  onShowSlotMachineTestChange,
}: PlinkoModalsHostProps) {
  return (
    <>
      <PresetAmountsModal
        open={showPresetModal}
        onOpenChange={onShowPresetModalChange}
        onSelectAmount={onSelectPresetAmount}
      />

      <ExtendedHistoryModal
        open={showExtendedHistory}
        onOpenChange={onShowExtendedHistoryChange}
        history={history}
      />

      <PlinkoHistoryModal
        open={showPlinkoHistory}
        onOpenChange={onShowPlinkoHistoryChange}
        drops={drops}
        stats={stats}
        isConnected={isHistoryConnected}
        playerKey={historyPlayerKey}
        onExport={onExportHistory}
        onClear={onClearHistory}
      />

      <PlayerProfileModal
        isOpen={playerProfileOpen}
        onClose={onClosePlayerProfile}
        address={playerAddress}
        game={playerProfileGame}
      />

      {showMultiplierTable && (
        <div className="surface-modal-shell">
          <div className="surface-modal-card max-w-2xl">
            <div className="bg-gradient-to-r from-cyan-600 to-blue-600 p-4 text-center relative">
              <h2 className="text-2xl font-black text-white">
                Multiplier Table
              </h2>
              <button
                onClick={() => onShowMultiplierTableChange(false)}
                className="absolute top-4 right-4 text-white/60 hover:text-white transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              <div className="bg-slate-800/50 rounded-xl p-4 border-2 border-green-500/30">
                <div className="text-green-400 font-bold text-lg mb-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                  Low Risk (GREEN)
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {multipliers.GREEN.map((mult, idx) => (
                    <div
                      key={idx}
                      className="bg-green-500/10 rounded-lg p-2 text-center border border-green-500/20"
                    >
                      <div className="text-green-400 font-bold text-sm">{mult}x</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4 border-2 border-blue-500/30">
                <div className="text-blue-400 font-bold text-lg mb-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                  Medium Risk (YELLOW)
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {multipliers.YELLOW.map((mult, idx) => (
                    <div
                      key={idx}
                      className="bg-blue-500/10 rounded-lg p-2 text-center border border-blue-500/20"
                    >
                      <div className="text-blue-400 font-bold text-sm">{mult}x</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-4 border-2 border-red-500/30">
                <div className="text-red-400 font-bold text-lg mb-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  High Risk (RED)
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {multipliers.RED.map((mult, idx) => (
                    <div
                      key={idx}
                      className="bg-red-500/10 rounded-lg p-2 text-center border border-red-500/20"
                    >
                      <div className="text-red-400 font-bold text-sm">{mult}x</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-900/50 border-t border-slate-700">
              <button
                onClick={() => onShowMultiplierTableChange(false)}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-bold py-3 px-4 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isConfirmingTransaction && (
        <div className="surface-modal-shell">
          <div className="min-w-60 max-w-lg">
            <SlotMachine
              isSpinning={isConfirmingTransaction}
              confirmationStage={confirmationStage}
              onSpinComplete={() => {
                // no-op for confirmation mode
              }}
            />
          </div>
        </div>
      )}

      {showSlotMachineTest && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="min-w-60 max-w-lg">
            <SlotMachine
              onClose={() => onShowSlotMachineTestChange(false)}
              onSpinComplete={(result) => {
                console.log('Slot result:', result);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
