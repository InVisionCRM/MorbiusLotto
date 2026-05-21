'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { parseEther } from 'viem';
import { BlackjackMobileActionBar } from '@/components/BLACKJACK/BlackjackMobileActionBar';
import { BettingPanelMobile } from '@/components/BLACKJACK/BettingPanelMobile';
import type { BJMultiHandObj } from '@/lib/websocket-client';

const DEFAULT_TOKEN_LOGO = '/morbius/MorbiusLogo (3).png';
const DEFAULT_TOKEN_TICKER = 'MORBIUS';
const BETTING_TIMEOUT_SECONDS = 15;
const TURN_TIMEOUT_SECONDS = 30;

type SpectatorPhase = 'waiting' | 'betting' | 'playing' | 'dealer_turn' | 'completed' | undefined;

function useNowTick(enabled: boolean, intervalMs = 500) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
  return now;
}

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function getCountdownSeconds(startedAt: string | null, maxSeconds: number, nowMs: number): number | null {
  if (!startedAt) return null;
  const startMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startMs) || startMs <= 0) return null;
  return Math.max(0, maxSeconds - (nowMs - startMs) / 1000);
}

function describePhase(
  phase: SpectatorPhase,
  actingSeatPosition: number | null,
  bettingStartedAt: string | null,
  turnStartedAt: string | null,
  nowMs: number,
): { label: string; countdown: string | null; tone: 'cyan' | 'yellow' | 'amber' | 'green' | 'gray' } {
  if (phase === 'betting') {
    const remaining = getCountdownSeconds(bettingStartedAt, BETTING_TIMEOUT_SECONDS, nowMs);
    return {
      label: 'Bets open',
      countdown: remaining != null ? formatCountdown(remaining) : null,
      tone: 'cyan',
    };
  }
  if (phase === 'playing') {
    const remaining = getCountdownSeconds(turnStartedAt, TURN_TIMEOUT_SECONDS, nowMs);
    const label = actingSeatPosition != null ? `Seat ${actingSeatPosition + 1}'s turn` : 'In play';
    return {
      label,
      countdown: remaining != null ? formatCountdown(remaining) : null,
      tone: 'yellow',
    };
  }
  if (phase === 'dealer_turn') {
    return { label: 'Dealer playing', countdown: null, tone: 'amber' };
  }
  if (phase === 'completed') {
    return { label: 'Round over', countdown: null, tone: 'green' };
  }
  return { label: 'Waiting for players', countdown: null, tone: 'gray' };
}

const TONE_CLASSNAMES: Record<'cyan' | 'yellow' | 'amber' | 'green' | 'gray', string> = {
  cyan: 'text-cyan-300',
  yellow: 'text-yellow-300',
  amber: 'text-amber-300',
  green: 'text-emerald-300',
  gray: 'text-white/60',
};

