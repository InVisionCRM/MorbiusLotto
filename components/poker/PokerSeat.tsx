'use client';

import React from 'react';
import { formatEther } from 'viem';
import { CardDisplay } from './CardDisplay';
import type { PokerSeatState as SeatState } from '@/lib/websocket-client';

function formatChips(wei: string): string {
  try {
    const num = Number(formatEther(BigInt(wei)));
    return Number.isInteger(num)
      ? num.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return wei;
  }
}

export interface PokerSeatProps {
  seat: SeatState;
  index: number;
  holeCards?: number[];
  isCurrentPlayer?: boolean;
  showCardBacks?: boolean;
  lastAction?: { action: string; amount: string } | null;
  /** Seconds remaining in turn timer (0-30). Only provided for the acting seat. */
  timeLeft?: number;
}

function shortAddr(addr: string): string {
  return addr.slice(-4);
}

function formatLastAction(action: string, amount: string): string {
  const a = action.toLowerCase();
  if (a === 'fold') return 'Fold';
  if (a === 'check') return 'Check';
  if (a === 'call') return 'Call';
  if (a === 'bet') return `Bet ${formatChips(amount)}`;
  if (a === 'raise') return `Raise ${formatChips(amount)}`;
  if (a === 'all-in' || a === 'allin') return 'All-in';
  if (a === 'blind') return '';
  return action;
}

/** Small pill for dealer / blind roles */
function RoleBadge({ label, gold }: { label: string; gold?: boolean }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold border leading-none"
      style={
        gold
          ? { color: 'var(--poker-chip)', borderColor: 'var(--poker-chip)', background: 'color-mix(in srgb, var(--poker-chip) 18%, transparent)' }
          : { color: 'var(--poker-text-muted)', borderColor: 'var(--poker-panel-border)', background: 'color-mix(in srgb, var(--poker-text-muted) 10%, transparent)' }
      }
    >
      {label}
    </span>
  );
}

