'use client';

import React, { useMemo } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Coins, Users } from 'lucide-react';
import { formatChips } from '@/lib/format-poker-chips';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';

const HEADER_SHELL_STYLE: React.CSSProperties = {
  background: 'linear-gradient(145deg, rgba(16, 26, 35, 0.6), rgba(35, 36, 41, 0.6))',
  boxShadow:
    'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
  borderBottom: '1px inset rgba(60, 60, 60, 0.5)',
};

const ACTION_BTN_CLASS =
  'inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold border border-white/[0.08] bg-slate-900/50 text-slate-200 hover:border-cyan-500/30 hover:text-white hover:bg-white/[0.04] transition-colors';

const PRIMARY_ACTION_STYLE: React.CSSProperties = {
  background: 'linear-gradient(135deg, #0891b2, #2563eb)',
  boxShadow: '0 4px 16px rgba(6, 182, 212, 0.2), 0 0 0 1px rgba(34, 211, 238, 0.2)',
};

export interface PokerLobbyDesktopHeaderProps {
  liveTableCount: number;
  playersSeated: number;
  isConnected: boolean;
  morbiusBalanceWei: string | null;
  chipBalance: string | null;
  onDeposit: () => void;
  onWithdraw: () => void;
  onOpenExchange: () => void;
}

function LivePulseDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-400" />
    </span>
  );
}

export function PokerLobbyDesktopHeader({
  liveTableCount,
  playersSeated,
  isConnected,
  morbiusBalanceWei,
  chipBalance,
  onDeposit,
  onWithdraw,
  onOpenExchange,
}: PokerLobbyDesktopHeaderProps) {
  const chipsDisplay = useMemo(
    () => (chipBalance != null ? formatChips(chipBalance) : '—'),
    [chipBalance],
  );
  const playBalanceDisplay = useMemo(
    () => (morbiusBalanceWei != null ? formatMorbiusFloor(morbiusBalanceWei) : '—'),
    [morbiusBalanceWei],
  );

  const tablesLabel =
    liveTableCount > 0
      ? `${liveTableCount} live table${liveTableCount !== 1 ? 's' : ''}`
      : 'No active tables';
  const playersLabel =
    playersSeated > 0
      ? `${playersSeated} player${playersSeated !== 1 ? 's' : ''} seated`
      : 'No players seated';

  return (
    <header
      className="sticky top-0 z-40 hidden md:block relative w-full shrink-0 overflow-hidden border-b border-cyan-500/20 backdrop-blur-sm"
      style={HEADER_SHELL_STYLE}
      aria-label="Poker lobby"
    >
      <div
        className="relative z-10 grid w-full items-center gap-x-8 px-6 lg:px-8 py-3 min-h-[3.25rem]"
        style={{ gridTemplateColumns: 'auto minmax(0, 1fr) auto' }}
      >
        <div className="flex items-center gap-5 justify-self-start">
          <div className="inline-flex items-center gap-2.5 text-cyan-400">
            <LivePulseDot />
            <span className="text-xs font-bold uppercase tracking-[0.18em] whitespace-nowrap">
              {tablesLabel}
            </span>
          </div>
          <span className="text-slate-600" aria-hidden>
            ·
          </span>
          <div className="inline-flex items-center gap-2 text-slate-300">
            <Users size={15} className="text-cyan-400/80 shrink-0" aria-hidden />
            <span className="text-xs font-semibold tracking-wide whitespace-nowrap">{playersLabel}</span>
          </div>
        </div>

        {isConnected ? (
          <div className="flex items-center justify-center gap-8 justify-self-center">
            <div className="shrink-0 text-center min-w-[5.5rem]">
              <div className="text-[10px] uppercase tracking-[0.14em] font-bold text-slate-500 whitespace-nowrap">
                Play balance
              </div>
              <div
                className="text-sm font-bold text-slate-200 tabular-nums whitespace-nowrap"
                title={playBalanceDisplay}
              >
                {playBalanceDisplay}
              </div>
            </div>
            <div className="shrink-0 text-center min-w-[4.5rem]">
              <div className="text-[10px] uppercase tracking-[0.14em] font-bold text-slate-500 whitespace-nowrap">
                Chips
              </div>
              <div
                className="text-sm font-bold text-emerald-300 tabular-nums whitespace-nowrap"
                title={chipsDisplay}
              >
                {chipsDisplay}
              </div>
            </div>
          </div>
        ) : (
          <div aria-hidden />
        )}

        <div className="flex items-center gap-2 justify-self-end">
          <button
            type="button"
            onClick={onDeposit}
            disabled={!isConnected}
            className={`${ACTION_BTN_CLASS} disabled:opacity-40 disabled:pointer-events-none`}
          >
            <ArrowDownCircle size={16} aria-hidden />
            Deposit
          </button>
          <button
            type="button"
            onClick={onWithdraw}
            disabled={!isConnected}
            className={`${ACTION_BTN_CLASS} disabled:opacity-40 disabled:pointer-events-none`}
          >
            <ArrowUpCircle size={16} aria-hidden />
            Withdraw
          </button>
          <button
            type="button"
            onClick={onOpenExchange}
            disabled={!isConnected}
            className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-40 disabled:pointer-events-none"
            style={PRIMARY_ACTION_STYLE}
          >
            <Coins size={16} aria-hidden />
            Exchange
          </button>
        </div>
      </div>
    </header>
  );
}
