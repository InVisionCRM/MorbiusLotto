'use client';

import type React from 'react';
import type { PokerTableState } from '@/lib/websocket-client';
import { PokerTableDashboard } from '@/components/poker/PokerTableDashboard';
import { PokerPlayerTableDashboard } from '@/components/poker/PokerPlayerTableDashboard';

interface PokerPanelsProps {
  tableId: string;
  renderedState: PokerTableState | null;
  isAdmin: boolean;
  normalizedAddress: string | null;
  showDashboard: boolean;
  setShowDashboard: React.Dispatch<React.SetStateAction<boolean>>;
  showMyStats: boolean;
  setShowMyStats: React.Dispatch<React.SetStateAction<boolean>>;
}

const MAIN_PANEL_STYLE: React.CSSProperties = {
  maxWidth: 'min(100vw, calc((100dvh - 160px) * 2.4))',
  marginLeft: 'auto',
  marginRight: 'auto',
  width: '100%',
};

export function PokerPanels({
  tableId,
  renderedState,
  isAdmin,
  normalizedAddress,
  showDashboard,
  setShowDashboard,
  showMyStats,
  setShowMyStats,
}: PokerPanelsProps) {
  return (
    <>
      {showDashboard && isAdmin && (
        <div className="flex-1 relative min-h-0 z-[25]">
          <button
            type="button"
            className="absolute inset-0 z-0 cursor-default border-0 bg-black/55 p-0"
            style={{ WebkitTapHighlightColor: 'transparent' }}
            aria-label="Close dashboard"
            onClick={() => setShowDashboard(false)}
          />
          <div className="relative z-10 flex h-full min-h-0 w-full justify-center pointer-events-none">
            <div className="pointer-events-auto h-full min-h-0 overflow-y-auto" style={MAIN_PANEL_STYLE}>
              <PokerTableDashboard tableId={tableId} onClose={() => setShowDashboard(false)} />
            </div>
          </div>
        </div>
      )}

      {showMyStats && normalizedAddress && !showDashboard && (
        <div className="flex-1 relative min-h-0 z-[25]">
          <button
            type="button"
            className="absolute inset-0 z-0 cursor-default border-0 bg-black/55 p-0"
            style={{ WebkitTapHighlightColor: 'transparent' }}
            aria-label="Close table stats panel"
            onClick={() => setShowMyStats(false)}
          />
          <div className="relative z-10 flex h-full min-h-0 w-full justify-center pointer-events-none">
            <div className="pointer-events-auto h-full min-h-0 overflow-y-auto" style={MAIN_PANEL_STYLE}>
              <PokerPlayerTableDashboard
                tableId={tableId}
                state={renderedState}
                onClose={() => setShowMyStats(false)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
