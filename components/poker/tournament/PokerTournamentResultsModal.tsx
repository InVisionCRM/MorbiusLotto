'use client';

import React from 'react';
import type { PokerTournamentCompletedPayload, PokerTournamentStandingRow } from '@/lib/poker-tournament-completed';
import { formatChips, toChipInt } from '@/lib/format-poker-chips';

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function finishOrdinal(rank: number): string {
  const j = rank % 10;
  const k = rank % 100;
  if (j === 1 && k !== 11) return `${rank}st`;
  if (j === 2 && k !== 12) return `${rank}nd`;
  if (j === 3 && k !== 13) return `${rank}rd`;
  return `${rank}th`;
}

function formatDurationMs(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function BlockDivider() {
  return <div className="mx-5 h-px" style={{ background: 'rgba(255,255,255,0.07)' }} />;
}

function StatBlock({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 px-2 py-2 min-w-0 flex-1">
      <span
        className="font-jost-normal text-[9px] uppercase tracking-[0.16em] text-center"
        style={{ color: 'rgba(255,255,255,0.45)' }}
      >
        {label}
      </span>
      <span
        className="font-jost text-[18px] sm:text-[22px] tabular-nums leading-none text-center break-words w-full"
        style={{ color: 'rgba(255,255,255,0.96)', letterSpacing: '-0.01em' }}
      >
        {value}
      </span>
      {sub ? (
        <span className="font-jost-normal text-[9px] text-center" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {sub}
        </span>
      ) : null}
    </div>
  );
}

export interface PokerTournamentResultsModalProps {
  payload: PokerTournamentCompletedPayload;
  myAddress?: string | null;
  onDismiss: () => void;
}

export function PokerTournamentResultsModal({ payload, myAddress, onDismiss }: PokerTournamentResultsModalProps) {
  const me = myAddress?.toLowerCase() ?? null;
  const rows = payload.standings;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm">
      <div
        className="relative w-full max-w-lg max-h-[min(92vh,720px)] flex flex-col overflow-hidden border border-white/10 font-jost"
        style={{
          background: 'rgba(6,8,12,0.96)',
          boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.78), inset 0 -2px 5px rgba(255,255,255,0.04), 0 20px 60px rgba(0,0,0,0.75)',
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="poker-tournament-results-title"
      >
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.08),transparent_55%)]" />

        <div className="relative shrink-0 px-5 pt-5 pb-3 border-b border-white/10">
          <h2
            id="poker-tournament-results-title"
            className="font-jost text-center leading-[0.95] break-words uppercase"
            style={{
              fontSize: 22,
              color: 'rgba(255,255,255,0.98)',
              letterSpacing: '-0.02em',
            }}
          >
            {payload.name}
          </h2>
          <p
            className="mt-1.5 font-jost-normal text-[10px] tracking-[0.18em] uppercase text-center"
            style={{ color: 'rgba(255,255,255,0.5)' }}
          >
            Tournament complete
          </p>
        </div>

        <div className="relative flex-1 min-h-0 overflow-y-auto px-0 py-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.12) transparent' }}>
          <div className="flex flex-row divide-x divide-white/10 px-2">
            <StatBlock label="Hands played" value={payload.totalHands.toLocaleString()} />
            <StatBlock label="Table time" value={formatDurationMs(payload.elapsedMs)} />
            <StatBlock
              label="Prize pool"
              value={formatChips(payload.grossPrizePoolChips)}
              sub="chips"
            />
          </div>

          <BlockDivider />

          <div className="px-5 py-3 space-y-3">
            <div
              className="font-jost-normal text-[10px] uppercase tracking-[0.18em] text-center"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              Fees & rake
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
              <div className="rounded-md border border-white/[0.07] bg-white/[0.03] px-3 py-2">
                <div className="font-jost-normal text-[9px] uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.42)' }}>
                  Hand rake
                </div>
                <div className="font-jost text-[15px] tabular-nums mt-0.5" style={{ color: 'rgba(255,255,255,0.92)' }}>
                  {formatChips(payload.handRakeTotalChips)}
                </div>
                <div className="font-jost-normal text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  chips
                </div>
              </div>
              <div className="rounded-md border border-white/[0.07] bg-white/[0.03] px-3 py-2">
                <div className="font-jost-normal text-[9px] uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.42)' }}>
                  Protocol
                </div>
                <div className="font-jost text-[15px] tabular-nums mt-0.5" style={{ color: 'rgba(255,255,255,0.92)' }}>
                  {formatChips(payload.platformFeeChips)}
                </div>
                <div className="font-jost-normal text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  chips
                </div>
              </div>
              <div className="rounded-md border border-white/[0.07] bg-white/[0.03] px-3 py-2">
                <div className="font-jost-normal text-[9px] uppercase tracking-[0.14em]" style={{ color: 'rgba(255,255,255,0.42)' }}>
                  Creator fee
                </div>
                <div className="font-jost text-[15px] tabular-nums mt-0.5" style={{ color: 'rgba(255,255,255,0.92)' }}>
                  {formatChips(payload.creatorFeeChips)}
                </div>
                <div className="font-jost-normal text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  chips
                </div>
              </div>
            </div>
          </div>

          <BlockDivider />

          <div className="px-4 pt-2 pb-1">
            <div
              className="font-jost-normal text-[10px] uppercase tracking-[0.18em] text-center mb-2"
              style={{ color: 'rgba(255,255,255,0.45)' }}
            >
              Final standings
            </div>
            <div className="rounded-md border border-white/[0.07] overflow-hidden">
              <div
                className="grid grid-cols-[2.5rem_1fr_1fr] gap-2 px-3 py-2 font-jost-normal text-[9px] uppercase tracking-[0.12em]"
                style={{ color: 'rgba(255,255,255,0.38)', background: 'rgba(255,255,255,0.04)' }}
              >
                <span>#</span>
                <span>Player</span>
                <span className="text-right">Payout (chips)</span>
              </div>
              {rows.map((r: PokerTournamentStandingRow) => {
                const isMe = me != null && r.address.toLowerCase() === me;
                const payoutBn = toChipInt(r.prizeAmount);
                const payoutZero = payoutBn === 0n;
                return (
                  <div
                    key={`${r.rank}-${r.address}`}
                    className="grid grid-cols-[2.5rem_1fr_1fr] gap-2 items-center px-3 py-2 border-t border-white/[0.06]"
                    style={{
                      background: isMe ? 'rgba(255,255,255,0.06)' : 'transparent',
                      borderLeft: isMe ? '2px solid rgba(255,255,255,0.45)' : '2px solid transparent',
                    }}
                  >
                    <span className="font-jost text-[13px] tabular-nums" style={{ color: 'rgba(255,255,255,0.55)' }}>
                      {finishOrdinal(r.rank)}
                    </span>
                    <span
                      className="font-jost-normal text-[12px] truncate min-w-0"
                      style={{ color: isMe ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.78)' }}
                    >
                      {shortAddr(r.address)}
                    </span>
                    <span
                      className="font-jost text-[12px] tabular-nums text-right"
                      style={{ color: payoutZero ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.95)' }}
                    >
                      {formatChips(payoutBn)}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="font-jost-normal text-[9px] text-center mt-2" style={{ color: 'rgba(255,255,255,0.32)' }}>
              Payouts credit your off-chain poker chip wallet. Hand rake is normally zero in SNGs.
            </p>
          </div>
        </div>

        <div className="relative shrink-0 px-5 py-4 border-t border-white/10 bg-black/30">
          <button
            type="button"
            onClick={onDismiss}
            className="w-full font-jost text-sm font-medium tracking-wide py-3 rounded-md border border-cyan-500/35 bg-gradient-to-r from-cyan-600/25 to-blue-600/20 text-white hover:from-cyan-600/35 hover:to-blue-600/30 transition-colors"
          >
            Back to tournaments
          </button>
        </div>
      </div>
    </div>
  );
}
