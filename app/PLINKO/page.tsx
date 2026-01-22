'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import PlinkoGame from '@/components/PLINKO/PlinkoGame';
import MainNav from '@/components/PLINKO/MainNav';
import AutoPlayModal from '@/components/PLINKO/AutoPlayModal';
import PresetAmountsModal from '@/components/PLINKO/PresetAmountsModal';
import ExtendedHistoryModal from '@/components/PLINKO/ExtendedHistoryModal';
import CustomAmountModal from '@/components/PLINKO/CustomAmountModal';
import { PlinkoHistoryModal } from '@/components/PLINKO/PlinkoHistoryModal';
import { CustomApprovalModal } from '@/components/PLINKO/CustomApprovalModal';
import SlotMachine from '@/components/PLINKO/SlotMachine';
import RealTimeBetChart, { RealTimeBetChartRef } from '@/components/PLINKO/RealTimeBetChart';
import { usePlinkoHistory } from '@/hooks/use-plinko-history';
import { usePlayerInfo, useWagerLimits, usePlinkoWrite, useWatchBallDropped } from '@/hooks/use-plinko-contract';
import { PLINKO_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { PLINKO_ABI } from '@/abi/plinko';
import { useWplsPrice, calculateWplsAmount } from '@/hooks/use-wpls-price';
import { useTokenApproval } from '@/hooks/use-token-approval';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import { formatEther, parseEther, decodeEventLog } from 'viem';
import Footer from '@/components/PLINKO/Footer';

// BallDropped event ABI for decoding
const BALL_DROPPED_EVENT_ABI = {
  anonymous: false,
  inputs: [
    { indexed: true, internalType: 'address', name: 'player', type: 'address' },
    { indexed: false, internalType: 'uint256', name: 'seed', type: 'uint256' },
    { indexed: false, internalType: 'uint8', name: 'bucket', type: 'uint8' },
    { indexed: false, internalType: 'uint256', name: 'multiplier', type: 'uint256' },
    { indexed: false, internalType: 'uint256', name: 'payout', type: 'uint256' },
    { indexed: false, internalType: 'uint8', name: 'riskLevel', type: 'uint8' }
  ],
  name: 'BallDropped',
  type: 'event'
} as const;

interface IntroScreenProps {
  onComplete: () => void;
}

function IntroScreen({ onComplete }: IntroScreenProps) {
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const duration = 3000; // 3 seconds (reduced from 5)
    const interval = 50; // Update every 50ms
    const steps = duration / interval;
    let currentStep = 0;

    const progressInterval = setInterval(() => {
      currentStep++;
      const newProgress = (currentStep / steps) * 100;
      setProgress(Math.min(newProgress, 100));

      if (currentStep >= steps) {
        clearInterval(progressInterval);
        setTimeout(onComplete, 200); // Small delay after completion
      }
    }, interval);

    // Fallback: ensure completion after maximum 5 seconds
    const fallbackTimeout = setTimeout(() => {
      clearInterval(progressInterval);
      setProgress(100);
      setTimeout(onComplete, 200);
    }, 5000);

    // Start video playback (optional - don't block on it)
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Video failed to play, continue with progress bar only
        console.log('Intro video failed to play, continuing with progress bar');
      });
    }

    return () => {
      clearInterval(progressInterval);
      clearTimeout(fallbackTimeout);
    };
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col items-center justify-center z-50">
      {/* Video Background */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        muted
        playsInline
        preload="auto"
        onError={() => {
          console.log('Intro video failed to load, continuing with progress bar only');
        }}
      >
        <source src="/PLINKO/Intro.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* Overlay Content */}
      <div className="relative z-10 flex flex-col justify-between h-full py-12">
        {/* Empty top space */}
        <div></div>

        {/* Progress Bar at Bottom */}
        <div className="w-80 max-w-sm mx-auto">
          <div className="bg-white/20 rounded-full h-3 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-yellow-400 via-orange-500 to-red-500 rounded-full transition-all duration-75 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-center mt-4 space-y-2">
            <span className="text-white text-lg font-semibold">
              Loading... {Math.round(progress)}%
            </span>
            <div>
              <button
                onClick={onComplete}
                className="text-white/70 text-sm hover:text-white underline transition-colors"
              >
                Skip Intro
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Vignette Effect */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 pointer-events-none" />
    </div>
  );
}

