'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import PlinkoModalsHost from '@/components/PLINKO/PlinkoModalsHost';
import PlinkoBuyPanel from '@/components/PLINKO/PlinkoBuyPanel';
import PlinkoBoardShell from '@/components/PLINKO/PlinkoBoardShell';
import { type BetDataPoint } from '@/components/PLINKO/RealTimeBetChart';
import { usePlinkoHistory } from '@/hooks/use-plinko-history';
import { usePlayerInfo, useWagerLimits, usePlinkoWrite, useWatchBallDropped } from '@/hooks/use-plinko-contract';
import { PLINKO_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { PLINKO_ABI } from '@/abi/plinko';
import { useWplsPrice } from '@/hooks/use-wpls-price';
import { useTokenApproval } from '@/hooks/use-token-approval';
import { usePlinkoAnimationQueue } from '@/hooks/use-plinko-animation-queue';
import { usePlinkoTransactionFlow, type RiskLevelMap } from '@/hooks/use-plinko-transaction-flow';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { GameState, RiskLevel, ContractResult } from './types';
import { MULTIPLIERS, RISK_NAMES, RISK_LEVEL, RISK_LEVEL_MAP } from './constants';
import { formatEther, parseEther } from 'viem';
import Footer from '@/components/PLINKO/Footer';
import { GameFAQ } from '@/components/shared/GameFAQ';
import PlinkoTopPlayers from '@/components/PLINKO/PlinkoTopPlayers';
import { PlinkoRecentPlays } from '@/components/PLINKO/PlinkoRecentPlays';
import { PlinkoRecentGames } from '@/components/PLINKO/PlinkoRecentGames';
import { PlinkoPlayerDashboard } from '@/components/PLINKO/PlinkoPlayerDashboard';
import { AdSpace } from '@/components/shared/AdSpace';
import { MorbiusLoadingChip } from '@/components/shared/MorbiusLoadingChip';
import type { PlayerProfileGame } from '@/components/shared/PlayerProfileModal';

interface IntroScreenProps {
  onComplete: () => void;
}

function IntroScreen({ onComplete }: IntroScreenProps) {
  useEffect(() => {
    const duration = 2500;
    const fallbackTimeout = setTimeout(() => {
      setTimeout(onComplete, 200);
    }, duration);
    return () => clearTimeout(fallbackTimeout);
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(10, 15, 20))',
      }}
      suppressHydrationWarning
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-6">
        <div className="w-[300px] shrink-0">
          <AdSpace slot="loading" width={300} height={100} showCta={true} />
        </div>
        <div className="flex flex-col items-center gap-[30px]">
        {/* Animated ball */}
        <div className="relative w-20 h-20 shrink-0">
          <div
            className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-500 to-purple-700 flex items-center justify-center shadow-lg"
            style={{
              animation: 'plinkoBallDrop 0.6s ease-out both',
              boxShadow: '0 4px 20px rgba(6, 182, 212, 0.4)',
            }}
          >
            <span className="text-white text-2xl font-bold">●</span>
          </div>
        </div>
        <div className="text-center shrink-0">
          <div className="text-white text-xl font-bold animate-pulse mb-2">
            DROPPING BALLS...
          </div>
          <div className="text-gray-400 text-sm">
            Preparing Plinko
          </div>
        </div>
        </div>
      </div>
      <MorbiusLoadingChip />
      <style jsx>{`
        @keyframes plinkoBallDrop {
          0% {
            transform: translateY(-80px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

interface HistoryItem {
  id: number;
  multiplier: number;
  risk: RiskLevel;
}

interface WatchedBallDroppedEvent {
  args?: {
    player: `0x${string}`;
    seed: bigint;
    bucket: bigint;
    multiplier: bigint;
    payout: bigint;
    riskLevel: bigint;
  };
}

const Home: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    balance: 1000,
    ballCount: 0
  });

  // Always initialize wager to $1.00 on page load
  const [wager, setWager] = useState(1.00);
  const [lastDrop, setLastDrop] = useState<{ id: number; risk: RiskLevel; contractResult?: ContractResult } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showExtendedHistory, setShowExtendedHistory] = useState(false);
  const [showPlinkoHistory, setShowPlinkoHistory] = useState(false);
  const [playerProfileOpen, setPlayerProfileOpen] = useState(false);
  const [playerProfileGame, setPlayerProfileGame] = useState<PlayerProfileGame>('plinko');
  const [winLossBadge, setWinLossBadge] = useState<{ amount: number; key: number } | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  type DropSpeed = 'normal' | 'fast' | 'burst';
  const [dropSpeed, setDropSpeed] = useState<DropSpeed>('normal'); // Drop speed mode - normal by default
  const [freePlayEnabled, setFreePlayEnabled] = useState(false); // Free Play toggle - disabled by default (contract mode)
  const [showIntro, setShowIntro] = useState(() => {
    // Check localStorage to see if intro was already shown
    if (typeof window !== 'undefined') {
      const introShown = localStorage.getItem('plinko-intro-shown');
      return introShown !== 'true';
    }
    return true;
  });
  const lastRiskRef = useRef<RiskLevel>('GREEN');
  const historyIdCounter = useRef(0);
  const lastBucketIndexRef = useRef<number>(0); // Track bucket index for history

  // PLINKO History Hook
  const plinkoHistory = usePlinkoHistory();

  // Contract hooks (for crypto betting mode)
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const playerInfo = usePlayerInfo(address);
  const wagerLimitsData = useWagerLimits();
  const { writeContractAsync } = usePlinkoWrite();
  const { wplsPerMORBIUS, morbiusPerPLS, isLoading: isLoadingPrice, error: priceError, source: priceSource } = useWplsPrice(); // Get PLS/MORBIUS price for native PLS purchases
  const [buyBallsCount, setBuyBallsCount] = useState(10);
  const [wagerPerBall, setWagerPerBall] = useState(10); // Default 10 MORBIUS per ball (V5)
  const [usePLS, setUsePLS] = useState(false); // Toggle between MORBIUS and PLS
  const [buyRiskLevel, setBuyRiskLevel] = useState<RiskLevel>('YELLOW'); // Selected risk for buying
  const chartSessionStartTime = useRef(Date.now()); // Fixed session start time
  const [pendingPurchase, setPendingPurchase] = useState<{
    count: number;
    wagerPerBallMORBIUS: number;
    useNativePLS: boolean;
  } | null>(null);
  const [isConfirmingTransaction, setIsConfirmingTransaction] = useState(false); // Track transaction confirmation
  const [confirmationStage, setConfirmationStage] = useState<'broadcast' | 'mempool' | 'mined' | null>(null); // Track confirmation stage for slot machine

  // Multiplier table modal state
  const [showMultiplierTable, setShowMultiplierTable] = useState(false);

  // Drop summary modal state
  const [showDropSummary, setShowDropSummary] = useState(false);

  // Slot machine test modal state
  const [showSlotMachineTest, setShowSlotMachineTest] = useState(false);
  const [dropSummaryData, setDropSummaryData] = useState<{
    txHash: string;
    totalWon: number;
    ballCount: number;
    results: Array<{ bucket: number; multiplier: number; payout: number }>;
  } | null>(null);

  // Auto-dismiss summary toast after 8 seconds
  useEffect(() => {
    if (dropSummaryData && !showDropSummary) {
      const timer = setTimeout(() => {
        setDropSummaryData(null);
      }, 8000); // 8 seconds
      return () => clearTimeout(timer);
    }
  }, [dropSummaryData, showDropSummary]);

  // Calculate total MORBIUS cost for approval (V5 - variable wager)
  const totalMorbiusCost = parseEther(wagerPerBall.toString()) * BigInt(buyBallsCount);

  // Token approval for MORBIUS purchases
  const {
    approve,
    isApproving,
    isLoadingAllowance,
    isApprovalSuccess,
    allowance,
  } = useTokenApproval({
    tokenAddress: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
    spenderAddress: PLINKO_ADDRESS as `0x${string}`,
    requiredAmount: totalMorbiusCost,
    userAddress: address,
    enabled: !usePLS && !!address, // Always check when using MORBIUS and connected
    defaultToUnlimited: true, // Default to unlimited approval for best UX
  });

  const {
    animationQueue,
    setAnimationQueue,
    isAnimating,
    expectedBallCount,
    setExpectedBallCount,
    scoredBallCount,
    setScoredBallCount,
    ballsLaunched,
    setBallsLaunched,
    isGameRunning,
  } = usePlinkoAnimationQueue({
    freePlayEnabled,
    dropSpeed,
    setLastDrop,
    lastRiskRef,
  });

  const shouldDisableControls = isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance || isGameRunning;

  useEffect(() => {
    // Reset pending purchase when switching payment methods
    setPendingPurchase(null);
  }, [usePLS]);

  const handleRequireApproval = useCallback(
    (requiredAmount: bigint, purchase: { count: number; wagerPerBallMORBIUS: number; useNativePLS: boolean }) => {
      setPendingPurchase(purchase);
      approve(requiredAmount);
    },
    [approve]
  );

  // Get contract ball balance (0 if free play or not connected)
  // Note: V5 removed ball balance - everything is buy-and-drop in one transaction
  const contractBallBalance = 0;

  // Get wager limits from contract (V5)
  const minWager = wagerLimitsData.data ? Number(formatEther(wagerLimitsData.data[0])) : 10;
  const maxWager = wagerLimitsData.data ? Number(formatEther(wagerLimitsData.data[1])) : 10000;

  const handleWatchBallDropped = useCallback((event: WatchedBallDroppedEvent) => {
    console.log('🔴 LIVE BallDropped event received (useWatchContractEvent):', event);

    if (!event.args) {
      console.log('⚠️ Event has no args, skipping');
      return;
    }

    const { player, bucket, multiplier, payout, riskLevel } = event.args;

    // Skip own events here: our own tx results are already decoded from receipt.
    if (address && player && String(player).toLowerCase() === address.toLowerCase()) {
      return;
    }

    // Map contract risk level (0,1,2) to UI risk level (GREEN,YELLOW,RED)
    const riskMap = ['GREEN', 'YELLOW', 'RED'] as RiskLevel[];
    const risk = riskMap[Number(riskLevel)] || 'YELLOW';

    // Contract now returns 0-indexed buckets (0-16)
    const bucketIndex = Number(bucket);

    // Convert multiplier from basis points to actual multiplier
    const actualMultiplier = Number(multiplier) / 100;

    console.log('Decoded live event:', {
      bucket: bucketIndex,
      risk,
      multiplier: actualMultiplier,
      payout: Number(formatEther(payout)),
    });

    setAnimationQueue(prev => [...prev, {
      bucket: bucketIndex,
      risk,
      multiplier: actualMultiplier,
      payout: Number(formatEther(payout)),
      seed: event.args.seed.toString()
    }]);
  }, [address, setAnimationQueue]);

  // Listen for BallDropped events from the contract (for live updates from other players or delayed events)
  useWatchBallDropped(handleWatchBallDropped);

  const currentWagerRef = useRef(1.00); // Track current wager synchronously for drop scoring

  // Shared chart state - lifted from RealTimeBetChart so both instances show same data
  const [sharedBetHistory, setSharedBetHistory] = useState<BetDataPoint[]>([]);
  const [sharedChartStats, setSharedChartStats] = useState({ totalBets: 0, totalWagered: 0, totalWon: 0 });

  // Keep currentWagerRef in sync with wager state
  useEffect(() => {
    currentWagerRef.current = wager;
  }, [wager]);


  const handleScore = useCallback((multiplier: number, bucketIndex: number, contractData?: any) => {
    // Use current values if free play, or use the contract values passed back from the physics engine
    const actualMultiplier = contractData ? contractData.multiplier : multiplier;
    const actualRisk = contractData ? contractData.risk : lastRiskRef.current;

    // Use wagerPerBall for contract mode, or the USD wager for free play
    const actualWager = contractData ? wagerPerBall : currentWagerRef.current;

    // 1. Record in history - only for free play mode (contract mode records when transaction confirms)
    if (!contractData) {
      plinkoHistory.recordDrop(actualWager, actualMultiplier, actualRisk, bucketIndex);
    }

    // 2. Track ball landing for game-running state
    if (contractData) {
      setScoredBallCount(prev => prev + 1);
    }

    // 3. Update local UI state (Win/Loss Badge)
    const winAmount = actualWager * actualMultiplier;
    const badgeProfit = winAmount - actualWager;
    setWinLossBadge({ amount: badgeProfit, key: Date.now() });

    // 4. Update shared chart state (both overlay and bottom chart share this)
    const riskLevel = contractData?.risk || lastRiskRef.current || 'UNKNOWN';
    setSharedBetHistory(prev => {
      const newDataPoint: BetDataPoint = {
        dropNumber: prev.length + 1,
        betAmount: actualWager,
        multiplier: actualMultiplier,
        bucketIndex,
        timestamp: Date.now(),
        profit: winAmount - actualWager,
        riskLevel,
      };
      return [...prev, newDataPoint];
    });
    setSharedChartStats(prev => ({
      totalBets: prev.totalBets + 1,
      totalWagered: prev.totalWagered + actualWager,
      totalWon: prev.totalWon + winAmount,
    }));

    // ... rest of your balance update logic ...
    console.log('=== SCORE EVENT ===');
    console.log('Multiplier:', actualMultiplier);
    console.log('Bucket Index:', bucketIndex);
    console.log('Contract Data:', contractData);
    console.log('Free Play Mode:', freePlayEnabled);

    // In contract mode, we still want to record history when balls hit buckets
    // But we skip the balance updates and auto-play logic for contract mode

    // Only update balance and auto-play for free play mode
    if (freePlayEnabled) {
      const freePlayWinAmount = actualWager * actualMultiplier;
      lastBucketIndexRef.current = bucketIndex;

      setGameState(prev => {
        return {
          ...prev,
          balance: prev.balance + freePlayWinAmount
        };
      });
    }

    // Update history for both contract and free play modes
    historyIdCounter.current += 1;
    const uniqueId = Date.now() * 1000 + historyIdCounter.current;

    setHistory(prev => [
      { id: uniqueId, multiplier: actualMultiplier, risk: actualRisk },
      ...prev
    ].slice(0, 15));

    // Show win/loss badge (calculate profit based on mode)
    const profit = freePlayEnabled
      ? (actualWager * actualMultiplier) - actualWager  // Free play: wager * multiplier - wager
      : (contractData ? contractData.payout - (contractData.payout / actualMultiplier) : 0); // Contract: payout - wager

    setWinLossBadge({ amount: profit, key: Date.now() });

    // Clear badge after animation completes
    setTimeout(() => {
      setWinLossBadge(null);
    }, 2000);
  }, [plinkoHistory, freePlayEnabled, wagerPerBall]);

  const { pollForReceipt, buyBalls } = usePlinkoTransactionFlow({
    address,
    isConnected,
    minWager,
    maxWager,
    allowance,
    buyRiskLevel,
    wplsPerMORBIUS,
    writeContractAsync,
    publicClient,
    playerInfo,
    plinkoHistory,
    riskLevelMap: RISK_LEVEL_MAP as RiskLevelMap,
    onRequireApproval: handleRequireApproval,
    setIsConfirmingTransaction,
    setConfirmationStage,
    setScoredBallCount,
    setBallsLaunched,
    setExpectedBallCount,
    setAnimationQueue,
    setDropSummaryData,
  });

  // Handle approval success and execute pending purchase
  useEffect(() => {
    if (isApprovalSuccess && pendingPurchase) {
      console.log('✅ APPROVAL SUCCESS! Executing pending purchase...');
      // Execute the pending purchase
      buyBalls(pendingPurchase.count, pendingPurchase.wagerPerBallMORBIUS, pendingPurchase.useNativePLS);
      setPendingPurchase(null);
    }
  }, [isApprovalSuccess, pendingPurchase, buyBalls]);

  // Contract: Drop all balls with multi-drop
  const dropBallContract = useCallback(async (risk: RiskLevel, ballCount?: number) => {
    if (!address || !isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    const ballsToUpdate = ballCount || contractBallBalance;

    if (ballsToUpdate === 0) {
      alert('No balls to drop!');
      return;
    }

    try {
      // Map UI risk level (GREEN/YELLOW/RED) to contract risk level (0/1/2)
      const riskKey = risk.toLowerCase() as keyof typeof RISK_LEVEL_MAP;
      const contractRiskLevel = RISK_LEVEL_MAP[riskKey];

      if (contractRiskLevel === undefined) {
        throw new Error(`Invalid risk level: ${risk}`);
      }

      console.log(`Dropping ${ballsToUpdate} balls with ${risk} risk (contract level: ${contractRiskLevel})`);

      // Use dropMultipleBalls to drop ALL balls in ONE transaction
      const txHash = await writeContractAsync({
        address: PLINKO_ADDRESS,
        abi: PLINKO_ABI,
        functionName: 'dropMultipleBalls',
        args: [BigInt(ballsToUpdate), Number(contractRiskLevel)],
        maxPriorityFeePerGas: 200_000n, // 200k wei/beats tip (PulseChain) for faster inclusion
      });

      // Wait for transaction confirmation with polling
      console.log('Waiting for multi-ball drop confirmation...', txHash);
      setConfirmationStage('broadcast');
      const dropReceipt = await pollForReceipt(txHash, {
        maxAttempts: 20, // Shorter for multi-ball drops
        intervalMs: 3000,
        onAttempt: (attempt) => {
          if (attempt % 3 === 0) { // Update more frequently for shorter wait
            console.log(`Still waiting for multi-ball confirmation... (${attempt}/20)`);
          }
          // Update confirmation stage based on progress
          if (attempt <= 7) {
            setConfirmationStage('broadcast');
          } else if (attempt <= 14) {
            setConfirmationStage('mempool');
          } else {
            setConfirmationStage('mined');
          }
        }
      });
      setConfirmationStage(null);

      // Check if transaction succeeded
      if (dropReceipt.status === 'reverted') {
        throw new Error('Multi-ball drop transaction failed');
      }
      console.log(`Successfully dropped ${ballsToUpdate} balls!`);

      // Refetch player data to update ball balance and stats
      await playerInfo.refetch();

      console.log(`Successfully dropped ${ballsToUpdate} balls! Listening for BallDropped events to animate results...`);
    } catch (error) {
      console.error('Error dropping balls:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to drop balls: ${errorMessage}`);
    }
  }, [address, isConnected, contractBallBalance, writeContractAsync, publicClient, playerInfo, pollForReceipt]);

  const dropBall = useCallback((risk: RiskLevel) => {
    // Update selected risk level
    lastRiskRef.current = risk;

    // In contract mode: handle buying or dropping based on ball balance
    if (!freePlayEnabled) {
      if (contractBallBalance > 0) {
        // Player has balls - drop them all
        console.log(`Dropping ${contractBallBalance} existing balls with ${risk} risk`);
        dropBallContract(risk, contractBallBalance);
      } else {
        // No balls - this selects risk level for buying
        console.log(`Selected ${risk} risk for buying balls`);
        setBuyRiskLevel(risk);
      }
      return;
    }

    // Free play mode: drop immediately
    setGameState(prev => {
      if (prev.balance < wager) {
        return prev;
      }
      setLastDrop({ id: Date.now(), risk });
      return {
        ...prev,
        balance: prev.balance - wager,
        ballCount: prev.ballCount + 1
      };
    });
  }, [wager, freePlayEnabled, contractBallBalance, dropBallContract]);

  const adjustWager = (amount: number) => {
    setWagerWithPersistence(prev => Math.max(0.1, +(prev + amount).toFixed(2)));
  };

  // Helper to set wager and update ref (no localStorage persistence)
  const setWagerWithPersistence = (newWager: number | ((prev: number) => number)) => {
    setWager(prev => {
      const newValue = typeof newWager === 'function' ? newWager(prev) : newWager;
      // Update ref synchronously for immediate access
      currentWagerRef.current = newValue;
      // Note: No longer persisting to localStorage - wager resets to $1 on refresh
      return newValue;
    });
  };

  const handleClearPlinkoHistory = useCallback(async () => {
    if (confirm('Are you sure you want to clear all history? This cannot be undone.')) {
      await plinkoHistory.clearHistory();
    }
  }, [plinkoHistory]);

  // Hold-to-repeat functionality for wager buttons
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startAdjusting = (amount: number) => {
    adjustWager(amount); // Immediate adjustment

    // Wait 300ms before starting to repeat
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        adjustWager(amount);
      }, 50); // Repeat every 50ms
    }, 300);
  };

  const stopAdjusting = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAdjusting();
    };
  }, []);

  // Show intro screen first
  if (showIntro) {
    return <IntroScreen onComplete={() => {
      setShowIntro(false);
      // Save to localStorage so intro doesn't show again
      if (typeof window !== 'undefined') {
        localStorage.setItem('plinko-intro-shown', 'true');
      }
    }} />;
  }

  return (
    <div
      className="flex flex-col min-h-screen w-full transition-all duration-1000 overflow-y-auto sm:overflow-hidden relative"
    >

      <GlobalMainNav
        onShowPlinkoHistory={() => setShowPlinkoHistory(true)}
        onOpenPlayerProfile={address ? (game) => { setPlayerProfileGame(game); setPlayerProfileOpen(true); } : undefined}
        onPlinkoSoundToggle={() => setSoundEnabled(!soundEnabled)}
        plinkoSoundEnabled={soundEnabled}
        sidebarDisabled={isGameRunning}
      >
      {/* Free Play Badge */}
      {freePlayEnabled && (
        <div className="fixed top-14 left-2 z-30">
          <div className="px-1 py-1 rounded-full bg-gradient-to-t from-green-600 via-green-600 to-green-500 text-white text-xs font-semibold shadow-lg border border-black/20">
            FREE PLAY
          </div>
        </div>
      )}

      {/* Win/Loss Badge */}
      <div className="fixed top-14 right-2 z-30">
        {winLossBadge && (
          <div
            key={winLossBadge.key}
            className={`win-loss-badge-enter px-2 py-1 rounded text-[10px] font-black ${
              winLossBadge.amount >= 0
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            } shadow-md border border-black/20`}
          >
            {winLossBadge.amount >= 0 ? '+' : ''}{winLossBadge.amount.toFixed(2)}
          </div>
        )}
      </div>

      {/* RESPONSIVE LAYOUT - Mobile-first approach */}
      <div className="flex relative pt-4 md:pt-2 px-2 gap-2 flex-col lg:flex-row lg:px-3 lg:gap-3 min-h-[calc(100vh-4rem)]">
        <PlinkoBuyPanel
          freePlayEnabled={freePlayEnabled}
          isGameRunning={isGameRunning}
          chartSessionStartTime={chartSessionStartTime.current}
          wagerPerBall={wagerPerBall}
          currentWager={currentWagerRef.current}
          betHistory={sharedBetHistory}
          chartStats={sharedChartStats}
          drops={plinkoHistory.drops}
          stats={plinkoHistory.stats}
          isHistoryConnected={plinkoHistory.isConnected}
          historyPlayerKey={plinkoHistory.playerKey}
          onExportHistory={plinkoHistory.exportHistory}
          onClearHistory={handleClearPlinkoHistory}
          history={history}
          dropSpeed={dropSpeed}
          onDropSpeedChange={setDropSpeed}
          onShowMultiplierTable={() => setShowMultiplierTable(true)}
          buyRiskLevel={buyRiskLevel}
          onBuyRiskLevelChange={setBuyRiskLevel}
          shouldDisableControls={shouldDisableControls}
          minWager={minWager}
          maxWager={maxWager}
          buyBallsCount={buyBallsCount}
          onBuyBallsCountChange={setBuyBallsCount}
          onWagerPerBallChange={setWagerPerBall}
          usePLS={usePLS}
          onUsePLSChange={setUsePLS}
          priceError={priceError}
          isLoadingPrice={isLoadingPrice}
          morbiusPerPLS={morbiusPerPLS}
          priceSource={priceSource}
          wplsPerMORBIUS={wplsPerMORBIUS}
          isConnected={isConnected}
          isConfirmingTransaction={isConfirmingTransaction}
          isApproving={isApproving}
          hasPendingPurchase={!!pendingPurchase}
          animationQueueLength={animationQueue.length}
          isAnimating={isAnimating}
          onBuyBalls={buyBalls}
        />

        <PlinkoBoardShell
          remainingBalls={0}
          dropSpeed={dropSpeed}
          onToggleBurst={() => setDropSpeed(dropSpeed === 'burst' ? 'normal' : 'burst')}
          onScore={handleScore}
          lastDrop={lastDrop}
          selectedRiskLevel={buyRiskLevel}
          soundEnabled={soundEnabled}
          onSoundToggle={setSoundEnabled}
        />
      </div>

      {/* 3-tab container + player dashboard (2-col on lg); FAQs directly below */}
      <section className="px-3 mt-4 mb-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <div className="surface-panel relative min-w-0 overflow-hidden rounded-2xl">
            <div className="surface-cyan-glow" />

            <Tabs defaultValue="recent-games" className="relative p-3 sm:p-4">
              <TabsList className="grid h-11 w-full max-w-full grid-cols-3 gap-1 rounded-xl border border-cyan-500/30 bg-black/40 p-1">
                <TabsTrigger
                  value="recent-games"
                  className="font-jost min-w-0 w-full justify-center rounded-lg px-1 py-2 text-center text-[11px] font-bold leading-tight text-white/80 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 data-[state=active]:text-white sm:px-2 sm:text-[13px]"
                >
                  Recent Games
                </TabsTrigger>
                <TabsTrigger
                  value="recent-play"
                  className="font-jost min-w-0 w-full justify-center rounded-lg px-1 py-2 text-center text-[11px] font-bold leading-tight text-white/80 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 data-[state=active]:text-white sm:px-2 sm:text-[13px]"
                >
                  Recent Play
                </TabsTrigger>
                <TabsTrigger
                  value="leaderboard"
                  className="font-jost min-w-0 w-full justify-center rounded-lg px-1 py-2 text-center text-[11px] font-bold leading-tight text-white/80 transition-all data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 data-[state=active]:text-white sm:px-2 sm:text-[13px]"
                >
                  Leaderboard
                </TabsTrigger>
              </TabsList>

              <TabsContent value="recent-games" className="mt-4 min-h-[260px] focus-visible:outline-none lg:min-h-[300px]">
                <PlinkoRecentGames compact title="Recent Games" />
              </TabsContent>

              <TabsContent value="recent-play" className="mt-4 min-h-[260px] focus-visible:outline-none lg:min-h-[300px]">
                <PlinkoRecentPlays compact title="Recent Play" />
              </TabsContent>

              <TabsContent value="leaderboard" className="mt-4 min-h-[260px] focus-visible:outline-none lg:min-h-[300px]">
                <PlinkoTopPlayers />
              </TabsContent>
            </Tabs>
          </div>

          <div className="min-w-0 min-h-0 lg:max-h-[min(720px,75vh)] lg:overflow-y-auto custom-scrollbar">
            <PlinkoPlayerDashboard playerAddress={address ?? null} />
          </div>
        </div>

        <div className="w-full flex justify-center">
          <GameFAQ
            game="plinko"
            addresses={[
              { label: 'Plinko Contract', address: PLINKO_ADDRESS },
              { label: 'MORBIUS Token', address: MORBIUS_TOKEN_ADDRESS },
            ]}
          />
        </div>
      </section>

      {/* Modals */}
      <PlinkoModalsHost
        showPresetModal={showPresetModal}
        onShowPresetModalChange={setShowPresetModal}
        onSelectPresetAmount={setWagerWithPersistence}
        showExtendedHistory={showExtendedHistory}
        onShowExtendedHistoryChange={setShowExtendedHistory}
        history={history}
        showPlinkoHistory={showPlinkoHistory}
        onShowPlinkoHistoryChange={setShowPlinkoHistory}
        drops={plinkoHistory.drops}
        stats={plinkoHistory.stats}
        isHistoryConnected={plinkoHistory.isConnected}
        historyPlayerKey={plinkoHistory.playerKey}
        onExportHistory={plinkoHistory.exportHistory}
        onClearHistory={handleClearPlinkoHistory}
        playerProfileOpen={playerProfileOpen}
        onClosePlayerProfile={() => setPlayerProfileOpen(false)}
        playerAddress={address ?? null}
        playerProfileGame={playerProfileGame}
        showMultiplierTable={showMultiplierTable}
        onShowMultiplierTableChange={setShowMultiplierTable}
        multipliers={MULTIPLIERS}
        isConfirmingTransaction={isConfirmingTransaction}
        confirmationStage={confirmationStage}
        showSlotMachineTest={showSlotMachineTest}
        onShowSlotMachineTestChange={setShowSlotMachineTest}
      />

      {/* Footer */}
      <Footer />
      </GlobalMainNav>
    </div>
  );
};

export default Home;
