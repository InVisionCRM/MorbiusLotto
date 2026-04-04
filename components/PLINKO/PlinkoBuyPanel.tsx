'use client';

import React from 'react';
import { formatEther, parseEther } from 'viem';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import RealTimeBetChart, { type BetDataPoint } from '@/components/PLINKO/RealTimeBetChart';
import PlinkoLiveOverlay from '@/components/PLINKO/PlinkoLiveOverlay';
import { calculateWplsAmount } from '@/hooks/use-wpls-price';
import { PlinkoDrop, PlinkoPlayerStats } from '@/lib/plinko-types';
import { RiskLevel } from '@/app/PLINKO/types';

type DropSpeed = 'normal' | 'fast' | 'burst';

interface HistoryItem {
  id: number;
  multiplier: number;
  risk: RiskLevel;
}

interface ChartStats {
  totalBets: number;
  totalWagered: number;
  totalWon: number;
}

interface PlinkoBuyPanelProps {
  freePlayEnabled: boolean;
  isGameRunning: boolean;
  chartSessionStartTime: number;
  wagerPerBall: number;
  currentWager: number;
  betHistory: BetDataPoint[];
  chartStats: ChartStats;
  drops: PlinkoDrop[];
  stats: PlinkoPlayerStats | null;
  isHistoryConnected: boolean;
  historyPlayerKey: string;
  onExportHistory: () => void;
  onClearHistory: () => Promise<void>;
  history: HistoryItem[];
  dropSpeed: DropSpeed;
  onDropSpeedChange: (speed: DropSpeed) => void;
  onShowMultiplierTable: () => void;
  buyRiskLevel: RiskLevel;
  onBuyRiskLevelChange: (risk: RiskLevel) => void;
  shouldDisableControls: boolean;
  minWager: number;
  maxWager: number;
  buyBallsCount: number;
  onBuyBallsCountChange: (count: number) => void;
  onWagerPerBallChange: (wager: number) => void;
  usePLS: boolean;
  onUsePLSChange: (enabled: boolean) => void;
  priceError: unknown;
  isLoadingPrice: boolean;
  morbiusPerPLS?: number;
  priceSource?: string;
  wplsPerMORBIUS?: bigint;
  isConnected: boolean;
  isConfirmingTransaction: boolean;
  isApproving: boolean;
  hasPendingPurchase: boolean;
  animationQueueLength: number;
  isAnimating: boolean;
  onBuyBalls: (count: number, wagerPerBallMORBIUS: number, useNativePLS: boolean) => void;
}

const SPEED_OPTIONS: Array<{ speed: DropSpeed; label: string }> = [
  { speed: 'normal', label: 'Normal' },
  { speed: 'fast', label: 'Fast' },
  { speed: 'burst', label: 'Burst' },
];