interface AutoPlaySettings {
  riskLevel: RiskLevel;
  numberOfRounds: number;
  dropSpeed: number; // Speed in milliseconds between drops
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

interface DecodedBallDroppedEvent {
  args: {
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

  // Test drop function for physics testing
  const handleTestDrop = useCallback(() => {
    const riskLevels: RiskLevel[] = ['GREEN', 'YELLOW', 'RED'];
    const randomRisk = riskLevels[Math.floor(Math.random() * riskLevels.length)];
    setLastDrop({ id: Date.now(), risk: randomRisk });
  }, []);
  const [isAutoDrop, setIsAutoDrop] = useState(false);
  const [showAutoPlayModal, setShowAutoPlayModal] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [showExtendedHistory, setShowExtendedHistory] = useState(false);
  const [showCustomAmountModal, setShowCustomAmountModal] = useState(false);
  const [showPlinkoHistory, setShowPlinkoHistory] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [autoPlaySettings, setAutoPlaySettings] = useState<AutoPlaySettings | null>(null);
  const [remainingBalls, setRemainingBalls] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [historyCardCount, setHistoryCardCount] = useState(3);
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
  const { wplsPerMORBIUS, isLoading: isLoadingPrice, error: priceError } = useWplsPrice(); // Get PLS/MORBIUS price for native PLS purchases
  const [showBuyBallsModal, setShowBuyBallsModal] = useState(false);
  const [buyBallsCount, setBuyBallsCount] = useState(10);
  const [wagerPerBall, setWagerPerBall] = useState(10); // Default 10 MORBIUS per ball (V5)
  const [usePLS, setUsePLS] = useState(false); // Toggle between MORBIUS and PLS
  const [buyRiskLevel, setBuyRiskLevel] = useState<RiskLevel>('YELLOW'); // Selected risk for buying
  const [selectedRisk, setSelectedRisk] = useState<RiskLevel>('YELLOW'); // Track selected risk in contract mode
  const [animationQueue, setAnimationQueue] = useState<Array<{ bucket: number; risk: RiskLevel; multiplier: number; payout: number; seed: string }>>([]);
  const [isAnimating, setIsAnimating] = useState(false);
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
    needsApproval: hookNeedsApproval,
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

  // Computed value: Controls should be disabled during auto-drop or transaction processing
  const shouldDisableControls = isAutoDrop || isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance;

  // Custom approval handler
  const handleCustomApproval = (amount: bigint) => {
    approve(amount);
  };

  // Reset pending purchase when modal closes or payment method changes
  useEffect(() => {
    if (!showBuyBallsModal) {
      setPendingPurchase(null);
    }
  }, [showBuyBallsModal]);

  useEffect(() => {
    // Reset pending purchase when switching payment methods
    setPendingPurchase(null);
  }, [usePLS]);

  // Get contract ball balance (0 if free play or not connected)
  // Note: V5 removed ball balance - everything is buy-and-drop in one transaction
  const contractBallBalance = 0;

  // Get wager limits from contract (V5)
  const minWager = wagerLimitsData.data ? Number(formatEther(wagerLimitsData.data[0])) : 10;
  const maxWager = wagerLimitsData.data ? Number(formatEther(wagerLimitsData.data[1])) : 10000;

  // Listen for BallDropped events from the contract (for live updates from other players or delayed events)
  useWatchBallDropped((event: any) => {
    console.log('🔴 LIVE BallDropped event received (useWatchContractEvent):', event);

    if (!event.args) {
      console.log('⚠️ Event has no args, skipping');
      return;
    }

    const { bucket, multiplier, payout, riskLevel } = event.args;

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

    // Add to animation queue
        setAnimationQueue(prev => [...prev, {
          bucket: bucketIndex,
          risk,
          multiplier: actualMultiplier,
          payout: Number(formatEther(payout)),
          seed: event.args.seed.toString()
        }]);
  });

  // AutoPlay state tracking
  const initialWagerRef = useRef(0.30);
  const startingBalanceRef = useRef(1000);
  const lastWinAmountRef = useRef(0);
  const currentWagerRef = useRef(1.00); // Track current wager for auto-play calculations
  const isAutoDropRef = useRef(false); // Track auto-drop status synchronously
  const autoPlaySettingsRef = useRef<AutoPlaySettings | null>(null); // Track settings synchronously
  const chartRef = useRef<RealTimeBetChartRef>(null); // Ref for the real-time chart
  const chartSessionStartTime = useRef(Date.now()); // Fixed session start time

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

    // 2. Update local UI state (Win/Loss Badge)
    const winAmount = actualWager * actualMultiplier;
    const badgeProfit = winAmount - actualWager;
    setWinLossBadge({ amount: badgeProfit, key: Date.now() });

    // 3. Update real-time performance chart
    if (chartRef.current) {
      chartRef.current.addDataPoint(actualMultiplier, bucketIndex, contractData);
    }

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
      // FREE PLAY MODE: Original logic
      // CRITICAL: Use currentWagerRef to get the actual wager at drop time, not score time
      const freePlayWinAmount = actualWager * actualMultiplier;
      const freePlayProfit = freePlayWinAmount - actualWager;
      lastWinAmountRef.current = freePlayWinAmount;
      lastBucketIndexRef.current = bucketIndex; // Store bucket index

      console.log('Current Wager (from ref):', actualWager);
      console.log('Wager state:', wager);
      console.log('Is Auto Drop:', isAutoDrop);
      console.log('Auto Play Settings:', autoPlaySettings);
      console.log('Remaining Balls:', remainingBalls);
      console.log('Game Balance:', gameState.balance);

      setGameState(prev => {
        const newBalance = prev.balance + freePlayWinAmount;

        // Check AutoPlay stop conditions
        console.log('Auto-drop check:', isAutoDropRef.current, '&&', !!autoPlaySettingsRef.current, '=', isAutoDropRef.current && autoPlaySettingsRef.current);
        if (isAutoDropRef.current && autoPlaySettingsRef.current) {
          // Stop if cash decreases by
        if (autoPlaySettingsRef.current!.stopOnLossEnabled) {
          const totalLoss = startingBalanceRef.current - newBalance;
          if (totalLoss >= autoPlaySettingsRef.current!.stopOnLossAmount) {
            console.log('=== AUTO-DROP DISABLED: Loss condition met ===');
            isAutoDropRef.current = false;
            autoPlaySettingsRef.current = null;
            setAutoPlaySettings(null);
            setIsAutoDrop(false);
            setRemainingBalls(0);
          }
        }

          // Stop if single win exceeds
          if (autoPlaySettingsRef.current!.stopOnBigWinEnabled && freePlayWinAmount >= autoPlaySettingsRef.current!.stopOnBigWinAmount) {
            console.log('=== AUTO-DROP DISABLED: Big win condition met ===');
            isAutoDropRef.current = false;
            autoPlaySettingsRef.current = null;
            setAutoPlaySettings(null);
            setIsAutoDrop(false);
            setRemainingBalls(0);
          }

          // Stop if cash increases by
          if (autoPlaySettingsRef.current!.stopOnProfitEnabled) {
            const totalProfit = newBalance - startingBalanceRef.current;
            if (totalProfit >= autoPlaySettingsRef.current!.stopOnProfitAmount) {
              console.log('=== AUTO-DROP DISABLED: Profit condition met ===');
              isAutoDropRef.current = false;
              autoPlaySettingsRef.current = null;
              setAutoPlaySettings(null);
              setIsAutoDrop(false);
              setRemainingBalls(0);
            }
          }

          // Apply bet progression strategy
          const isWin = actualMultiplier > 1;
          const strategy = isWin ? autoPlaySettingsRef.current!.onWinStrategy : autoPlaySettingsRef.current!.onLossStrategy;
          const percent = isWin ? autoPlaySettingsRef.current!.onWinPercent : autoPlaySettingsRef.current!.onLossPercent;

          console.log('Win/Loss:', isWin ? 'WIN' : 'LOSS');
          console.log('Strategy:', strategy);
          console.log('Percent:', percent);
          console.log('*** APPLYING WAGER STRATEGY ***');
          console.log('currentWagerRef.current:', currentWagerRef.current);
          console.log('wager state:', wager);

          // Use currentWagerRef to get the most up-to-date wager value
          let currentWager = currentWagerRef.current || wager;
          console.log('Using currentWager:', currentWager);
          let newWager = currentWager;

          if (strategy === 'reset') {
            newWager = initialWagerRef.current;
            console.log('Resetting bet to initial:', newWager);
          } else if (strategy === 'increase') {
            newWager = +(currentWager * (1 + percent / 100)).toFixed(2);
            console.log('Increasing bet from', currentWager, 'to', newWager);
          } else if (strategy === 'decrease') {
            newWager = Math.max(0.1, +(currentWager * (1 - percent / 100)).toFixed(2));
            console.log('Decreasing bet from', currentWager, 'to', newWager);
          }

          // Update wager immediately
          if (newWager !== currentWager) {
            console.log('*** UPDATING WAGER FROM', currentWager, 'TO', newWager, '***');
            setWagerWithPersistence(newWager);
          }
        }

        return {
          ...prev,
          balance: newBalance
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
  }, [isAutoDrop, autoPlaySettings, plinkoHistory, freePlayEnabled, wager, gameState.balance, remainingBalls, wagerPerBall]); // Added dependencies

  // Robust transaction receipt polling for PulseChain
  const pollForReceipt = useCallback(async (
    txHash: `0x${string}`,
    options: {
      maxAttempts?: number;
      intervalMs?: number;
      onAttempt?: (attempt: number) => void;
    } = {}
  ) => {
    const { maxAttempts = 30, intervalMs = 4000, onAttempt } = options;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        onAttempt?.(attempt);
        const receipt = await publicClient?.getTransactionReceipt({ hash: txHash });

        if (receipt) {
          console.log(`✅ Transaction confirmed on attempt ${attempt}`);
          return receipt;
        }

        // Wait before next attempt
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      } catch (error) {
        console.warn(`Receipt fetch attempt ${attempt} failed:`, error);
        // Continue to next attempt
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      }
    }

    throw new Error(`Transaction receipt not found after ${maxAttempts} attempts`);
  }, [publicClient]);