function SpectatorTickerBar({
  phase,
  actingSeatPosition,
  bettingStartedAt,
  turnStartedAt,
  tableMinBetWhole,
  tableMaxBetWhole,
  tokenLogoUrl,
  tokenTicker,
  onLogoClick,
  onChangeTable,
}: {
  phase: SpectatorPhase;
  actingSeatPosition: number | null;
  bettingStartedAt: string | null;
  turnStartedAt: string | null;
  tableMinBetWhole: number;
  tableMaxBetWhole: number;
  tokenLogoUrl: string;
  tokenTicker: string;
  onLogoClick?: () => void;
  onChangeTable?: () => void;
}) {
  const tickEnabled = phase === 'betting' || phase === 'playing';
  const nowMs = useNowTick(tickEnabled, 500);
  const { label, countdown, tone } = describePhase(phase, actingSeatPosition, bettingStartedAt, turnStartedAt, nowMs);
  const formatThousands = (n: number) => n.toLocaleString('en-US');

  return (
    <section className="w-full px-2 py-1">
      <div className="flex flex-col gap-1 w-full">
        <div className="flex items-center justify-between gap-2 w-full">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-xs uppercase tracking-wider text-cyan-300/80">Spectating</span>
            <span className="text-[10px] sm:text-xs text-gray-500 font-poppins tabular-nums truncate">
              Min {formatThousands(tableMinBetWhole)} · Max {formatThousands(tableMaxBetWhole)}
            </span>
          </div>
          {onChangeTable && (
            <button
              type="button"
              onClick={onChangeTable}
              className="text-cyan-300/80 hover:text-cyan-300 text-xs font-medium shrink-0 transition-colors"
            >
              Change Table
            </button>
          )}
        </div>
        <div
          className="flex items-center w-full rounded-lg border border-white/20 overflow-hidden"
          style={{ minHeight: '36px' }}
          aria-label={`Currently spectating a ${tokenTicker} table`}
        >
          <div className="flex-1 flex items-center gap-2 pl-2 pr-2 min-w-0">
            <span className={`flex-1 min-w-0 truncate font-semibold text-sm ${TONE_CLASSNAMES[tone]}`}>
              {label}
              {countdown && (
                <span className="ml-1.5 text-white/85 font-bold tabular-nums">{countdown}</span>
              )}
            </span>
            <span className="hidden sm:inline text-[11px] text-white/45 font-bold tabular-nums truncate">
              {tokenTicker}
            </span>
            {onLogoClick ? (
              <button
                type="button"
                onClick={onLogoClick}
                className="shrink-0 rounded-full p-0.5 hover:bg-white/10 active:bg-white/15 transition-colors"
                aria-label={`Switch table (current: ${tokenTicker})`}
                title={`Switch table — currently ${tokenTicker}`}
              >
                <Image
                  src={tokenLogoUrl}
                  alt={tokenTicker}
                  width={20}
                  height={20}
                  className="object-contain"
                  unoptimized
                />
              </button>
            ) : (
              <Image
                src={tokenLogoUrl}
                alt={tokenTicker}
                width={20}
                height={20}
                className="object-contain flex-shrink-0"
                unoptimized
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export function BlackjackMultiBetActionPanel({
  myPosition,
  phase,
  hasBet,
  consecutiveTimeouts,
  afkTimeoutsBeforeKick,
  betAmount,
  setBetAmount,
  tableMinBetWhole,
  tableMaxBetWhole,
  playerBalanceWei,
  isMyTurn,
  activeHand,
  doAction,
  soundEnabled,
  playSound,
  placeBet,
  tokenLogoUrl,
  tokenTicker,
  onChangeTable,
  onLogoClick,
  actingSeatPosition,
  bettingStartedAt,
  turnStartedAt,
}: {
  myPosition: number | null;
  phase: SpectatorPhase;
  hasBet: boolean;
  consecutiveTimeouts: number;
  afkTimeoutsBeforeKick: number;
  betAmount: string;
  setBetAmount: (value: string) => void;
  tableMinBetWhole: number;
  tableMaxBetWhole: number;
  playerBalanceWei: bigint;
  isMyTurn: boolean;
  activeHand: BJMultiHandObj | null;
  doAction: (action: 'hit' | 'stand' | 'double_down' | 'split') => void;
  soundEnabled: boolean;
  playSound: (path: string, volume?: number) => void;
  placeBet: () => void;
  tokenLogoUrl?: string | null;
  tokenTicker?: string | null;
  onChangeTable?: () => void;
  onLogoClick?: () => void;
  actingSeatPosition?: number | null;
  bettingStartedAt?: string | null;
  turnStartedAt?: string | null;
}) {
  const resolvedLogo = tokenLogoUrl && tokenLogoUrl.trim() !== '' ? tokenLogoUrl : DEFAULT_TOKEN_LOGO;
  const resolvedTicker = tokenTicker && tokenTicker.trim() !== '' ? tokenTicker : DEFAULT_TOKEN_TICKER;

  if (myPosition === null) {
    return (
      <SpectatorTickerBar
        phase={phase}
        actingSeatPosition={actingSeatPosition ?? null}
        bettingStartedAt={bettingStartedAt ?? null}
        turnStartedAt={turnStartedAt ?? null}
        tableMinBetWhole={tableMinBetWhole}
        tableMaxBetWhole={tableMaxBetWhole}
        tokenLogoUrl={resolvedLogo}
        tokenTicker={resolvedTicker}
        onLogoClick={onLogoClick}
        onChangeTable={onChangeTable}
      />
    );
  }

  const tableBetLimits = {
    MIN_BET: parseEther(String(tableMinBetWhole)),
    MAX_BET: parseEther(String(tableMaxBetWhole)),
  };

  return (
    <div className="flex flex-row md:flex-col items-stretch w-full">
      <div className="w-1/2 md:w-full md:border-r-0 md:border-b border-r border-white/10 flex items-center min-w-0">
        <BettingPanelMobile
          onStartGame={() => {}}
          isPlaying={phase !== 'betting' || hasBet}
          onBetAmountChange={(val) => setBetAmount(val)}
          currentBetAmount={betAmount}
          onHalfBet={() => {
            const cur = parseInt(betAmount || '0', 10);
            const half = Math.max(tableMinBetWhole, Math.floor(cur / 2));
            setBetAmount(String(half));
          }}
          onDoubleBet={() => {
            const cur = parseInt(betAmount || '0', 10);
            const doubled = Math.min(tableMaxBetWhole, cur * 2);
            setBetAmount(String(doubled));
          }}
          playerReserves={playerBalanceWei}
          betLimits={tableBetLimits}
          logoUrl={resolvedLogo}
          logoAlt={resolvedTicker}
          onLogoClick={onLogoClick}
        />
      </div>
      <div className="w-1/2 md:w-full flex items-stretch min-w-0">
        {isMyTurn && activeHand ? (
          <BlackjackMobileActionBar
            onAction={(action) => doAction(action as 'hit' | 'stand' | 'double_down' | 'split')}
            isPlaying
            canHit={activeHand.canHit}
            canStand={activeHand.canStand}
            canDoubleDown={activeHand.canDoubleDown}
            canSplit={activeHand.canSplit}
            canDeal={false}
            chipStackLength={0}
            lastBetAmount="0"
            soundEnabled={soundEnabled}
            onPlaySfx={playSound}
            alwaysVisible
            hideDealRow
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 p-2">
            {phase === 'betting' && !hasBet && (
              <>
                {consecutiveTimeouts > 0 && (
                  <div
                    className={`rounded-lg border px-2.5 py-1.5 text-center text-[11px] font-semibold leading-snug w-full ${
                      consecutiveTimeouts >= afkTimeoutsBeforeKick - 1
                        ? 'border-orange-500/40 bg-orange-950/40 text-orange-100'
                        : 'border-cyan-500/30 bg-slate-900/80 text-cyan-100/90'
                    }`}
                    style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}
                  >
                    Idle {consecutiveTimeouts}/{afkTimeoutsBeforeKick}
                  </div>
                )}
                {(() => {
                  const parsedBet = parseInt(betAmount || '0', 10);
                  const betOk = parsedBet >= tableMinBetWhole && parsedBet <= tableMaxBetWhole;
                  return (
                    <button
                      type="button"
                      onClick={placeBet}
                      disabled={!betOk}
                      className={`w-full py-2.5 rounded-xl font-black text-sm tracking-wider transition-all border-2 ${
                        betOk
                          ? 'text-white border-emerald-400/45 active:scale-95 enabled:hover:brightness-105'
                          : 'text-white/55 border-cyan-500/35 bg-[rgba(34,211,238,0.07)] cursor-not-allowed shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                      }`}
                      style={
                        betOk
                          ? {
                              background: 'linear-gradient(180deg, #22c55e 0%, #16a34a 50%, #15803d 100%)',
                              boxShadow: '0 4px 0 0 rgba(0,0,0,0.25), 0 2px 4px rgba(0,0,0,0.15)',
                            }
                          : undefined
                      }
                    >
                      CONFIRM BET
                    </button>
                  );
                })()}
              </>
            )}
            {phase === 'betting' && hasBet && (
              <div className="text-center py-1 text-green-400 font-semibold text-sm">
                Bet placed — waiting
              </div>
            )}
            {phase !== 'betting' && !isMyTurn && (
              <div className="text-center text-white/30 text-xs py-2">
                Waiting...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
