'use client';

import React from 'react';
import RealTimeBetChart from '@/components/PLINKO/RealTimeBetChart';
import { PlinkoDrop, PlinkoPlayerStats } from '@/lib/plinko-types';

type DropSpeed = 'normal' | 'fast' | 'burst';

interface HistoryItem {
  id: number;
  multiplier: number;
  risk: string;
}

interface BetDataPoint {
  dropNumber: number;
  betAmount: number;
  multiplier: number;
  bucketIndex: number;
  timestamp: number;
  profit: number;
  riskLevel: string;
}

interface ChartStats {
  totalBets: number;
  totalWagered: number;
  totalWon: number;
}

interface PlinkoLiveOverlayProps {
  isVisible: boolean;
  sessionStartTime: number;
  contractWagerPerBall: number;
  freePlayWager: number;
  betHistory: BetDataPoint[];
  chartStats: ChartStats;
  drops: PlinkoDrop[];
  stats: PlinkoPlayerStats | null;
  isConnected: boolean;
  playerKey: string;
  onExport: () => void;
  onClear: () => Promise<void>;
  history: HistoryItem[];
  dropSpeed: DropSpeed;
  onDropSpeedChange: (speed: DropSpeed) => void;
}

const DROP_SPEED_OPTIONS: Array<{ speed: DropSpeed; label: string }> = [
  { speed: 'normal', label: 'Normal' },
  { speed: 'fast', label: 'Fast' },
  { speed: 'burst', label: 'Burst' },
];

export default function PlinkoLiveOverlay({
  isVisible,
  sessionStartTime,
  contractWagerPerBall,
  freePlayWager,
  betHistory,
  chartStats,
  drops,
  stats,
  isConnected,
  playerKey,
  onExport,
  onClear,
  history,
  dropSpeed,
  onDropSpeedChange,
}: PlinkoLiveOverlayProps) {
  if (!isVisible) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(325deg, rgba(16, 20, 24, 0.97), rgba(24, 28, 32, 0.97))',
      }}
    >
      <div className="flex-1 min-h-0 p-2">
        <RealTimeBetChart
          sessionStartTime={sessionStartTime}
          contractWagerPerBall={contractWagerPerBall}
          freePlayWager={freePlayWager}
          betHistory={betHistory}
          chartStats={chartStats}
          drops={drops}
          stats={stats}
          isConnected={isConnected}
          playerKey={playerKey}
          onExport={onExport}
          onClear={onClear}
        />
      </div>

      <div className="flex-1 min-h-0 p-2 flex flex-col">
        <div className="text-cyan-300 text-xs font-bold uppercase tracking-wider text-center mb-1">
          Live Results ({history.length})
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="grid grid-cols-4 gap-1.5 px-1">
            {history.length > 0 ? history.slice(0, 100).map((item) => (
              <div
                key={item.id}
                className="rounded-sm px-1 py-1.5 text-center font-black text-sm text-white/60"
                style={{
                  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                  boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6), inset 0 -2px 4px rgba(255, 255, 255, 0.05)',
                }}
              >
                {item.multiplier}x
              </div>
            )) : (
              <div className="col-span-4 text-center text-cyan-300/40 py-4 text-xs italic">
                Waiting for drops...
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 pt-2 border-t border-white/10">
          <div className="grid grid-cols-3 gap-2">
            {DROP_SPEED_OPTIONS.map(({ speed, label }) => (
              <button
                key={speed}
                onClick={() => onDropSpeedChange(speed)}
                className={`py-1.5 rounded-lg text-xs font-bold transition-all touch-manipulation ${
                  dropSpeed === speed
                    ? 'text-cyan-300'
                    : 'text-gray-500 hover:text-gray-400'
                }`}
                style={{
                  boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.03)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