  // Contract: Buy balls with MORBIUS or PLS (V5 - variable wagers)
  const buyBalls = useCallback(async (count: number, wagerPerBallMORBIUS: number, useNativePLS: boolean) => {
    if (!address || !isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    // Validate wager amount
    if (wagerPerBallMORBIUS < minWager || wagerPerBallMORBIUS > maxWager) {
      alert(`Wager must be between ${minWager} and ${maxWager} MORBIUS per ball`);
      return;
    }

    // For MORBIUS purchases, check approval and handle automatically
    if (!useNativePLS && allowance !== undefined && allowance < parseEther((wagerPerBallMORBIUS * count).toString())) {
      // Store the purchase details for after approval
      setPendingPurchase({ count, wagerPerBallMORBIUS, useNativePLS });
      // Show approval modal instead of auto-approving
      setShowApprovalModal(true);
      return;
    }

    try {
      // Map UI risk level (GREEN/YELLOW/RED) to contract risk level (0/1/2)
      const riskKey = buyRiskLevel.toLowerCase() as keyof typeof RISK_LEVEL_MAP;
      const contractRiskLevel = RISK_LEVEL_MAP[riskKey];

      if (contractRiskLevel === undefined) {
        throw new Error(`Invalid risk level: ${buyRiskLevel}`);
      }

      const wagerAmount = parseEther(wagerPerBallMORBIUS.toString());
      let txHash;

      if (useNativePLS) {
        // Buy with native PLS and drop in ONE transaction
        // Contract internally wraps PLS → WPLS → swaps to MORBIUS
        if (!wplsPerMORBIUS) {
          throw new Error('PLS price not available. Please try again or use MORBIUS.');
        }

        const totalCost = wagerAmount * BigInt(count);
        // Contract uses 150% buffer, so we match it exactly
        const plsNeeded = calculateWplsAmount(totalCost, wplsPerMORBIUS, 150); // 150% buffer to match contract

        console.log(`Buying ${count} balls @ ${wagerPerBallMORBIUS} MORBIUS each with native PLS:`, {
          wagerPerBall: wagerPerBallMORBIUS,
          totalMorbiusCost: formatEther(totalCost),
          nativePLS: formatEther(plsNeeded),
          risk: buyRiskLevel,
          contractRiskLevel,
        });

        txHash = await writeContractAsync({
          address: PLINKO_ADDRESS,
          abi: PLINKO_ABI,
          functionName: 'buyBallsWithPLSAndDrop',
          args: [BigInt(count), wagerAmount, Number(contractRiskLevel)],
          value: plsNeeded, // Send native PLS with transaction
        });
      } else {
        // Buy with MORBIUS and drop in ONE transaction
        const totalCost = wagerAmount * BigInt(count);

        console.log(`Buying ${count} balls @ ${wagerPerBallMORBIUS} MORBIUS each:`, {
          wagerPerBall: wagerPerBallMORBIUS,
          totalCost: formatEther(totalCost),
          risk: buyRiskLevel,
          contractRiskLevel,
        });

        txHash = await writeContractAsync({
          address: PLINKO_ADDRESS,
          abi: PLINKO_ABI,
          functionName: 'buyBallsAndDrop',
          args: [BigInt(count), wagerAmount, Number(contractRiskLevel)],
        });
      }

      // Wait for the transaction to be confirmed with polling
      console.log('Waiting for buy-and-drop transaction confirmation...', txHash);
      setIsConfirmingTransaction(true);
      setConfirmationStage('broadcast');
      const receipt = await pollForReceipt(txHash, {
        maxAttempts: 30, // 30 attempts
        intervalMs: 4000, // 4 seconds between attempts
        onAttempt: (attempt) => {
          if (attempt % 5 === 0) { // Log every 5 attempts
            console.log(`Still waiting for confirmation... (${attempt}/30)`);
          }
          // Update confirmation stage based on progress
          if (attempt <= 10) {
            setConfirmationStage('broadcast');
          } else if (attempt <= 20) {
            setConfirmationStage('mempool');
          } else {
            setConfirmationStage('mined');
          }
        }
      });
      setIsConfirmingTransaction(false);
      setConfirmationStage(null);

      // Check if transaction actually succeeded
      if (!receipt) {
        throw new Error('Transaction receipt not found');
      }

      if (receipt.status === 'reverted') {
        throw new Error('Transaction reverted! Please check: 1) You approved MORBIUS spending, 2) You have enough MORBIUS, 3) Contract has enough reserve');
      }

      console.log('✅ Transaction confirmed! All balls purchased and dropped.');

      // 1. Get the BallDropped Topic Hash (Topic 0)
      // This is the unique ID for the BallDropped event from the deployed contract
      // Updated for V5.1 with seed field: BallDropped(address,uint256,uint8,uint256,uint256,uint8)
      const BALL_DROPPED_TOPIC = '0x30783330098d3f5ba08918f162dd444f105033a06e699dfcfc7f8571286cda34';

      const ballDroppedLogs = receipt.logs.filter(log =>
        log.topics[0] === BALL_DROPPED_TOPIC &&
        log.address.toLowerCase() === PLINKO_ADDRESS.toLowerCase()
      );

      console.log(`Found ${ballDroppedLogs.length} BallDropped events`);

      let totalWon = 0;
      const results: Array<{ bucket: number; multiplier: number; payout: number }> = [];
      const newAnimations: Array<{ bucket: number; risk: RiskLevel; multiplier: number; payout: number; seed: string }> = [];

      // 2. Use the full Plinko ABI for decoding
      ballDroppedLogs.forEach((log, index) => {
        try {
          console.log(`Decoding log ${index}:`, {
            address: log.address,
            topics: log.topics,
            data: log.data
          });

              // Try to decode with the full contract ABI
          const decoded = decodeEventLog({
            abi: PLINKO_ABI, // Use the full contract ABI
            data: log.data,
            topics: log.topics,
          });

          // Check if this is a BallDropped event and has args
          if (decoded && decoded.eventName === 'BallDropped' && decoded.args) {
            const args = decoded.args as any;

            // Convert raw values (bigints/strings) to numbers
            // Contract now returns 0-indexed buckets (0-16)
            const bucketIndex = Number(args.bucket);
            const actualMultiplier = Number(args.multiplier) / 100;
            const payoutAmount = Number(formatEther(args.payout));

            // Map Risk (0=Green, 1=Yellow, 2=Red)
            const riskMap: RiskLevel[] = ['GREEN', 'YELLOW', 'RED'];
            const risk = riskMap[Number(args.riskLevel)] || 'YELLOW';

            totalWon += payoutAmount;
            results.push({ bucket: bucketIndex, multiplier: actualMultiplier, payout: payoutAmount });

            // Add to our temporary local queue
            newAnimations.push({
              bucket: bucketIndex,
              risk,
              multiplier: actualMultiplier,
              payout: payoutAmount,
              seed: args.seed.toString()
            });
          }
        } catch (err) {
          console.warn(`Failed to decode Plinko log ${index}:`, err);
        }
      });

      // 3. Update the state once at the end (MUCH more reliable)
      if (newAnimations.length > 0) {
        console.log(`✅ Successfully decoded ${newAnimations.length} balls. Adding to queue.`);
        setAnimationQueue(prev => [...prev, ...newAnimations]);

        // Record each contract drop in history with transaction hash
        for (let i = 0; i < newAnimations.length; i++) {
          const animation = newAnimations[i];
          const result = results[i];
          if (result) {
            await plinkoHistory.recordDrop(
              wagerPerBall, // Use the wager per ball from contract mode
              result.multiplier,
              animation.risk,
              result.bucket,
              txHash // Include the transaction hash
            );
          }
        }

        setDropSummaryData({
          txHash,
          totalWon,
          ballCount: newAnimations.length,
          results
        });
      } else {
        console.error("❌ Failed to find any valid Plinko results in the transaction receipt.");
        alert("Transaction successful, but could not decode results. Please refresh your balance.");
      }

      // Manually refetch player data
      await playerInfo.refetch();
      console.log('Player data refreshed');

      setShowBuyBallsModal(false);

    } catch (error: any) {
      console.error('Error buying and dropping balls:', error);
      setIsConfirmingTransaction(false); // Reset confirmation state on error

      // Better error messages
      let errorMessage = 'Failed to buy and drop balls';
      if (error.message?.includes('user rejected')) {
        errorMessage = 'Transaction rejected by user';
      } else if (error.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient funds in wallet';
      } else if (error.message?.includes('PLS price')) {
        errorMessage = error.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      alert(errorMessage);
    }
  }, [address, isConnected, minWager, maxWager, writeContractAsync, wplsPerMORBIUS, publicClient, playerInfo, buyRiskLevel, allowance, approve, pollForReceipt]);

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
      if (dropReceipt.status !== 1) {
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
  }, [address, isConnected, contractBallBalance, writeContractAsync, publicClient, playerInfo]);

  const dropBall = useCallback((risk: RiskLevel) => {
    // Update selected risk level
    lastRiskRef.current = risk;
    setSelectedRisk(risk);

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
        // Optionally open buy modal automatically
        setShowBuyBallsModal(true);
      }
      return;
    }

    // Free play mode: drop immediately
    setGameState(prev => {
      if (prev.balance < wager) {
        isAutoDropRef.current = false;
        autoPlaySettingsRef.current = null;
        setAutoPlaySettings(null);
        setIsAutoDrop(false);
        return prev;
      }
      setLastDrop({ id: Date.now(), risk });
      return {
        ...prev,
        balance: prev.balance - wager,
        ballCount: prev.ballCount + 1
      };
    });
  }, [wager, freePlayEnabled, contractBallBalance]);

  // AutoPlay handler
  const handleStartAutoPlay = useCallback((settings: AutoPlaySettings) => {
    console.log('=== STARTING AUTO-PLAY ===');
    console.log('Settings:', settings);
    console.log('Initial Wager:', wager);
    console.log('Initial Balance:', gameState.balance);
    autoPlaySettingsRef.current = settings; // Set ref synchronously
    setAutoPlaySettings(settings);
    setRemainingBalls(settings.numberOfRounds);
    initialWagerRef.current = wager;
    startingBalanceRef.current = gameState.balance;
    isAutoDropRef.current = true; // Set ref synchronously
    setIsAutoDrop(true);
    console.log('Auto-drop enabled');
  }, [wager, gameState.balance]);

