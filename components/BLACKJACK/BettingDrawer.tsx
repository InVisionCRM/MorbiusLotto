'use client';

import React, { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import BettingPanel from './BettingPanel';
import BlackjackRealTimeBetChart, { BlackjackRealTimeBetChartRef } from './RealTimeBetChart';

interface BettingDrawerProps {
  onStartGame: (betAmount: bigint, clientSeed: string) => void;
  isPlaying: boolean;
  reserveBalance: bigint;
  chartRef: React.RefObject<BlackjackRealTimeBetChartRef>;
  sessionStartTime: number;
}

const BettingDrawer: React.FC<BettingDrawerProps> = ({
  onStartGame,
  isPlaying,
  reserveBalance,
  chartRef,
  sessionStartTime,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 transition-all duration-300 ease-in-out"
      style={{
        transform: isExpanded ? 'translateY(0)' : 'translateY(calc(100% - 120px))',
      }}
    >
      <div
        className="w-full mx-auto rounded-t-3xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
          boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 -4px 16px rgba(0, 0, 0, 0.6)',
          border: '1px solid rgba(60, 60, 60, 0.5)',
          borderBottom: 'none',
          maxWidth: '1200px',
        }}
      >
        {/* Toggle Button */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 hover:bg-black/20 transition-colors"
          style={{
            borderBottom: isExpanded ? '1px solid rgba(60, 60, 60, 0.5)' : 'none',
          }}
        >
          <div className="h-1 w-12 rounded-full bg-cyan-500/30" />
          <span className="text-cyan-300/60 text-xs font-bold uppercase tracking-wider">
            {isExpanded ? 'Hide Chart' : 'Show Chart'}
          </span>
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-cyan-300/60" />
          ) : (
            <ChevronUp className="w-4 h-4 text-cyan-300/60" />
          )}
        </button>

        {/* Content Container */}
        <div className="flex flex-col">
          {/* Betting Controls - Always Visible */}
          <div className="px-4 pb-4">
            <BettingPanel
              onStartGame={onStartGame}
              isPlaying={isPlaying}
              reserveBalance={reserveBalance}
            />
          </div>

          {/* Chart - Expandable */}
          <div
            className="overflow-hidden transition-all duration-300 ease-in-out"
            style={{
              maxHeight: isExpanded ? '500px' : '0',
              opacity: isExpanded ? 1 : 0,
            }}
          >
            <div className="px-3 pb-2">
              <div className="h-64">
                <BlackjackRealTimeBetChart
                  ref={chartRef}
                  sessionStartTime={sessionStartTime}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BettingDrawer;