export function PokerSeat({ seat, holeCards, isCurrentPlayer, showCardBacks, lastAction, timeLeft }: PokerSeatProps) {
  const empty = !seat.playerAddress;
  const showMyCards = !!(holeCards && holeCards.length > 0);
  const showBacks = !!(showCardBacks && !showMyCards && !empty && !seat.folded);
  const hasCards = showMyCards || showBacks;

  const isActing = !!seat.isActing && !empty && !seat.folded;
  const isFolded = !!seat.folded && !empty;

  const currentBetBig = (() => {
    try { return BigInt(seat.currentBet || '0') > 0n; } catch { return false; }
  })();

  const displayName = empty ? 'Empty' : (isCurrentPlayer ? 'You' : shortAddr(seat.playerAddress!));

  /* ── Empty seat ── */
  if (empty) {
    return (
      <div className="flex flex-col items-center gap-1 select-none opacity-40">
        <div
          className="rounded-full px-3 py-1.5 border border-dashed text-[10px] sm:text-xs"
          style={{ borderColor: 'var(--poker-text-muted)', color: 'var(--poker-text-muted)' }}
        >
          Empty
        </div>
      </div>
    );
  }

  /* ── Occupied seat ── */
  return (
    <div
      className={`poker-seat flex flex-col items-center gap-1 select-none transition ${isFolded ? 'opacity-50' : 'opacity-100'} ${isActing ? 'acting' : ''}`}
      aria-label={`Seat ${displayName}`}
    >
      {/* Role badges above cards */}
      {(seat.isDealer || seat.isSmallBlind || seat.isBigBlind) && (
        <div className="flex items-center gap-1 mb-0.5">
          {seat.isDealer && <RoleBadge label="D" gold />}
          {seat.isSmallBlind && <RoleBadge label="SB" />}
          {seat.isBigBlind && <RoleBadge label="BB" />}
        </div>
      )}

      {/* Fanned cards */}
      {hasCards ? (
        <div className="relative" style={{ width: 'clamp(52px, 14vw, 68px)', height: 'clamp(62px, 17vw, 80px)' }}>
          {/* Left card */}
          <div
            className="absolute"
            style={{
              bottom: 0,
              left: 0,
              zIndex: 1,
              transform: 'rotate(-10deg)',
              transformOrigin: 'bottom center',
              filter: isFolded ? 'grayscale(1) opacity(0.6)' : undefined,
            }}
          >
            {showMyCards
              ? <CardDisplay cardIndex={holeCards![0]} small />
              : <CardDisplay cardIndex={null} small faceDown />}
          </div>
          {/* Right card */}
          <div
            className="absolute"
            style={{
              bottom: 0,
              right: 0,
              zIndex: 2,
              transform: 'rotate(10deg)',
              transformOrigin: 'bottom center',
              filter: isFolded ? 'grayscale(1) opacity(0.6)' : undefined,
            }}
          >
            {showMyCards
              ? <CardDisplay cardIndex={holeCards![1]} small />
              : <CardDisplay cardIndex={null} small faceDown />}
          </div>

          {/* Acting glow ring */}
          {isActing && (
            <div
              className="pointer-events-none absolute -inset-2 rounded-full blur-md opacity-60 animate-pulse"
              style={{ background: 'radial-gradient(circle, var(--poker-accent-muted), transparent 70%)' }}
              aria-hidden
            />
          )}
        </div>
      ) : (
        /* No cards yet — spacer so badge stays aligned */
        <div style={{ width: '52px', height: '66px' }} />
      )}

      {/* "YOUR TURN" banner + countdown bar — only for the local player's turn */}
      {isActing && isCurrentPlayer && (
        <div className="flex flex-col items-center gap-0.5 w-full">
          <span
            className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full"
            style={{
              color: 'var(--poker-bg)',
              background: 'var(--poker-accent)',
              boxShadow: '0 0 8px var(--poker-accent-muted)',
            }}
          >
            Your Turn
          </span>
          {timeLeft != null && (
            <div
              className="w-full rounded-full overflow-hidden"
              style={{ height: '3px', background: 'rgba(255,255,255,0.12)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${Math.max(0, (timeLeft / 30) * 100)}%`,
                  background: timeLeft <= 8
                    ? 'var(--poker-danger)'
                    : timeLeft <= 15
                      ? 'var(--poker-chip)'
                      : 'var(--poker-accent)',
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Timer countdown for OTHER players' turns (just the number) */}
      {isActing && !isCurrentPlayer && timeLeft != null && (
        <span
          className="text-[9px] font-bold tabular-nums"
          style={{ color: timeLeft <= 8 ? 'var(--poker-danger)' : 'var(--poker-text-muted)' }}
        >
          {timeLeft}s
        </span>
      )}

      {/* Info pill */}
      <div
        className={`flex items-center gap-1.5 rounded-full px-2 py-1 border transition ${isActing ? 'acting-badge' : ''}`}
        style={{
          background: 'rgba(0,0,0,0.65)',
          borderColor: isActing ? 'var(--poker-accent)' : (isCurrentPlayer ? 'var(--poker-chip)' : 'rgba(255,255,255,0.12)'),
          backdropFilter: 'blur(8px)',
          boxShadow: isActing ? '0 0 12px var(--poker-accent-muted)' : '0 2px 10px rgba(0,0,0,0.5)',
          minWidth: '80px',
          maxWidth: '110px',
        }}
      >
        {/* Icon */}
        <div
          className="flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-[10px]"
          style={{
            background: isCurrentPlayer ? 'color-mix(in srgb, var(--poker-chip) 25%, transparent)' : 'rgba(255,255,255,0.08)',
            border: `1px solid ${isCurrentPlayer ? 'var(--poker-chip)' : 'rgba(255,255,255,0.15)'}`,
            color: isCurrentPlayer ? 'var(--poker-chip)' : 'var(--poker-text-muted)',
          }}
        >
          {isCurrentPlayer ? '🛡' : '●'}
        </div>

        {/* Name + chips */}
        <div className="flex flex-col leading-none min-w-0">
          <span
            className="text-[10px] sm:text-[11px] font-semibold truncate"
            style={{ color: 'var(--poker-text)' }}
          >
            {displayName}
          </span>
          <span
            className="text-[10px] sm:text-[11px] font-bold tabular-nums truncate"
            style={{ color: 'var(--poker-chip)' }}
          >
            {formatChips(seat.stack)}
          </span>
        </div>
      </div>

      {/* Current bet chip */}
      {currentBetBig && (
        <div className="flex items-center gap-0.5">
          <div
            className="h-2.5 w-2.5 rounded-full border"
            style={{ borderColor: 'var(--poker-chip)', background: 'color-mix(in srgb, var(--poker-chip) 30%, transparent)' }}
          />
          <span className="text-[9px] font-semibold tabular-nums" style={{ color: 'var(--poker-chip)' }}>
            {formatChips(seat.currentBet)}
          </span>
        </div>
      )}

      {/* Last action toast */}
      {lastAction && lastAction.action !== 'blind' && (
        <span
          className="text-[9px] sm:text-[10px] font-semibold rounded-full px-1.5 py-0.5 animate-pulse"
          style={{
            color: lastAction.action === 'fold' ? 'var(--poker-danger)' : 'var(--poker-chip)',
            background: lastAction.action === 'fold'
              ? 'color-mix(in srgb, var(--poker-danger) 15%, transparent)'
              : 'color-mix(in srgb, var(--poker-chip) 15%, transparent)',
          }}
        >
          {formatLastAction(lastAction.action, lastAction.amount)}
        </span>
      )}

      {isFolded && !lastAction && (
        <span className="text-[9px]" style={{ color: 'var(--poker-danger)' }}>Folded</span>
      )}

      <style jsx>{`
        .poker-seat.acting .acting-badge {
          animation: badgePulse 1.25s ease-in-out infinite;
        }
        @keyframes badgePulse {
          0%, 100% { box-shadow: 0 0 8px var(--poker-accent-muted); }
          50% { box-shadow: 0 0 18px var(--poker-accent-muted), 0 0 6px var(--poker-accent); }
        }
      `}</style>
    </div>
  );
}