  // Process animation queue for contract mode
  useEffect(() => {
    if (animationQueue.length === 0 || isAnimating || freePlayEnabled) return;

    // Start animating the first item in queue
    setIsAnimating(true);
    const nextAnimation = animationQueue[0];

    console.log('Starting animation for ball:', nextAnimation);

    // Update the last risk ref to match the ball's risk
    lastRiskRef.current = nextAnimation.risk;

    // Calculate profit for badge (payout includes the wager, so profit = payout - wager)
    // wager = payout / multiplier (since payout = wager * multiplier)
    const wagerAmount = nextAnimation.multiplier > 0 ? nextAnimation.payout / nextAnimation.multiplier : 0;
    const profit = nextAnimation.payout - wagerAmount;

    // Trigger the drop animation with predetermined bucket result
    setLastDrop({
      id: Date.now(),
      risk: nextAnimation.risk,
      contractResult: {
        seed: nextAnimation.seed,
        bucket: nextAnimation.bucket,
        multiplier: nextAnimation.multiplier,
        payout: nextAnimation.payout
      }
    });

    // The ball will drop with physics guidance and trigger scoring on collision
    // Win/loss badge will be set by handleScore when ball actually hits bucket

    // Remove this item from queue and allow next animation after delay
    setTimeout(() => {
      const newQueue = animationQueue.slice(1);
      setAnimationQueue(newQueue);
      setIsAnimating(false);

      // History recording now happens when ball hits bucket (via handleScore) - no longer here

      // If this was the last ball and we have summary data, the toast will appear automatically
      // No need to manually trigger modal - toast shows when dropSummaryData exists
    }, dropSpeed === 'burst' ? 100 : dropSpeed === 'fast' ? 500 : 1000); // Speed based on drop mode

  }, [animationQueue, isAnimating, freePlayEnabled, handleScore, dropSummaryData]);

