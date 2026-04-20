'use client';

import React from 'react';
import { parseEther } from 'viem';
import { BlackjackMobileActionBar } from '@/components/BLACKJACK/BlackjackMobileActionBar';
import { BettingPanelMobile } from '@/components/BLACKJACK/BettingPanelMobile';
import type { BJMultiHandObj } from '@/lib/websocket-client';

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
}: {
  myPosition: number | null;
  phase: 'waiting' | 'betting' | 'playing' | 'dealer_turn' | 'completed' | undefined;
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
}) {
  if (myPosition === null) return null;

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
