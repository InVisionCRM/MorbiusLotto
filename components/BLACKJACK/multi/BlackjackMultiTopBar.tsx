'use client';

import type { BJMultiTableState } from '@/lib/websocket-client';

export function BlackjackMultiTopBar({
  tableViewState,
  myPosition,
  onLeaveSeat,
  formatMorbius,
}: {
  tableViewState: BJMultiTableState | null;
  myPosition: number | null;
  onLeaveSeat: () => void;
  formatMorbius: (wei: string) => string;
}) {
  const phase = tableViewState?.phase ?? 'none';
  return (
    <div
      className="relative flex items-center justify-end px-4 py-2 bg-black/30 backdrop-blur-sm"
      data-bj-multi-phase={phase}
    >
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2">
        <span className="text-sm font-semibold text-white/70 whitespace-nowrap">
          {tableViewState
            ? `Round #${tableViewState.roundNumber} · ${formatMorbius(tableViewState.minBet ?? '0')}–${formatMorbius(tableViewState.maxBet ?? '0')} MORBIUS`
            : 'Multiplayer Blackjack'}
        </span>
      </div>

      <div className="flex items-center gap-2 z-10 shrink-0">
        {(tableViewState as any)?.viewerCount > 0 && (
          <span className="text-[10px] text-white/40 flex items-center gap-1">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3" /></svg>
            {(tableViewState as any).viewerCount}
          </span>
        )}
        {myPosition !== null && (
          <button onClick={onLeaveSeat} className="text-xs text-white/90 hover:text-red-400 transition-colors">
            Leave seat
          </button>
        )}
      </div>
    </div>
  );
}
