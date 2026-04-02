'use client';

import React from 'react';
import PlinkoGame from '@/components/PLINKO/PlinkoGame';
import { ContractResult, RiskLevel } from '@/app/PLINKO/types';

type DropSpeed = 'normal' | 'fast' | 'burst';

interface LastDropState {
  id: number;
  risk: RiskLevel;
  contractResult?: ContractResult;
}

interface PlinkoBoardShellProps {
  remainingBalls: number;
  dropSpeed: DropSpeed;
  onToggleBurst: () => void;
  onScore: (multiplier: number, bucketIndex: number, contractData?: any) => void;
  lastDrop: LastDropState | null;
  selectedRiskLevel: RiskLevel;
  soundEnabled: boolean;
  onSoundToggle: (enabled: boolean) => void;
}

export default function PlinkoBoardShell({
  remainingBalls,
  dropSpeed,
  onToggleBurst,
  onScore,
  lastDrop,
  selectedRiskLevel,
  soundEnabled,
  onSoundToggle,
}: PlinkoBoardShellProps) {
  return (
    <div className="flex-1 relative max-[799px]:order-1 min-[600px]:pt-0 pt-20 min-[800px]:pb-12 min-[800px]:p-4 max-[799px]:min-h-[50vh]">
      <div className="absolute inset-0 min-[600px]:left-0 min-[800px]:right-0">
        <div
          className="w-full h-full rounded-2xl relative"
          style={{
            background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
            boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
            border: '1px inset rgba(60, 60, 60, 0.5)',
          }}
        />
      </div>

      <div className="absolute top-1/4 -translate-y-1/4 right-8 z-50">
        {remainingBalls > 0 && (
          <div className="mb-2 text-center">
            <div className="text-cyan-300/80 text-md font-russo-one font-normal">
              {remainingBalls} balls left
            </div>
          </div>
        )}
        <button
          onClick={onToggleBurst}
          disabled={false}
          className={`w-16 h-16 md:w-20 md:h-20 rounded-full font-russo-one font-normal text-sm md:text-md transition-all duration-200 flex items-center justify-center ${
            dropSpeed === 'burst'
              ? 'bg-red-600/30 hover:bg-red-700/30 text-white shadow-[inset_2px_2px_4px_rgba(0,0,0,0.3),inset_-2px_-2px_4px_rgba(255,255,255,0.1)] transform translate-y-0.5 animate-[pulse_0.5s_ease-in-out_infinite] border border-red-400/50'
              : 'bg-cyan-600/30 hover:bg-cyan-700/30 text-white shadow-[2px_2px_4px_rgba(0,0,0,0.3),-2px_-2px_4px_rgba(255,255,255,0.1)] hover:shadow-[3px_3px_6px_rgba(0,0,0,0.3),-3px_-3px_6px_rgba(255,255,255,0.1)]'
          } disabled:opacity-50 disabled:cursor-not-allowed active:scale-95`}
          title={dropSpeed === 'burst' ? 'Switch to Normal Speed' : 'Switch to Burst Speed'}
        >
          BURST
        </button>
      </div>

      <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
        <div className="pointer-events-auto w-full h-full">
          <PlinkoGame
            onScore={onScore}
            lastDrop={lastDrop}
            selectedRiskLevel={selectedRiskLevel}
            soundEnabled={soundEnabled}
            onSoundToggle={onSoundToggle}
          />
        </div>
      </div>
    </div>
  );
}