export default function PlinkoBuyPanel({
  freePlayEnabled,
  isGameRunning,
  chartSessionStartTime,
  wagerPerBall,
  currentWager,
  betHistory,
  chartStats,
  drops,
  stats,
  isHistoryConnected,
  historyPlayerKey,
  onExportHistory,
  onClearHistory,
  history,
  dropSpeed,
  onDropSpeedChange,
  onShowMultiplierTable,
  buyRiskLevel,
  onBuyRiskLevelChange,
  shouldDisableControls,
  minWager,
  maxWager,
  buyBallsCount,
  onBuyBallsCountChange,
  onWagerPerBallChange,
  usePLS,
  onUsePLSChange,
  priceError,
  isLoadingPrice,
  morbiusPerPLS,
  priceSource,
  wplsPerMORBIUS,
  isConnected,
  isConfirmingTransaction,
  isApproving,
  hasPendingPurchase,
  animationQueueLength,
  isAnimating,
  onBuyBalls,
}: PlinkoBuyPanelProps) {
  return (
    <div className="order-2 lg:order-1 lg:flex lg:w-[320px] xl:w-[360px] 2xl:w-[400px] lg:flex-col lg:p-1 lg:overflow-hidden lg:relative lg:z-20 lg:self-stretch lg:min-h-0 flex flex-col min-h-0">
      {!freePlayEnabled && (
        <div
          className="relative rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0 lg:min-h-0 lg:h-full"
          style={{
            background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
            boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
            border: '1px inset rgba(60, 60, 60, 0.5)',
          }}
        >
          <div className="relative flex min-h-0 flex-col border-b border-white/10 lg:flex-1 lg:basis-0">
            <PlinkoLiveOverlay
              isVisible={isGameRunning}
              history={history}
              dropSpeed={dropSpeed}
              onDropSpeedChange={onDropSpeedChange}
            />

            <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-start overflow-y-visible overscroll-contain p-3 lg:overflow-y-auto lg:p-3 xl:p-4 2xl:p-5">
              <button
                onClick={onShowMultiplierTable}
                className="absolute top-2 right-3 text-white/50 hover:text-cyan-300 text-xs font-medium transition-colors"
              >
                Risk Tables
              </button>

              <div className="grid grid-cols-2 gap-2 mb-2 lg:mb-3">
                <div className="col-span-2">
                  <label className="block text-cyan-300 text-center text-sm uppercase font-bold mb-1">Risk Level</label>
                  <RadioGroup
                    value={buyRiskLevel}
                    onValueChange={(value) => { if (!shouldDisableControls) onBuyRiskLevelChange(value as RiskLevel); }}
                    className="flex flex-row gap-2"
                  >
                    {(['GREEN', 'YELLOW', 'RED'] as RiskLevel[]).map((risk, index) => {
                      const labels = ['Low', 'Medium', 'High'];
                      const isSelected = buyRiskLevel === risk;
                      return (
                        <label
                          key={risk}
                          htmlFor={shouldDisableControls ? undefined : `buy-${risk}`}
                          className={`flex-1 rounded-lg p-2 text-center transition ${
                            shouldDisableControls ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                          } ${
                            isSelected
                              ? 'bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 text-cyan-300 shadow-lg'
                              : 'text-white/40 hover:text-white/60'
                          }`}
                          style={{
                            boxShadow: isSelected
                              ? 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.03)'
                              : 'inset 2px 2px 4px rgba(0, 0, 0, 0.2), inset -2px -2px 4px rgba(255, 255, 255, 0.02)'
                          }}
                        >
                          <RadioGroupItem value={risk} id={`buy-${risk}`} className="hidden" disabled={shouldDisableControls} />
                          <div className="text-xs font-bold">{labels[index]}</div>
                        </label>
                      );
                    })}
                  </RadioGroup>
                </div>

                <div>
                  <label className="block text-center text-cyan-300/80 text-sm lg:text-sm xl:text-md font-bold mb-1">Wager/Ball</label>
                  <input
                    type="number"
                    min={minWager}
                    max={maxWager}
                    value={wagerPerBall}
                    onChange={(e) => {
                      const value = parseInt(e.target.value) || minWager;
                      onWagerPerBallChange(Math.max(minWager, Math.min(maxWager, value)));
                    }}
                    disabled={shouldDisableControls}
                    className={`w-full h-9 lg:h-10 xl:h-11 rounded-lg px-2 text-cyan-300 text-center text-base lg:text-base xl:text-lg font-bold focus:outline-none bg-transparent border-none ${shouldDisableControls ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={{
                      boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.03)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-center text-cyan-300/80 text-sm lg:text-sm xl:text-md font-bold mb-1">Balls</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={buyBallsCount}
                    onChange={(e) => onBuyBallsCountChange(parseInt(e.target.value) || 1)}
                    disabled={shouldDisableControls}
                    className={`w-full h-9 lg:h-10 xl:h-11 rounded-lg px-2 text-cyan-300 text-center text-base lg:text-base xl:text-lg font-bold focus:outline-none bg-transparent border-none ${shouldDisableControls ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={{
                      boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.03)',
                    }}
                  />
                </div>

                <div className="grid grid-cols-4 gap-0">
                  {[10, 100, 500, 1000].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => onWagerPerBallChange(Math.max(minWager, Math.min(maxWager, amount)))}
                      disabled={shouldDisableControls}
                      className={`py-2 text-center text-xs font-bold transition-all touch-manipulation ${
                        wagerPerBall === amount
                          ? 'text-cyan-300'
                          : 'text-gray-500 hover:text-gray-400'
                      } ${
                        shouldDisableControls ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      style={{
                        boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
                      }}
                    >
                      {amount}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-4 gap-0">
                  {[1, 10, 50, 100].map((count) => (
                    <button
                      key={count}
                      onClick={() => onBuyBallsCountChange(count)}
                      disabled={shouldDisableControls}
                      className={`py-2 text-center text-xs font-bold transition-all touch-manipulation ${
                        buyBallsCount === count
                          ? 'text-cyan-300'
                          : 'text-gray-500 hover:text-gray-400'
                      } ${
                        shouldDisableControls ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      style={{
                        boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
                      }}
                    >
                      {count}
                    </button>
                  ))}
                </div>

                <div className="col-span-2">
                  <label className="block text-cyan-300 text-center text-sm uppercase font-bold mb-1 lg:mb-2">Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onUsePLSChange(false)}
                      disabled={shouldDisableControls}
                      className={`py-2 rounded-lg text-xs lg:text-sm font-bold transition-all touch-manipulation flex items-center justify-center gap-1.5 ${
                        !usePLS
                          ? 'text-cyan-300 shadow-lg'
                          : 'text-white/40 hover:text-white/60 active:text-white'
                      } ${shouldDisableControls ? 'opacity-50 cursor-not-allowed' : ''}`}
                      style={{
                        boxShadow: !usePLS
                          ? 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.03)'
                          : 'inset 2px 2px 4px rgba(0, 0, 0, 0.2), inset -2px -2px 4px rgba(255, 255, 255, 0.02)',
                        background: !usePLS
                          ? 'linear-gradient(145deg, rgba(6, 182, 212, 0.1), rgba(8, 145, 178, 0.1))'
                          : 'transparent'
                      }}
                    >
                      MORBIUS
                      <img
                        src="/morbius/MorbiusLogo (3).png"
                        alt="Morbius"
                        className="w-6 h-6 lg:w-7 lg:h-7 object-contain"
                      />
                    </button>
                    <button
                      onClick={() => onUsePLSChange(true)}
                      disabled={shouldDisableControls || !!priceError || isLoadingPrice}
                      className={`py-2 rounded-lg text-xs lg:text-sm font-bold transition-all touch-manipulation flex items-center justify-center gap-1.5 ${
                        usePLS
                          ? 'text-purple-300 shadow-lg'
                          : 'text-white/40 hover:text-white/60 active:text-white'
                      } ${(shouldDisableControls || priceError || isLoadingPrice) ? 'opacity-50 cursor-not-allowed' : ''}`}
                      style={{
                        boxShadow: usePLS
                          ? 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.03)'
                          : 'inset 2px 2px 4px rgba(0, 0, 0, 0.2), inset -2px -2px 4px rgba(255, 255, 255, 0.02)',
                        background: usePLS
                          ? 'linear-gradient(145deg, rgba(168, 85, 247, 0.1), rgba(147, 51, 234, 0.1))'
                          : 'transparent'
                      }}
                    >
                      PLS
                      <img
                        src="/Pulse Branding/Logo/ball.png"
                        alt="PLS"
                        className="w-6 h-6 lg:w-7 lg:h-7 object-contain"
                      />
                    </button>
                  </div>
                </div>
              </div>

              {usePLS && !priceError && morbiusPerPLS && (
                <div className="text-center mb-2 -mt-1">
                  <span className="text-white/40 text-[10px]">
                    1 PLS = {morbiusPerPLS >= 1 ? morbiusPerPLS.toFixed(2) : morbiusPerPLS.toFixed(6)} MORBIUS
                    {' '}
                    <span className="text-white/25">
                      (via {priceSource === 'pulsex' ? 'PulseX' : 'DexScreener'})
                    </span>
                  </span>
                </div>
              )}

              {priceError && usePLS && (
                <div
                  className="rounded-lg p-3 mb-3"
                  style={{
                    background: 'linear-gradient(145deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.1))',
                    boxShadow: 'inset 3px 3px 6px rgba(0, 0, 0, 0.3), inset -3px -3px 6px rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <div className="text-red-300 text-xs">
                    ⚠️ Unable to fetch PLS price. Please try MORBIUS instead.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                <div
                  className="rounded-lg p-2 lg:p-3"
                  style={{
                    background: usePLS
                      ? 'linear-gradient(145deg, rgba(168, 85, 247, 0.05), rgba(147, 51, 234, 0.05))'
                      : 'linear-gradient(145deg, rgba(6, 182, 212, 0.05), rgba(8, 145, 178, 0.05))',
                    boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <div className="text-center flex flex-col justify-center h-full">
                    <div className="text-cyan-300/60 text-xs mb-1 font-medium uppercase tracking-wider">Total Cost</div>
                    {isLoadingPrice && usePLS ? (
                      <div className="text-cyan-300/60 text-sm">Loading...</div>
                    ) : (
                      <div className={`text-lg lg:text-xl xl:text-2xl font-black ${usePLS ? 'text-purple-300' : 'text-cyan-300'}`}>
                        {usePLS
                          ? (() => {
                              const morbiusCost = parseEther(wagerPerBall.toString()) * BigInt(buyBallsCount);
                              const plsCost = calculateWplsAmount(morbiusCost, wplsPerMORBIUS, 150);
                              return Number.parseFloat(formatEther(plsCost)).toFixed(2);
                            })()
                          : (wagerPerBall * buyBallsCount).toLocaleString()
                        }
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => onBuyBalls(buyBallsCount, wagerPerBall, usePLS)}
                  disabled={!isConnected || shouldDisableControls}
                  className={`w-full font-bold py-2 lg:py-3 rounded-lg text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    usePLS ? 'text-purple-300' : 'text-cyan-300'
                  }`}
                  style={{
                    background: usePLS
                      ? 'linear-gradient(145deg, rgba(168, 85, 247, 0.3), rgba(147, 51, 234, 0.3))'
                      : 'linear-gradient(145deg, rgba(6, 182, 212, 0.3), rgba(8, 145, 178, 0.3))',
                    boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.2)',
                  }}
                >
                  {!isConnected
                    ? 'Connect Wallet'
                    : isConfirmingTransaction
                    ? 'Confirming Transaction...'
                    : isApproving || hasPendingPurchase
                    ? 'Approving...'
                    : isGameRunning
                    ? `Dropping ${animationQueueLength + (isAnimating ? 1 : 0)} Ball${animationQueueLength + (isAnimating ? 1 : 0) !== 1 ? 's' : ''}...`
                    : `Buy & Drop ${buyBallsCount} Ball${buyBallsCount !== 1 ? 's' : ''}`}
                </button>
              </div>

              <div className="mt-6">
                <div className="text-center mb-2">
                  <div className="text-cyan-300 text-sm font-bold uppercase tracking-wider">Drop Speed</div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {SPEED_OPTIONS.map(({ speed, label }) => (
                    <button
                      key={speed}
                      onClick={() => onDropSpeedChange(speed)}
                      disabled={false}
                      className={`h-15 w-full rounded-lg text-xs font-bold transition-all touch-manipulation ${
                        dropSpeed === speed
                          ? 'text-cyan-300'
                          : 'text-gray-500 hover:text-gray-400'
                      }`}
                      style={{
                        boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.03)',
                      }}
                      title={`Drop Speed: ${label}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="text-center">
                  <div className="uppercase font-bold text-cyan-300/80 text-[10px]">Control drop speed anytime during game</div>
                </div>
              </div>
            </div>
          </div>

          <div className="hidden min-h-[10rem] flex-1 basis-0 flex-col p-2 lg:flex">
            <RealTimeBetChart
              sessionStartTime={chartSessionStartTime}
              contractWagerPerBall={wagerPerBall}
              freePlayWager={currentWager}
              betHistory={betHistory}
              chartStats={chartStats}
              drops={drops}
              stats={stats}
              isConnected={isHistoryConnected}
              playerKey={historyPlayerKey}
              onExport={onExportHistory}
              onClear={onClearHistory}
            />
          </div>
        </div>
      )}
    </div>
  );
}
