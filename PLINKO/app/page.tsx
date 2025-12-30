'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react';
import PlinkoGame from '../components/PlinkoGame';
import MainNav from '../components/MainNav';
import AutoPlayModal from '../components/AutoPlayModal';
import PresetAmountsModal from '../components/PresetAmountsModal';
import ExtendedHistoryModal from '../components/ExtendedHistoryModal';
import { GameState, RiskLevel } from '../types';
import { COLORS } from '../constants';

interface AutoPlaySettings {
  riskLevel: RiskLevel;
  numberOfRounds: number;
  stopOnLossEnabled: boolean;
  stopOnLossAmount: number;
  stopOnBigWinEnabled: boolean;
  stopOnBigWinAmount: number;
  stopOnProfitEnabled: boolean;
  stopOnProfitAmount: number;
  onLossStrategy: 'reset' | 'increase' | 'decrease';
  onLossPercent: number;
  onWinStrategy: 'reset' | 'increase' | 'decrease';
  onWinPercent: number;
}

interface HistoryItem {
  id: number;
  multiplier: number;
  risk: RiskLevel;
}

const Home: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    balance: 755.37,
    ballCount: 0
  });

  const [wager, setWager] = useState(0.30);
  const [lastDrop, setLastDrop] = useState<{ id: number; risk: RiskLevel } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isAutoDrop, setIsAutoDrop] = useState(false);
  const [showAutoPlayModal, setShowAutoPlayModal] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showExtendedHistory, setShowExtendedHistory] = useState(false);
  const [autoPlaySettings, setAutoPlaySettings] = useState<AutoPlaySettings | null>(null);
  const [remainingBalls, setRemainingBalls] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [winLossBadge, setWinLossBadge] = useState<{ amount: number; key: number } | null>(null);
  const lastRiskRef = useRef<RiskLevel>('GREEN');
  const historyIdCounter = useRef(0);

  // AutoPlay state tracking
  const initialWagerRef = useRef(0.30);
  const startingBalanceRef = useRef(755.37);
  const lastWinAmountRef = useRef(0);


  const handleScore = useCallback((multiplier: number) => {
    const winAmount = wager * multiplier;
    const profit = winAmount - wager;
    lastWinAmountRef.current = winAmount;

    setGameState(prev => {
      const newBalance = prev.balance + winAmount;

      // Check AutoPlay stop conditions
      if (isAutoDrop && autoPlaySettings) {
        // Stop if cash decreases by
        if (autoPlaySettings.stopOnLossEnabled) {
          const totalLoss = startingBalanceRef.current - newBalance;
          if (totalLoss >= autoPlaySettings.stopOnLossAmount) {
            setIsAutoDrop(false);
            setRemainingBalls(0);
          }
        }

        // Stop if single win exceeds
        if (autoPlaySettings.stopOnBigWinEnabled && winAmount >= autoPlaySettings.stopOnBigWinAmount) {
          setIsAutoDrop(false);
          setRemainingBalls(0);
        }

        // Stop if cash increases by
        if (autoPlaySettings.stopOnProfitEnabled) {
          const totalProfit = newBalance - startingBalanceRef.current;
          if (totalProfit >= autoPlaySettings.stopOnProfitAmount) {
            setIsAutoDrop(false);
            setRemainingBalls(0);
          }
        }

        // Apply bet progression strategy
        const isWin = multiplier > 1;
        const strategy = isWin ? autoPlaySettings.onWinStrategy : autoPlaySettings.onLossStrategy;
        const percent = isWin ? autoPlaySettings.onWinPercent : autoPlaySettings.onLossPercent;

        if (strategy === 'reset') {
          setWager(initialWagerRef.current);
        } else if (strategy === 'increase') {
          setWager(prev => +(prev * (1 + percent / 100)).toFixed(2));
        } else if (strategy === 'decrease') {
          setWager(prev => Math.max(0.1, +(prev * (1 - percent / 100)).toFixed(2)));
        }
      }

      return {
        ...prev,
        balance: newBalance
      };
    });

    // Generate unique ID using counter to prevent duplicate keys
    historyIdCounter.current += 1;
    const uniqueId = Date.now() * 1000 + historyIdCounter.current;

    setHistory(prev => [
      { id: uniqueId, multiplier, risk: lastRiskRef.current },
      ...prev
    ].slice(0, 15));

    // Show win/loss badge
    setWinLossBadge({ amount: profit, key: Date.now() });

    // Clear badge after animation completes
    setTimeout(() => {
      setWinLossBadge(null);
    }, 2000);
  }, [wager, isAutoDrop, autoPlaySettings]);

  const dropBall = useCallback((risk: RiskLevel) => {
    setGameState(prev => {
      if (prev.balance < wager) {
        setIsAutoDrop(false);
        return prev;
      }
      lastRiskRef.current = risk;
      setLastDrop({ id: Date.now(), risk });
      return {
        ...prev,
        balance: prev.balance - wager,
        ballCount: prev.ballCount + 1
      };
    });
  }, [wager]);

  // AutoPlay handler
  const handleStartAutoPlay = useCallback((settings: AutoPlaySettings) => {
    setAutoPlaySettings(settings);
    setRemainingBalls(settings.numberOfRounds);
    initialWagerRef.current = wager;
    startingBalanceRef.current = gameState.balance;
    setIsAutoDrop(true);
  }, [wager, gameState.balance]);

  // Auto Drop Logic
  useEffect(() => {
    let interval: number | null = null;
    if (isAutoDrop && remainingBalls > 0 && autoPlaySettings) {
      interval = window.setInterval(() => {
        dropBall(autoPlaySettings.riskLevel);
        setRemainingBalls(prev => {
          const newCount = prev - 1;
          if (newCount <= 0) {
            setIsAutoDrop(false);
            setRemainingBalls(0);
          }
          return newCount;
        });
      }, 1000); // Fixed 1 second interval
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAutoDrop, dropBall, remainingBalls, autoPlaySettings]);

  // Detect mobile devices for responsive background
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 440); // Mobile breakpoint at 640px
    };

    checkMobile(); // Check on mount
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const adjustWager = (amount: number) => {
    setWager(prev => Math.max(0.1, +(prev + amount).toFixed(2)));
  };


  return (
    <div
      className="flex flex-col h-screen w-full transition-all duration-1000 overflow-hidden"
      style={{
        backgroundImage: `url("${isMobile ? '/ui/bg6.jpeg' : '/ui/pg.png'}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        backgroundColor: 'black'
      }}
    >
      {/* Main Navigation */}
      <MainNav />

      {/* HEADER SECTION */}
      <header className="flex justify-between items-center px-2 py-1 z-30 bg-white/10 backdrop-blur-sm border-b border-white/20 mt-[45px]">
        {/* History (Left) */}
        <div className="flex items-center gap-1 max-w-[60%] overflow-hidden">
          <button
            onClick={() => setShowExtendedHistory(true)}
            className="w-8 h-8 rounded-full bg-gradient-to-b from-gray-500 via-gray-600 to-gray-800 border-b-4 border-gray-900 shadow-xl shadow-gray-900/80 hover:from-gray-400 hover:via-gray-500 hover:to-gray-700 hover:shadow-gray-900/90 hover:border-gray-800 active:shadow-inner active:shadow-gray-900/60 active:border-gray-900 active:scale-95 transition-all duration-75 text-white flex items-center justify-center flex-shrink-0"
            title="View extended history"
          >
            <i className="fas fa-history text-xs"></i>
          </button>
          <div className="flex gap-0.5 overflow-x-auto no-scrollbar scroll-smooth">
            {history.length > 0 ? history.slice(0, 6).map((item, index) => {
              // Determine color based on risk level and multiplier
              let bgColor = '';
              const isDark = item.multiplier < 1;

              if (item.risk === 'GREEN') {
                bgColor = isDark ? 'bg-[rgb(100,140,45)]' : 'bg-[rgb(140,185,60)]';
              } else if (item.risk === 'YELLOW') {
                bgColor = isDark ? 'bg-[rgb(200,190,30)]' : 'bg-[rgb(255,240,60)]';
              } else if (item.risk === 'RED') {
                bgColor = isDark ? 'bg-[rgb(160,35,35)]' : 'bg-[rgb(210,50,50)]';
              }

              // Responsive visibility classes
              let visibilityClass = '';
              if (index >= 5) visibilityClass = 'hidden lg:block'; // 6th item: lg only
              else if (index >= 3) visibilityClass = 'hidden md:block'; // 4th-5th items: md and lg
              // Items 0-2: always visible

              return (
                <div
                  key={item.id}
                  className={`${bgColor} ${index === 0 ? 'history-item-enter' : ''} ${visibilityClass} hover:brightness-110 px-2 py-1 rounded text-[11px] font-black min-w-fit border-b-2 border-black/50 text-black shadow-lg shadow-black/60 transition-all duration-300 hover:scale-105 hover:shadow-black/80`}
                >
                  {item.multiplier}x
                </div>
              );
            }) : (
              <div className="text-[11px] text-white/60 font-bold uppercase tracking-widest px-1 italic">Waiting for results...</div>
            )}
          </div>
        </div>

        {/* Win/Loss Badge and Balance (Right) */}
        <div className="flex items-center gap-[1px]">
          {/* Win/Loss Badge */}
          {winLossBadge && (
            <div
              key={winLossBadge.key}
              className={`win-loss-badge-enter px-1.5 py-0.5 rounded text-[8px] font-black ${
                winLossBadge.amount >= 0
                  ? 'bg-green-500 text-white'
                  : 'bg-red-500 text-white'
              } shadow-md border border-black/20`}
            >
              {winLossBadge.amount >= 0 ? '+' : ''}{winLossBadge.amount.toFixed(2)}
            </div>
          )}

          {/* Balance */}
          <div className="flex items-center gap-1 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-2 py-1 rounded-lg border-b-4 border-gray-900 shadow-xl shadow-gray-900/80 hover:from-gray-400 hover:via-gray-500 hover:to-gray-700 hover:shadow-gray-900/90 hover:border-gray-800 transition-all duration-75">
            <span className="text-white font-black text-[10px] tracking-tight">
              {gameState.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-white/80 text-[7px] font-black">USD</span>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT - Single column layout */}
      <main className="flex-1 flex flex-col gap-1 p-1 pb-1 overflow-hidden">
        {/* GAME BOARD */}
        <div className="flex-1 w-full flex justify-center items-start bg-black/5 rounded-lg border border-black/10 shadow-inner pt-1 overflow-auto">
          <PlinkoGame
            onScore={handleScore}
            lastDrop={lastDrop}
          />
        </div>

        {/* CONTROLS - Responsive Layout */}
        <div
          className="flex-shrink-0 bg-black/20 rounded-2xl"
          style={{
            backgroundColor: 'rgba(100, 95, 158, 0.64)'
          }}
        >
          {/* Desktop Layout - Single Row */}
          <div className="hidden sm:flex items-center justify-center gap-2 p-2">
            {/* Bet Amount Display */}
            <div className="bg-gradient-to-b from-slate-900 via-slate-600 to-slate-800 rounded-full px-5 py-2 shadow-xl shadow-gray-900/80 border-b-4 border-gray-900 min-w-[140px]">
              <div className="text-center">
                <div className="text-white/60 text-[9px] font-medium uppercase tracking-wide">Bet USD</div>
                <div className="text-white font-bold text-lg font-mono">{wager.toFixed(2)}</div>
              </div>
            </div>

            {/* Control Buttons Group */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => adjustWager(-0.1)}
                className="w-11 h-11 rounded-full bg-gradient-to-b from-slate-950 via-slate-600 to-slate-800 text-white font-bold text-xl shadow-xl shadow-gray-900/80 border-b-4 border-gray-900 hover:from-gray-400 hover:via-gray-500 hover:to-gray-700 hover:shadow-gray-900/90 hover:border-gray-800 active:shadow-inner active:shadow-gray-900/60 active:border-gray-900 active:scale-95 transition-all duration-75"
              >
                −
              </button>
              <button
                onClick={() => setShowPresetModal(true)}
                className="w-11 h-11 rounded-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white shadow-xl shadow-gray-900/80 border-b-4 border-gray-900 hover:from-gray-400 hover:via-gray-500 hover:to-gray-700 hover:shadow-gray-900/90 hover:border-gray-800 active:shadow-inner active:shadow-gray-900/60 active:border-gray-900 active:scale-95 transition-all duration-75 flex items-center justify-center"
              >
                <i className="fas fa-layer-group text-sm"></i>
              </button>
              <button
                onClick={() => adjustWager(0.1)}
                className="w-8 h-8 rounded-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white font-bold text-xl shadow-xl shadow-gray-900/80 border-b-4 border-gray-900 hover:from-gray-400 hover:via-gray-500 hover:to-gray-700 hover:shadow-gray-900/90 hover:border-gray-800 active:shadow-inner active:shadow-gray-900/60 active:border-gray-900 active:scale-95 transition-all duration-75"
              >
                +
              </button>
            </div>

            {/* Auto Play Button */}
            <button
              onClick={() => {
                if (isAutoDrop) {
                  setIsAutoDrop(false);
                  setRemainingBalls(0);
                } else {
                  setShowAutoPlayModal(true);
                }
              }}
              className={`w-12 h-12 rounded-full shadow-xl border-b-4 active:scale-95 transition-all duration-75 flex items-center justify-center ${
                isAutoDrop
                  ? 'bg-gradient-to-b from-orange-400 via-orange-500 to-orange-700 text-white shadow-orange-900/80 border-orange-800 hover:from-orange-300 hover:via-orange-400 hover:to-orange-600 hover:shadow-orange-900/90 hover:border-orange-700 active:shadow-inner active:shadow-orange-900/60 active:border-orange-900'
                  : 'bg-gradient-to-b from-blue-400 via-blue-500 to-blue-700 text-white shadow-blue-900/80 border-blue-800 hover:from-blue-300 hover:via-blue-400 hover:to-blue-600 hover:shadow-blue-900/90 hover:border-blue-700 active:shadow-inner active:shadow-blue-900/60 active:border-blue-900'
              }`}
            >
              {isAutoDrop ? (
                <span className="font-bold text-sm">{remainingBalls}</span>
              ) : (
                <i className="fas fa-sync-alt text-lg"></i>
              )}
            </button>

            {/* Risk Level Buttons - Height matched to auto button */}
            <button
              onClick={() => dropBall('GREEN')}
              className="h-12 px-6 rounded-full bg-gradient-to-b from-green-400 via-green-500 to-green-700 text-white font-bold text-sm shadow-xl shadow-green-900/80 border-b-4 border-green-800 hover:from-green-300 hover:via-green-400 hover:to-green-600 hover:shadow-green-900/90 hover:border-green-700 active:shadow-inner active:shadow-green-900/60 active:border-green-900 active:scale-95 transition-all duration-75 uppercase tracking-wider"
            >
              GREEN
            </button>
            <button
              onClick={() => dropBall('YELLOW')}
              className="h-12 px-6 rounded-full bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700 text-white font-bold text-sm shadow-xl shadow-yellow-900/80 border-b-4 border-yellow-800 hover:from-yellow-300 hover:via-yellow-400 hover:to-yellow-600 hover:shadow-yellow-900/90 hover:border-yellow-700 active:shadow-inner active:shadow-yellow-900/60 active:border-yellow-900 active:scale-95 transition-all duration-75 uppercase tracking-wider"
            >
              YELLOW
            </button>
            <button
              onClick={() => dropBall('RED')}
              className="h-12 px-6 rounded-full bg-gradient-to-b from-red-400 via-red-500 to-red-700 text-white font-bold text-sm shadow-xl shadow-red-900/80 border-b-4 border-red-800 hover:from-red-300 hover:via-red-400 hover:to-red-600 hover:shadow-red-900/90 hover:border-red-700 active:shadow-inner active:shadow-red-900/60 active:border-red-900 active:scale-95 transition-all duration-75 uppercase tracking-wider"
            >
              RED
            </button>
          </div>

          {/* Mobile Layout - 2 Rows */}
          <div className="sm:hidden flex flex-col gap-1 p-1">
            {/* Row 1: Auto + Risk Buttons */}
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  if (isAutoDrop) {
                    setIsAutoDrop(false);
                    setRemainingBalls(0);
                  } else {
                    setShowAutoPlayModal(true);
                  }
                }}
                className={`w-12 h-12 rounded-full shadow-xl border-b-4 active:scale-95 transition-all duration-75 flex items-center justify-center ${
                  isAutoDrop
                    ? 'bg-gradient-to-b from-orange-400 via-orange-500 to-orange-700 text-white shadow-orange-900/80 border-orange-800 hover:from-orange-300 hover:via-orange-400 hover:to-orange-600 hover:shadow-orange-900/90 hover:border-orange-700 active:shadow-inner active:shadow-orange-900/60 active:border-orange-900'
                    : 'bg-gradient-to-b from-blue-400 via-blue-500 to-blue-700 text-white shadow-blue-900/80 border-blue-800 hover:from-blue-300 hover:via-blue-400 hover:to-blue-600 hover:shadow-blue-900/90 hover:border-blue-700 active:shadow-inner active:shadow-blue-900/60 active:border-blue-900'
                }`}
              >
                {isAutoDrop ? (
                  <span className="font-bold text-sm">{remainingBalls}</span>
                ) : (
                  <i className="fas fa-sync-alt text-lg"></i>
                )}
              </button>

              <button
                onClick={() => dropBall('GREEN')}
                className="h-12 px-6 rounded-full bg-gradient-to-b from-green-400 via-green-500 to-green-700 text-white font-bold text-sm shadow-xl shadow-green-900/80 border-b-4 border-green-800 hover:from-green-300 hover:via-green-400 hover:to-green-600 hover:shadow-green-900/90 hover:border-green-700 active:shadow-inner active:shadow-green-900/60 active:border-green-900 active:scale-95 transition-all duration-75 uppercase tracking-wider"
              >
                GREEN
              </button>
              <button
                onClick={() => dropBall('YELLOW')}
                className="h-12 px-6 rounded-full bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700 text-white font-bold text-sm shadow-xl shadow-yellow-900/80 border-b-4 border-yellow-800 hover:from-yellow-300 hover:via-yellow-400 hover:to-yellow-600 hover:shadow-yellow-900/90 hover:border-yellow-700 active:shadow-inner active:shadow-yellow-900/60 active:border-yellow-900 active:scale-95 transition-all duration-75 uppercase tracking-wider"
              >
                YELLOW
              </button>
              <button
                onClick={() => dropBall('RED')}
                className="h-12 px-6 rounded-full bg-gradient-to-b from-red-400 via-red-500 to-red-700 text-white font-bold text-sm shadow-xl shadow-red-900/80 border-b-4 border-red-800 hover:from-red-300 hover:via-red-400 hover:to-red-600 hover:shadow-red-900/90 hover:border-red-700 active:shadow-inner active:shadow-red-900/60 active:border-red-900 active:scale-95 transition-all duration-75 uppercase tracking-wider"
              >
                RED
              </button>
            </div>

            {/* Row 2: Bet Display + Control Buttons */}
            <div className="flex items-center justify-center gap-2">
              <div className="bg-gradient-to-b from-slate-500 via-slate-600 to-slate-800 rounded-full px-5 py-1.5 shadow-xl shadow-gray-900/80 border-b-4 border-gray-900 flex-1 max-w-[180px]">
                <div className="text-center">
                  <div className="text-white/60 text-[8px] font-medium uppercase">Bet USD</div>
                  <div className="text-white font-bold text-base font-mono">{wager.toFixed(2)}</div>
                </div>
              </div>

              <button
                onClick={() => adjustWager(-0.1)}
                className="w-11 h-11 rounded-full bg-gradient-to-b from-slate-950 via-slate-600 to-slate-800 text-white font-bold text-xl shadow-xl shadow-gray-900/80 border-b-4 border-gray-900 hover:from-gray-400 hover:via-gray-500 hover:to-gray-700 hover:shadow-gray-900/90 hover:border-gray-800 active:shadow-inner active:shadow-gray-900/60 active:border-gray-900 active:scale-95 transition-all duration-75"
              >
                −
              </button>
              <button
                onClick={() => setShowPresetModal(true)}
                className="w-11 h-11 rounded-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white shadow-xl shadow-gray-900/80 border-b-4 border-gray-900 hover:from-gray-400 hover:via-gray-500 hover:to-gray-700 hover:shadow-gray-900/90 hover:border-gray-800 active:shadow-inner active:shadow-gray-900/60 active:border-gray-900 active:scale-95 transition-all duration-75 flex items-center justify-center"
              >
                <i className="fas fa-layer-group text-sm"></i>
              </button>
              <button
                onClick={() => adjustWager(0.1)}
                className="w-11 h-11 rounded-full bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white font-bold text-xl shadow-xl shadow-gray-900/80 border-b-4 border-gray-900 hover:from-gray-400 hover:via-gray-500 hover:to-gray-700 hover:shadow-gray-900/90 hover:border-gray-800 active:shadow-inner active:shadow-gray-900/60 active:border-gray-900 active:scale-95 transition-all duration-75"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* AutoPlay Modal */}
      <AutoPlayModal
        open={showAutoPlayModal}
        onOpenChange={setShowAutoPlayModal}
        onStart={handleStartAutoPlay}
        currentBalance={gameState.balance}
      />

      {/* Preset Amounts Modal */}
      <PresetAmountsModal
        open={showPresetModal}
        onOpenChange={setShowPresetModal}
        onSelectAmount={setWager}
      />

      {/* Extended History Modal */}
      <ExtendedHistoryModal
        open={showExtendedHistory}
        onOpenChange={setShowExtendedHistory}
        history={history}
      />
    </div>
  );
};

export default Home;