  // Auto Drop Logic
  useEffect(() => {
    let interval: number | null = null;
    if (isAutoDrop && remainingBalls > 0 && autoPlaySettings) {
      interval = window.setInterval(() => {
        dropBall(autoPlaySettings.riskLevel);
        setRemainingBalls(prev => {
          const newCount = prev - 1;
          if (newCount <= 0) {
            console.log('=== AUTO-DROP DISABLED: All balls completed ===');
            isAutoDropRef.current = false;
            autoPlaySettingsRef.current = null;
            setAutoPlaySettings(null);
            setIsAutoDrop(false);
            setRemainingBalls(0);
          }
          return newCount;
        });
      }, dropSpeed === 'burst' ? 100 : dropSpeed === 'fast' ? 500 : 1000); // Speed based on drop mode
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAutoDrop, dropBall, remainingBalls, autoPlaySettings]);

  // Function to determine number of history cards to show based on screen size
  const getHistoryCardCount = () => {
    if (typeof window === 'undefined') return 3;
    if (window.innerWidth >= 1024) return 6; // lg and above
    if (window.innerWidth >= 768) return 4; // md
    return 3; // sm and below
  };

  // Detect mobile devices for responsive background and UI
  useEffect(() => {
    const checkScreenSize = () => {
      const mobile = window.innerWidth < 768; // Better mobile breakpoint
      setIsMobile(mobile);
      setHistoryCardCount(getHistoryCardCount());

      // Adjust viewport for mobile devices
      if (mobile) {
        const viewport = document.querySelector('meta[name="viewport"]');
        if (viewport) {
          viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
        }
      }
    };

    checkScreenSize(); // Check on mount
    window.addEventListener('resize', checkScreenSize);

    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

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

      {/* Main Content */}
      <MainNav
        balance={freePlayEnabled ? gameState.balance : contractBallBalance}
        soundEnabled={soundEnabled}
        onSoundToggle={() => setSoundEnabled(!soundEnabled)}
        freePlayEnabled={freePlayEnabled}
        onFreePlayToggle={() => setFreePlayEnabled(!freePlayEnabled)}
        onShowHistory={() => setShowPlinkoHistory(true)}
        onBuyBalls={!freePlayEnabled && contractBallBalance === 0 ? () => setShowBuyBallsModal(true) : undefined}
        ballCount={!freePlayEnabled ? contractBallBalance : undefined}
      />

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
      <div className="flex relative pt-16 px-2 gap-2 flex-col lg:flex-row lg:px-3 lg:gap-3 min-h-[calc(100vh-4rem)]">
        {/* LEFT COLUMN - BUY SECTION + CHART - Mobile-first responsive */}
        <div className="order-2 lg:order-1 lg:flex lg:w-[320px] xl:w-[360px] 2xl:w-[400px] lg:flex-col lg:p-1 lg:overflow-y-auto lg:relative lg:z-20 lg:self-stretch">
          {!freePlayEnabled && (
            <div
              className="relative rounded-2xl overflow-hidden h-full flex flex-col"
              style={{
                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                border: '1px inset rgba(60, 60, 60, 0.5)',
              }}
            >
              <div className="relative z-10 p-3 lg:p-3 xl:p-4 2xl:p-5 flex-1 flex flex-col justify-center">
                {/* Multiplier Table Button - Top Right */}
                <button
                  onClick={() => setShowMultiplierTable(true)}
                  className="absolute top-2 right-3 text-white/50 hover:text-cyan-300 text-xs underline font-medium transition-colors"
                >
                  Risk Tables
                </button>


                {/* Grid Layout - Mobile-first responsive */}
                <div className="grid grid-cols-2 gap-2 mb-2 lg:mb-3">
                  {/* Risk Level Selection */}
                  <div className="col-span-2">
                    <label className="block text-cyan-300 text-center text-sm uppercase font-bold mb-1">Risk Level</label>
                    <RadioGroup
                      value={buyRiskLevel}
                      onValueChange={(value) => setBuyRiskLevel(value as RiskLevel)}
                      className="flex flex-row gap-2"
                    >
                      {(['GREEN', 'YELLOW', 'RED'] as RiskLevel[]).map((risk, index) => {
                        const labels = ['Low', 'Medium', 'High'];
                        const isSelected = buyRiskLevel === risk;
                        return (
                          <label
                            key={risk}
                            htmlFor={`buy-${risk}`}
                            className={`flex-1 cursor-pointer rounded-lg p-2 text-center transition ${
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
                            <RadioGroupItem value={risk} id={`buy-${risk}`} className="hidden" />
                            <div className="text-xs font-bold">{labels[index]}</div>
                          </label>
                        );
                      })}
                    </RadioGroup>
                  </div>

                  {/* Wager Per Ball */}
                  <div>
                    <label className="block text-center text-cyan-300/80 text-sm lg:text-sm xl:text-md font-bold mb-1">Wager/Ball</label>
                    <input
                      type="number"
                      min={minWager}
                      max={maxWager}
                      value={wagerPerBall}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || minWager;
                        setWagerPerBall(Math.max(minWager, Math.min(maxWager, value)));
                      }}
                      disabled={isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance}
                      className={`w-full h-9 lg:h-10 xl:h-11 rounded-lg px-2 text-cyan-300 text-center text-base lg:text-base xl:text-lg font-bold focus:outline-none bg-transparent border-none ${(isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance) ? 'opacity-50 cursor-not-allowed' : ''}`}
                      style={{
                        boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.03)',
                      }}
                    />
                  </div>

                  {/* Number of Balls */}
                  <div>
                    <label className="block text-center text-cyan-300/80 text-sm lg:text-sm xl:text-md font-bold mb-1">Balls</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={buyBallsCount}
                      onChange={(e) => setBuyBallsCount(parseInt(e.target.value) || 1)}
                      disabled={isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance}
                      className={`w-full h-9 lg:h-10 xl:h-11 rounded-lg px-2 text-cyan-300 text-center text-base lg:text-base xl:text-lg font-bold focus:outline-none bg-transparent border-none ${(isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance) ? 'opacity-50 cursor-not-allowed' : ''}`}
                      style={{
                        boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.03)',
                      }}
                    />
                  </div>

                  {/* Wager Preset Buttons */}
                  <div className="grid grid-cols-4 gap-0">
                    {[10, 100, 500, 1000].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setWagerPerBall(Math.max(minWager, Math.min(maxWager, amount)))}
                        disabled={isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance}
                        className={`py-2 text-center text-xs font-bold transition-all touch-manipulation ${
                          wagerPerBall === amount
                            ? 'text-cyan-300'
                            : 'text-gray-500 hover:text-gray-400'
                        } ${
                          (isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance) ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        style={{
                          boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
                        }}
                      >
                        {amount}
                      </button>
                    ))}
                  </div>

                  {/* Balls Preset Buttons */}
                  <div className="grid grid-cols-4 gap-0">
                    {[1, 10, 50, 100].map((count) => (
                      <button
                        key={count}
                        onClick={() => setBuyBallsCount(count)}
                        disabled={isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance}
                        className={`py-2 text-center text-xs font-bold transition-all touch-manipulation ${
                          buyBallsCount === count
                            ? 'text-cyan-300'
                            : 'text-gray-500 hover:text-gray-400'
                        } ${
                          (isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance) ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        style={{
                          boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
                        }}
                      >
                        {count}
                      </button>
                    ))}
                  </div>

                  {/* Payment Method Toggle */}
                  <div className="col-span-2">
                    <label className="block text-cyan-300 text-center text-sm uppercase font-bold mb-1 lg:mb-2">Payment Method</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setUsePLS(false)}
                        disabled={isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance}
                        className={`py-2 rounded-lg text-xs lg:text-sm font-bold transition-all touch-manipulation flex items-center justify-center gap-1.5 ${
                          !usePLS
                            ? 'text-cyan-300 shadow-lg'
                            : 'text-white/40 hover:text-white/60 active:text-white'
                        } ${(isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance) ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                        onClick={() => setUsePLS(true)}
                        disabled={isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance || priceError || isLoadingPrice}
                        className={`py-2 rounded-lg text-xs lg:text-sm font-bold transition-all touch-manipulation flex items-center justify-center gap-1.5 ${
                          usePLS
                            ? 'text-purple-300 shadow-lg'
                            : 'text-white/40 hover:text-white/60 active:text-white'
                        } ${(isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance || priceError || isLoadingPrice) ? 'opacity-50 cursor-not-allowed' : ''}`}
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

                {/* Error Messages */}
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

                {/* Total Cost and Buy Button Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                  {/* Total Cost Display */}
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
                        <>
                          <div className={`text-lg lg:text-xl xl:text-2xl font-black ${usePLS ? 'text-purple-300' : 'text-cyan-300'}`}>
                            {usePLS
                              ? (() => {
                                  const morbiusCost = parseEther(wagerPerBall.toString()) * BigInt(buyBallsCount);
                                  const plsCost = calculateWplsAmount(morbiusCost, wplsPerMORBIUS, 150);
                                  return (Number(plsCost) / 1e18).toFixed(2);
                                })()
                              : (wagerPerBall * buyBallsCount).toLocaleString()
                            }
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Buy Button */}
                  <button
                  onClick={() => buyBalls(buyBallsCount, wagerPerBall, usePLS)}
                  disabled={!isConnected || isLoadingAllowance || isApproving || !!pendingPurchase || isConfirmingTransaction}
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
                    : isApproving || !!pendingPurchase
                    ? 'Approving...'
                    : `Buy & Drop ${buyBallsCount} Ball${buyBallsCount !== 1 ? 's' : ''}`}
                </button>
                </div>

                {/* Drop Speed Controls */}
                <div className="mt-6">
                  <div className="text-center mb-2">
                    <div className="text-cyan-300 text-sm font-bold uppercase tracking-wider">Drop Speed</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {[
                      { speed: 'normal' as DropSpeed, label: 'Normal' },
                      { speed: 'fast' as DropSpeed, label: 'Fast' },
                      { speed: 'burst' as DropSpeed, label: 'Burst' }
                    ].map(({ speed, label }) => (
                      <button
                        key={speed}
                        onClick={() => setDropSpeed(speed)}
                        disabled={isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance}
                        className={`h-15 w-full rounded-lg text-xs font-bold transition-all touch-manipulation ${
                          dropSpeed === speed
                            ? usePLS
                              ? 'text-cyan-300'
                              : 'text-cyan-300'
                            : 'text-gray-500 hover:text-gray-400'
                        } ${(isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance) ? 'opacity-50 cursor-not-allowed' : ''}`}
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
          )}
        </div>

        {/* RIGHT COLUMN - PLINKO BOARD */}
        <div className="flex-1 relative max-[799px]:order-1 min-[600px]:pt-0 pt-20 min-[800px]:pb-12 min-[800px]:p-4 max-[799px]:min-h-[50vh]">
          {/* Embossed Background Panel Behind Plinko Board */}
          <div className="absolute inset-0 min-[600px]:left-0 min-[800px]:right-0">
            <div
              className="w-full h-full rounded-2xl relative"
              style={{
                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                border: '1px inset rgba(60, 60, 60, 0.5)',
              }}
            >
              {/* History Display */}
              <div className="absolute top-4 left-4 right-4 flex items-center gap-2 z-50">
                <button
                  onClick={() => setShowExtendedHistory(true)}
                  className="w-7 h-7 rounded-full text-white flex items-center justify-center flex-shrink-0 transition-all duration-75 active:scale-95"
                  style={{
                    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                    border: '1px inset rgba(60, 60, 60, 0.5)',
                  }}
                  title="View extended history"
                >
                  <i className="fas fa-history text-[10px]"></i>
                </button>
                <div className="flex gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-cyan-400/30 scrollbar-track-transparent hover:scrollbar-thumb-cyan-400/50 scroll-smooth flex-1">
                  {history.length > 0 ? history.slice(0, historyCardCount).map((item, index) => (
                    <div
                      key={item.id}
                      className={`${index === 0 ? 'history-item-enter' : ''} px-1.5 py-0.5 md:px-2 md:py-1 lg:px-3 lg:py-1.5 text-[10px] md:text-xs lg:text-sm font-black min-w-fit text-white/60 transition-all duration-300 rounded`}
                      style={{
                        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                        boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                        border: '1px inset rgba(60, 60, 60, 0.5)',
                      }}
                    >
                      {item.multiplier}x
                    </div>
                  )) : (
                    <div className="text-[12px] md:text-[10px] lg:text-smxsw text-cyan-300/60 font-bold uppercase tracking-wide px-1 italic">Waiting...</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
            <div className="pointer-events-auto w-full h-full">
              <PlinkoGame
                onScore={handleScore}
                lastDrop={lastDrop}
                selectedRiskLevel={buyRiskLevel}
                soundEnabled={soundEnabled}
                onSoundToggle={setSoundEnabled}
              />
            </div>
          </div>

          {/*
          Provable Fairness Verification UI
          {lastDrop?.contractResult?.seed && (
            <div className="absolute top-4 right-4 z-20 bg-black/80 rounded-lg p-3 border border-cyan-400/30 max-w-xs">
              <div className="text-xs font-bold text-cyan-400 mb-2 uppercase tracking-wide">
                Provable Fairness
              </div>
              <div className="space-y-1 text-[10px] font-mono">
                <div className="flex justify-between">
                  <span className="text-gray-400">Server Seed:</span>
                  <span className="text-cyan-300 font-bold truncate ml-2" title={lastDrop.contractResult.seed}>
                    {lastDrop.contractResult.seed.slice(0, 8)}...
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Bucket:</span>
                  <span className="text-green-400 font-bold">
                    #{lastDrop.contractResult.bucket}
                  </span>
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-600">
                <button
                  className="w-full text-[10px] bg-cyan-600 hover:bg-cyan-500 text-white px-2 py-1 rounded transition-colors font-bold"
                  onClick={() => {
                    // TODO: Implement verification link/script
                    if (lastDrop.contractResult) {
                      window.open(`https://plinko-verifier.example.com/verify?seed=${lastDrop.contractResult.seed}&bucket=${lastDrop.contractResult.bucket}`, '_blank');
                    }
                  }}
                >
                  Verify Result
                </button>
              </div>
            </div>
          )}
          */}
        </div>
      </div>

      {/* FULL-WIDTH CHART - Below 2-column layout */}
      <div className="lg:block px-3 mt-4 mb-6">
        <div className="h-64 md:h-72 lg:h-80">
          <RealTimeBetChart
            ref={chartRef}
            sessionStartTime={chartSessionStartTime.current}
            contractWagerPerBall={wagerPerBall}
            freePlayWager={currentWagerRef.current}
          />
        </div>
      </div>

      {/* CONTROLS - Below buy section */}
      <div className="fixed bottom-[20px] left-0 right-0 z-20 pointer-events-none">
        <div
          className="flex-shrink-0 bg-black/20 rounded-2xl mx-auto pt-[10px]"
          style={{
            backgroundColor: 'rgba(29, 246, 221, 0)'
          }}
        >
          {/* Desktop Layout - 2 Rows */}
          <div className="hidden sm:flex flex-col gap-2 p-2">
            {/* Row 1: Bet Amount + Control Buttons */}
            <div className="flex items-center justify-center gap-2">
              {/* Bet Amount Display */}
              {false && <button
                onClick={() => setShowCustomAmountModal(true)}
                className="bg-gradient-to-b from-[#6FF4FF] via-[#1BE7FF] to-[#0BA5C4] rounded-full px-5 py-2 shadow-xl shadow-black/60 border-b-4 border-[#1BE7FF]/80 min-w-[140px] hover:from-[#1BE7FF] hover:via-[#1BE7FF]/90 hover:to-[#1BE7FF]/70 hover:shadow-black/80 hover:border-[#1BE7FF] active:shadow-inner active:shadow-black/40 active:border-[#1BE7FF]/60 active:scale-95 transition-all duration-75"
                style={{
                  boxShadow: '0 4px 8px rgba(0,0,0,0.6), 0 0 20px rgba(27, 231, 255, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                <div className="text-center">
                  <div className="text-black/60 text-[9px] font-medium uppercase tracking-wide">Bet USD</div>
                  <div className="text-black font-bold text-lg font-poppins">{wager.toFixed(2)}</div>
                </div>
              </button>}

              {/* Control Buttons Group */}
              {false && <>
              <button
                onMouseDown={() => startAdjusting(-0.1)}
                onMouseUp={stopAdjusting}
                onMouseLeave={stopAdjusting}
                onTouchStart={() => startAdjusting(-0.1)}
                onTouchEnd={stopAdjusting}
                className="w-8 h-8 rounded-full bg-gradient-to-b from-[#6FF4FF] via-[#1BE7FF] to-[#0BA5C4] text-black font-bold text-xl shadow-xl shadow-black/60 border-b-4 border-[#1BE7FF]/80 hover:from-[#1BE7FF] hover:via-[#1BE7FF]/90 hover:to-[#1BE7FF]/70 hover:shadow-black/80 hover:border-[#1BE7FF] active:shadow-inner active:shadow-black/40 active:border-[#1BE7FF]/60 active:scale-95 transition-all duration-75"
                style={{
                  boxShadow: '0 4px 8px rgba(0,0,0,0.6), 0 0 20px rgba(27, 231, 255, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                −
              </button>
              <button
                onClick={() => setShowPresetModal(true)}
                className="w-11 h-11 rounded-full bg-gradient-to-b from-[#6FF4FF] via-[#1BE7FF] to-[#0BA5C4] text-black shadow-xl shadow-black/60 border-b-4 border-[#1BE7FF]/80 hover:from-[#1BE7FF] hover:via-[#1BE7FF]/90 hover:to-[#1BE7FF]/70 hover:shadow-black/80 hover:border-[#1BE7FF] active:shadow-inner active:shadow-black/40 active:border-[#1BE7FF]/60 active:scale-95 transition-all duration-75 flex items-center justify-center"
                style={{
                  boxShadow: '0 4px 8px rgba(0,0,0,0.6), 0 0 20px rgba(27, 231, 255, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                <i className="fas fa-layer-group text-sm"></i>
              </button>
              <button
                onMouseDown={() => startAdjusting(0.1)}
                onMouseUp={stopAdjusting}
                onMouseLeave={stopAdjusting}
                onTouchStart={() => startAdjusting(0.1)}
                onTouchEnd={stopAdjusting}
                className="w-8 h-8 rounded-full bg-gradient-to-b from-[#6FF4FF] via-[#1BE7FF] to-[#0BA5C4] text-black font-bold text-xl shadow-xl shadow-black/60 border-b-4 border-[#1BE7FF]/80 hover:from-[#1BE7FF] hover:via-[#1BE7FF]/90 hover:to-[#1BE7FF]/70 hover:shadow-black/80 hover:border-[#1BE7FF] active:shadow-inner active:shadow-black/40 active:border-[#1BE7FF]/60 active:scale-95 transition-all duration-75"
                style={{
                  boxShadow: '0 4px 8px rgba(0,0,0,0.6), 0 0 20px rgba(27, 231, 255, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                +
              </button>
              </>}
            </div>

            {/* Row 2: Risk Level Buttons + Auto Play */}
            {false && <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => dropBall('GREEN')}
                disabled={shouldDisableControls}
                className={`h-10 px-6 rounded-full bg-gradient-to-b from-[#AFFC41] via-[#AFFC41]/80 to-[#AFFC41]/60 text-black font-bold text-sm shadow-xl shadow-black/60 border-b-4 border-[#AFFC41]/80 hover:from-[#AFFC41] hover:via-[#AFFC41]/90 hover:to-[#AFFC41]/70 hover:shadow-black/80 hover:border-[#AFFC41] active:shadow-inner active:shadow-black/40 active:border-[#AFFC41]/60 active:scale-95 transition-all duration-75 uppercase tracking-wider ${!freePlayEnabled && selectedRisk === 'GREEN' && contractBallBalance === 0 ? 'ring-4 ring-white' : ''} ${shouldDisableControls ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{
                  boxShadow: '0 4px 8px rgba(0,0,0,0.6), 0 0 20px rgba(175, 252, 65, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                {contractBallBalance > 0 ? `DROP ${contractBallBalance}` : `BUY ${buyBallsCount}`} {!freePlayEnabled && selectedRisk === 'GREEN' && contractBallBalance === 0 ? '✓' : ''}
              </button>
              <button
                onClick={() => dropBall('YELLOW')}
                disabled={shouldDisableControls}
                className={`h-10 px-6 rounded-full bg-gradient-to-b from-[#4392F1] via-[#4392F1]/80 to-[#4392F1]/60 text-black font-bold text-sm shadow-xl shadow-black/60 border-b-4 border-[#4392F1]/80 hover:from-[#4392F1] hover:via-[#4392F1]/90 hover:to-[#4392F1]/70 hover:shadow-black/80 hover:border-[#4392F1] active:shadow-inner active:shadow-black/40 active:border-[#4392F1]/60 active:scale-95 transition-all duration-75 uppercase tracking-wider ${!freePlayEnabled && selectedRisk === 'YELLOW' && contractBallBalance === 0 ? 'ring-4 ring-white' : ''} ${shouldDisableControls ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{
                  boxShadow: '0 4px 8px rgba(0,0,0,0.6), 0 0 20px rgba(67, 146, 241, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                {contractBallBalance > 0 ? `DROP ${contractBallBalance}` : `BUY ${buyBallsCount}`} {!freePlayEnabled && selectedRisk === 'YELLOW' && contractBallBalance === 0 ? '✓' : ''}
              </button>
              <button
                onClick={() => dropBall('RED')}
                disabled={shouldDisableControls}
                className={`h-10 px-6 rounded-full bg-gradient-to-b from-[#FF331F] via-[#FF331F]/80 to-[#FF331F]/60 text-black font-bold text-sm shadow-xl shadow-black/60 border-b-4 border-[#FF331F]/80 hover:from-[#FF331F] hover:via-[#FF331F]/90 hover:to-[#FF331F]/70 hover:shadow-black/80 hover:border-[#FF331F] active:shadow-inner active:shadow-black/40 active:border-[#FF331F]/60 active:scale-95 transition-all duration-75 uppercase tracking-wider ${!freePlayEnabled && selectedRisk === 'RED' && contractBallBalance === 0 ? 'ring-4 ring-white' : ''} ${shouldDisableControls ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{
                  boxShadow: '0 4px 8px rgba(0,0,0,0.6), 0 0 20px rgba(255, 51, 31, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                {contractBallBalance > 0 ? `DROP ${contractBallBalance}` : `BUY ${buyBallsCount}`} {!freePlayEnabled && selectedRisk === 'RED' && contractBallBalance === 0 ? '✓' : ''}
              </button>

              {/* Auto Play Button */}
              <button
                onClick={() => {
                  if (isAutoDrop) {
                    isAutoDropRef.current = false;
                    autoPlaySettingsRef.current = null;
                    setAutoPlaySettings(null);
                    setIsAutoDrop(false);
                    setRemainingBalls(0);
                  } else {
                    setShowAutoPlayModal(true);
                  }
                }}
                disabled={isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance}
                className={`w-12 h-12 rounded-full shadow-xl border-b-4 active:scale-95 transition-all duration-75 flex items-center justify-center ${
                  isAutoDrop
                    ? 'bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700 text-black shadow-black/60 border-yellow-800 hover:from-yellow-300 hover:via-yellow-400 hover:to-yellow-600 hover:shadow-yellow-900/90 hover:border-yellow-700 active:shadow-inner active:shadow-yellow-900/60 active:border-yellow-900'
                    : 'bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700 text-black shadow-black/60 border-yellow-800 hover:from-yellow-300 hover:via-yellow-400 hover:to-yellow-600 hover:shadow-black/80 hover:border-yellow-700 active:shadow-inner active:shadow-black/60 active:border-yellow-900'
                } ${(isConfirmingTransaction || !!pendingPurchase || isApproving || isLoadingAllowance) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isAutoDrop ? (
                  <span className="font-bold text-sm">{remainingBalls}</span>
                ) : (
                  <i className="fas fa-sync-alt text-lg"></i>
                )}
              </button>
            </div>}
          </div>

          {/* Mobile Layout - 2 Rows */}
          <div className="sm:hidden flex flex-col gap-2 p-4">
            {/* Row 1: Bet Display + Control Buttons */}
            <div className="flex items-center justify-center gap-1">
              {false && <button
                onClick={() => setShowCustomAmountModal(true)}
                className="bg-gradient-to-b from-[#6FF4FF] via-[#1BE7FF] to-[#0BA5C4] rounded-full px-4 py-1 shadow-xl shadow-black/60 border-b-4 border-[#1BE7FF]/80 min-w-[120px] hover:from-[#1BE7FF] hover:via-[#1BE7FF]/90 hover:to-[#1BE7FF]/70 hover:shadow-black/80 hover:border-[#1BE7FF] active:shadow-inner active:shadow-black/40 active:border-[#1BE7FF]/60 active:scale-95 transition-all duration-75"
                style={{
                  boxShadow: '0 4px 8px rgba(0,0,0,0.6), 0 0 20px rgba(27, 231, 255, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                <div className="text-center">
                  <div className="text-black text-[9px] font-medium uppercase tracking-wide">
                    {freePlayEnabled ? 'Bet USD' : 'Bet MORBIUS'}
                  </div>
                  <div className="text-black font-bold text-lg font-poppins">{wager.toFixed(2)}</div>
                </div>
              </button>}

              {false && <>
              <button
                onMouseDown={() => startAdjusting(-0.1)}
                onMouseUp={stopAdjusting}
                onMouseLeave={stopAdjusting}
                onTouchStart={() => startAdjusting(-0.1)}
                onTouchEnd={stopAdjusting}
                className="w-8 h-8 rounded-full bg-gradient-to-b from-[#6FF4FF] via-[#1BE7FF] to-[#0BA5C4] text-black font-bold text-xl shadow-xl shadow-black/60 border-b-4 border-[#1BE7FF]/80 hover:from-[#1BE7FF] hover:via-[#1BE7FF]/90 hover:to-[#1BE7FF]/70 hover:shadow-black/80 hover:border-[#1BE7FF] active:shadow-inner active:shadow-black/40 active:border-[#1BE7FF]/60 active:scale-95 transition-all duration-75"
                style={{
                  boxShadow: '0 4px 8px rgba(0,0,0,0.6), 0 0 20px rgba(27, 231, 255, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                −
              </button>
              <button
                onClick={() => setShowPresetModal(true)}
                className="w-11 h-11 rounded-full bg-gradient-to-b from-[#6FF4FF] via-[#1BE7FF] to-[#0BA5C4] text-black shadow-xl shadow-black/60 border-b-4 border-[#1BE7FF]/80 hover:from-[#1BE7FF] hover:via-[#1BE7FF]/90 hover:to-[#1BE7FF]/70 hover:shadow-black/80 hover:border-[#1BE7FF] active:shadow-inner active:shadow-black/40 active:border-[#1BE7FF]/60 active:scale-95 transition-all duration-75 flex items-center justify-center"
                style={{
                  boxShadow: '0 4px 8px rgba(0,0,0,0.6), 0 0 20px rgba(27, 231, 255, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                <i className="fas fa-layer-group text-sm"></i>
              </button>
              <button
                onMouseDown={() => startAdjusting(0.1)}
                onMouseUp={stopAdjusting}
                onMouseLeave={stopAdjusting}
                onTouchStart={() => startAdjusting(0.1)}
                onTouchEnd={stopAdjusting}
                className="w-8 h-8 rounded-full bg-gradient-to-b from-[#6FF4FF] via-[#1BE7FF] to-[#0BA5C4] text-black font-bold text-xl shadow-xl shadow-black/60 border-b-4 border-[#1BE7FF]/80 hover:from-[#1BE7FF] hover:via-[#1BE7FF]/90 hover:to-[#1BE7FF]/70 hover:shadow-black/80 hover:border-[#1BE7FF] active:shadow-inner active:shadow-black/40 active:border-[#1BE7FF]/60 active:scale-95 transition-all duration-75"
                style={{
                  boxShadow: '0 4px 8px rgba(0,0,0,0.6), 0 0 20px rgba(27, 231, 255, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                +
              </button>
              </>}
            </div>

            {/* Row 2: Risk Buttons + Auto Play */}
            {false && <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => dropBall('GREEN')}
                className="h-10 px-6 rounded-full bg-gradient-to-b from-[#AFFC41] via-[#AFFC41]/80 to-[#AFFC41]/60 text-black font-bold text-md shadow-xl shadow-black/60 border-b-4 border-[#AFFC41]/80 hover:from-[#AFFC41] hover:via-[#AFFC41]/90 hover:to-[#AFFC41]/70 hover:shadow-black/80 hover:border-[#AFFC41] active:shadow-inner active:shadow-black/40 active:border-[#AFFC41]/60 active:scale-95 transition-all duration-75 uppercase tracking-wider"
                style={{
                  boxShadow: '0 4px 8px rgba(0,0,0,0.6), 0 0 20px rgba(175, 252, 65, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                {contractBallBalance > 0 ? `DROP ${contractBallBalance}` : `BUY ${buyBallsCount}`}
              </button>
              <button
                onClick={() => dropBall('YELLOW')}
                className="h-10 px-6 rounded-full bg-gradient-to-b from-[#4392F1] via-[#4392F1]/80 to-[#4392F1]/60 text-black font-bold text-md shadow-xl shadow-black/60 border-b-4 border-[#4392F1]/80 hover:from-[#4392F1] hover:via-[#4392F1]/90 hover:to-[#4392F1]/70 hover:shadow-black/80 hover:border-[#4392F1] active:shadow-inner active:shadow-black/40 active:border-[#4392F1]/60 active:scale-95 transition-all duration-75 uppercase tracking-wider"
                style={{
                  boxShadow: '0 4px 8px rgba(0,0,0,0.6), 0 0 20px rgba(67, 146, 241, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                {contractBallBalance > 0 ? `DROP ${contractBallBalance}` : `BUY ${buyBallsCount}`}
              </button>
              <button
                onClick={() => dropBall('RED')}
                className="h-10 px-6 rounded-full bg-gradient-to-b from-[#FF331F] via-[#FF331F]/80 to-[#FF331F]/60 text-black font-bold text-md shadow-xl shadow-black/60 border-b-4 border-[#FF331F]/80 hover:from-[#FF331F] hover:via-[#FF331F]/90 hover:to-[#FF331F]/70 hover:shadow-black/80 hover:border-[#FF331F] active:shadow-inner active:shadow-black/40 active:border-[#FF331F]/60 active:scale-95 transition-all duration-75 uppercase tracking-wider"
                style={{
                  boxShadow: '0 4px 8px rgba(0,0,0,0.6), 0 0 20px rgba(255, 51, 31, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
                }}
              >
                {contractBallBalance > 0 ? `DROP ${contractBallBalance}` : `BUY ${buyBallsCount}`}
              </button>

              {/* Auto Play Button */}
              <button
                onClick={() => {
                  if (isAutoDrop) {
                    isAutoDropRef.current = false;
                    autoPlaySettingsRef.current = null;
                    setAutoPlaySettings(null);
                    setIsAutoDrop(false);
                    setRemainingBalls(0);
                  } else {
                    setShowAutoPlayModal(true);
                  }
                }}
                className={`w-10 h-10 rounded-full shadow-xl border-b-4 active:scale-95 transition-all duration-75 flex items-center justify-center ${
                  isAutoDrop
                    ? 'bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700 text-black shadow-black/60 border-yellow-800 hover:from-yellow-300 hover:via-yellow-400 hover:to-yellow-600 hover:shadow-black/80 hover:border-yellow-700 active:shadow-inner active:shadow-black/60 active:border-yellow-900'
                    : 'bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-700 text-white shadow-black/60 border-yellow-800 hover:from-yellow-300 hover:via-yellow-400 hover:to-yellow-600 hover:shadow-black/80 hover:border-yellow-700 active:shadow-inner active:shadow-black/60 active:border-yellow-900'
                }`}
              >
                {isAutoDrop ? (
                  <span className="font-bold text-sm">{remainingBalls}</span>
                ) : (
                  <i className="fas fa-sync-alt text-lg"></i>
                )}
              </button>
            </div>}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AutoPlayModal
        open={showAutoPlayModal}
        onOpenChange={setShowAutoPlayModal}
        onStart={handleStartAutoPlay}
        currentBalance={gameState.balance}
      />

      <PresetAmountsModal
        open={showPresetModal}
        onOpenChange={setShowPresetModal}
        onSelectAmount={setWagerWithPersistence}
      />

      <ExtendedHistoryModal
        open={showExtendedHistory}
        onOpenChange={setShowExtendedHistory}
        history={history}
      />

      <CustomAmountModal
        open={showCustomAmountModal}
        onOpenChange={setShowCustomAmountModal}
        onSetAmount={setWagerWithPersistence}
        currentAmount={wager}
      />

      {/* PLINKO History Modal */}
      <PlinkoHistoryModal
        open={showPlinkoHistory}
        onOpenChange={setShowPlinkoHistory}
        drops={plinkoHistory.drops}
        stats={plinkoHistory.stats}
        isConnected={plinkoHistory.isConnected}
        playerKey={plinkoHistory.playerKey}
        onExport={plinkoHistory.exportHistory}
        onClear={async () => {
          if (confirm('Are you sure you want to clear all history? This cannot be undone.')) {
            await plinkoHistory.clearHistory();
          }
        }}
        onFilterChange={(filter) => {
          plinkoHistory.updateFilter(filter);
        }}
      />

      {/* Custom Approval Modal */}
      <CustomApprovalModal
        open={showApprovalModal}
        onOpenChange={setShowApprovalModal}
        onApprove={handleCustomApproval}
        isApproving={isApproving}
        tokenSymbol="MORBIUS"
        spenderName="Plinko Game"
      />

      {/*
      Drop Summary Toast - Auto-dismiss after 8 seconds
      {dropSummaryData && !showDropSummary && (
        <div className="fixed bottom-4 left-4 right-4 z-50 pointer-events-none">
          <div className="flex justify-center">
            <div
              className="bg-gradient-to-r from-slate-900/90 to-slate-800/90 backdrop-blur-sm border border-cyan-500/30 rounded-xl shadow-xl p-3 max-w-xs w-full pointer-events-auto"
              style={{
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
              }}
            >
              <div className="text-center relative">
                <button
                  onClick={() => setDropSummaryData(null)}
                  className="absolute -top-1 -right-1 text-white/40 hover:text-white/70 transition w-4 h-4 flex items-center justify-center"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="text-cyan-300 text-sm font-bold mb-1">
                  +{dropSummaryData.totalWon.toLocaleString(undefined, { maximumFractionDigits: 2 })} MORBIUS
                </div>
                <div className="text-white/60 text-xs mb-2">
                  {dropSummaryData.ballCount} ball{dropSummaryData.ballCount !== 1 ? 's' : ''} completed
                </div>
                <button
                  onClick={() => setShowDropSummary(true)}
                  className="bg-gradient-to-r from-cyan-600/80 to-blue-600/80 hover:from-cyan-700 hover:to-blue-700 text-white text-xs font-medium py-1.5 px-3 rounded transition"
                >
                  View Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      Full Drop Summary Modal
      {showDropSummary && dropSummaryData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
            Header
            <div className="bg-gradient-to-r from-cyan-600 to-blue-600 p-6 text-center relative">
              <button
                onClick={() => setShowDropSummary(false)}
                className="absolute top-4 right-4 text-white/60 hover:text-white transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <h2 className="text-2xl font-black text-white mb-2">
                Drop Summary
              </h2>
              <p className="text-cyan-100 text-sm">
                {dropSummaryData.ballCount} ball{dropSummaryData.ballCount !== 1 ? 's' : ''} completed
              </p>
            </div>

            Content
            <div className="p-6 space-y-6">
              Total Won
              <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/20 border border-green-500/50 rounded-xl p-4 text-center">
                <div className="text-green-400/80 text-sm font-bold mb-1">TOTAL WON</div>
                <div className="text-3xl font-black text-green-400">
                  {dropSummaryData.totalWon.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
                <div className="text-green-400/60 text-xs">MORBIUS</div>
              </div>

              Results Breakdown
              <div className="space-y-2">
                <div className="text-white/60 text-xs font-bold uppercase tracking-wider mb-3">Results</div>
                <div className="bg-slate-800/50 rounded-lg p-3 max-h-40 overflow-y-auto space-y-1">
                  {dropSummaryData.results.map((result, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-white/40 font-mono text-xs">#{idx + 1}</span>
                        <span className="text-cyan-300 font-bold">
                          {(result.multiplier ?? 0).toString()}x
                        </span>
                      </div>
                      <span className="text-green-400 font-medium">
                        +{(result.payout ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              Transaction Link
              <a
                href={`https://scan.pulsechain.com/tx/${dropSummaryData.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-slate-700/50 hover:bg-slate-700 border border-slate-600 rounded-lg p-3 transition group"
              >
                <div className="text-white/60 text-xs mb-1">Transaction</div>
                <div className="text-cyan-400 font-mono text-xs truncate group-hover:text-cyan-300 flex items-center gap-2">
                  {dropSummaryData.txHash.slice(0, 20)}...
                  <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>
              </a>

              Action Button
              <button
                onClick={() => {
                  setShowDropSummary(false);
                  setDropSummaryData(null);
                }}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-bold py-3 px-4 rounded-lg transition"
              >
                Continue Playing
              </button>
            </div>
          </div>
        </div>
      )}
      */}

      {/* Multiplier Table Modal */}
      {showMultiplierTable && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-cyan-600 to-blue-600 p-4 text-center relative">
              <h2 className="text-2xl font-black text-white">
                Multiplier Table
              </h2>
              <button
                onClick={() => setShowMultiplierTable(false)}
                className="absolute top-4 right-4 text-white/60 hover:text-white transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Low Risk - GREEN */}
              <div className="bg-slate-800/50 rounded-xl p-4 border-2 border-green-500/30">
                <div className="text-green-400 font-bold text-lg mb-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                  Low Risk (GREEN)
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {MULTIPLIERS.GREEN.map((mult, idx) => (
                    <div
                      key={idx}
                      className="bg-green-500/10 rounded-lg p-2 text-center border border-green-500/20"
                    >
                      <div className="text-green-400 font-bold text-sm">{mult}x</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Medium Risk - YELLOW */}
              <div className="bg-slate-800/50 rounded-xl p-4 border-2 border-blue-500/30">
                <div className="text-blue-400 font-bold text-lg mb-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                  Medium Risk (YELLOW)
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {MULTIPLIERS.YELLOW.map((mult, idx) => (
                    <div
                      key={idx}
                      className="bg-blue-500/10 rounded-lg p-2 text-center border border-blue-500/20"
                    >
                      <div className="text-blue-400 font-bold text-sm">{mult}x</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* High Risk - RED */}
              <div className="bg-slate-800/50 rounded-xl p-4 border-2 border-red-500/30">
                <div className="text-red-400 font-bold text-lg mb-3 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  High Risk (RED)
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {MULTIPLIERS.RED.map((mult, idx) => (
                    <div
                      key={idx}
                      className="bg-red-500/10 rounded-lg p-2 text-center border border-red-500/20"
                    >
                      <div className="text-red-400 font-bold text-sm">{mult}x</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-900/50 border-t border-slate-700">
              <button
                onClick={() => setShowMultiplierTable(false)}
                className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white font-bold py-3 px-4 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slot Machine Confirmation Modal */}
      {isConfirmingTransaction && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="min-w-60 max-w-lg">
            <SlotMachine
              isSpinning={isConfirmingTransaction}
              confirmationStage={confirmationStage}
              onSpinComplete={() => {
                // Optional: handle spin complete if needed
              }}
            />
          </div>
        </div>
      )}

      {/* Slot Machine Test Modal */}
      {showSlotMachineTest && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="min-w-60 max-w-lg">
            <SlotMachine
              onClose={() => setShowSlotMachineTest(false)}
              onSpinComplete={(result) => {
                console.log('Slot result:', result);
              }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Home;
