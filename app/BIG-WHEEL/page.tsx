'use client'

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useAccount, usePublicClient, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatEther, decodeEventLog } from 'viem';
import { toast } from 'sonner';
import BigWheelGame, { BigWheelGameRef } from '@/components/BIG-WHEEL/BigWheelGame';
import MainNav from '@/components/BIG-WHEEL/MainNav';
import BettingPanel from '@/components/BIG-WHEEL/BettingPanel';
import Footer from '@/components/BIG-WHEEL/Footer';
import PayoutTableModal from '@/components/BIG-WHEEL/PayoutTableModal';
import WinHistoryModal from '@/components/BIG-WHEEL/WinHistoryModal';
import { CustomApprovalModal } from '@/components/BIG-WHEEL/CustomApprovalModal';
import SlotMachine from '@/components/BIG-WHEEL/SlotMachine';
import { ContractAddress } from '@/components/ui/contract-address';
import { WheelSegment, Bet, SpinResult, GameState } from './types';
import { MULTIPLIERS, WHEEL_SEGMENTS, WHEEL_SIZE } from './constants';
import { 
  useBigWheelWrite, 
  usePlayerData, 
  useGameConfig,
  useWatchBetPlaced,
  betTypeToEnum,
  BetType
} from '@/hooks/use-bigwheel-contract';
import { BIGWHEEL_ABI } from '@/abi/bigwheel';

// Extract ABI array from the artifact object
const BIGWHEEL_ABI_ARRAY = BIGWHEEL_ABI.abi || BIGWHEEL_ABI;
import { useTokenBalance } from '@/hooks/use-token';
import { useTokenApproval } from '@/hooks/use-token-approval';
import { useNativeBalance } from '@/hooks/use-native-balance';
import { usePlsQuote } from '@/hooks/use-pls-quote';
import { BIGWHEEL_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';

// Intro screen component
function IntroScreen({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 2500;
    const interval = 50;
    const steps = duration / interval;
    let currentStep = 0;

    const progressInterval = setInterval(() => {
      currentStep++;
      const newProgress = (currentStep / steps) * 100;
      setProgress(Math.min(newProgress, 100));

      if (currentStep >= steps) {
        clearInterval(progressInterval);
        setTimeout(onComplete, 200);
      }
    }, interval);

    const fallbackTimeout = setTimeout(() => {
      clearInterval(progressInterval);
      setProgress(100);
      setTimeout(onComplete, 200);
    }, 4000);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(fallbackTimeout);
    };
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center z-50"
      style={{
        background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(10, 15, 20))',
      }}
    >
      {/* Animated wheel silhouette */}
      <div className="relative mb-8">
        <div
          className="w-40 h-40 rounded-full animate-spin"
          style={{
            animationDuration: '3s',
            border: '6px solid rgba(6, 182, 212, 0.3)',
            boxShadow: 'inset 0 0 30px rgba(6, 182, 212, 0.2), 0 0 30px rgba(6, 182, 212, 0.2)',
          }}
        >
          {/* Segment lines */}
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute top-1/2 left-1/2 w-0.5 h-20 origin-bottom"
              style={{
                transform: `translate(-50%, -100%) rotate(${i * 45}deg)`,
                background: 'rgba(6, 182, 212, 0.3)',
              }}
            />
          ))}
        </div>
        {/* Center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{
              background: 'linear-gradient(145deg, rgb(35, 45, 55), rgb(25, 35, 45))',
              boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.05)',
            }}
          >
            <span className="text-2xl text-cyan-400 font-bold">M</span>
          </div>
        </div>
      </div>

      {/* Title */}
      <h1 className="text-4xl font-bold text-cyan-400 mb-2 tracking-wider">
        BIG WHEEL
      </h1>
      <p className="text-cyan-300/50 text-sm mb-8">The Classic Money Wheel</p>

      {/* Progress Bar */}
      <div className="w-64 max-w-sm mx-auto">
        <div
          className="rounded-full h-3 overflow-hidden"
          style={{
            background: 'linear-gradient(145deg, rgb(25, 35, 45), rgb(16, 26, 35))',
            boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
          }}
        >
          <div
            className="h-full rounded-full transition-all duration-75 ease-out"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, rgba(6, 182, 212, 0.6), rgba(6, 182, 212, 0.8))',
              boxShadow: '0 0 10px rgba(6, 182, 212, 0.5)',
            }}
          />
        </div>
        <div className="text-center mt-4 space-y-2">
          <span className="text-cyan-300/80 text-lg font-semibold">
            Loading... {Math.round(progress)}%
          </span>
          <div>
            <button
              onClick={onComplete}
              className="text-cyan-300/50 text-sm hover:text-cyan-300  transition-colors"
            >
              Skip Intro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// History display component
function HistoryStrip({ history }: { history: SpinResult[] }) {
  if (history.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-2 px-4">
      <span className="text-xs text-cyan-300/40 flex-shrink-0">Recent:</span>
      {history.slice(0, 10).map((result, index) => {
        const isHighValue = result.segment.multiplier >= 10;
        return (
          <div
            key={result.id}
            className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold
              ${index === 0 ? 'history-item-enter' : ''}`}
            style={{
              background: isHighValue
                ? 'linear-gradient(145deg, rgba(6, 182, 212, 0.3), rgba(8, 145, 178, 0.3))'
                : 'linear-gradient(145deg, rgb(35, 45, 55), rgb(25, 35, 45))',
              boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
              color: isHighValue ? 'rgb(6, 182, 212)' : 'rgba(6, 182, 212, 0.6)',
              border: index === 0 ? '1px solid rgba(6, 182, 212, 0.5)' : '1px solid rgba(60, 60, 60, 0.3)',
            }}
            title={`${result.segment.value} - ${result.segment.multiplier}x`}
          >
            {result.segment.value === 'JOKER' ? 'J' :
             result.segment.value === 'MORBIUS' ? 'M' :
             result.segment.value}
          </div>
        );
      })}
    </div>
  );
}

// Win notification component
function WinNotification({ amount, segment }: { amount: number; segment: WheelSegment }) {
  if (amount <= 0) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-40">
      <div
        className="win-banner px-8 py-6 rounded-2xl"
        style={{
          background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
          boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 4px 30px rgba(6, 182, 212, 0.4)',
          border: '2px solid rgba(6, 182, 212, 0.5)',
        }}
      >
        <div className="text-center">
          <div className="text-cyan-400 text-lg mb-2">
            {segment.value === 'JOKER' ? 'JOKER!' :
             segment.value === 'MORBIUS' ? 'MORBIUS!' :
             `${segment.value} WINS!`}
          </div>
          <div className="text-4xl font-bold text-cyan-300">
            +{amount.toLocaleString()}
          </div>
          <div className="text-cyan-300/50 text-sm mt-1">MORBIUS</div>
        </div>
      </div>
    </div>
  );
}

export default function BigWheelPage() {
  // Wallet connection
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  // Contract hooks
  const { writeContractAsync, isPending: isWritePending } = useBigWheelWrite();
  const { playerStats } = usePlayerData();
  const gameConfig = useGameConfig();
  const { balance: tokenBalance, balanceFormatted: tokenBalanceFormatted } = useTokenBalance(address);
  const { balance: plsBalance, balanceFormatted: plsBalanceFormatted } = useNativeBalance(address);
  
  // Payment method state
  const [paymentMethod, setPaymentMethod] = useState<'MORBIUS' | 'PLS'>('MORBIUS');
  const [pendingTxHash, setPendingTxHash] = useState<`0x${string}` | null>(null);

  // Transaction receipt watcher
  const { isLoading: isTxConfirming, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: pendingTxHash || undefined,
  });

  // Game state - MUST be declared before hooks that use it
  const [gameState, setGameState] = useState<GameState>({
    balance: 0,
    bets: [],
    isSpinning: false,
    lastResult: null,
    history: [],
  });

  // Calculate total bet in wei (after gameState is declared)
  const totalBet = gameState.bets.reduce((sum, bet) => sum + bet.amount, 0);
  const totalBetWei = gameState.bets.reduce((sum, bet) => sum + parseEther(bet.amount.toString()), BigInt(0));

  // Token approval
  const { allowance, needsApproval, approve, isApproving, isApprovalSuccess } = useTokenApproval({
    tokenAddress: MORBIUS_TOKEN_ADDRESS,
    spenderAddress: BIGWHEEL_ADDRESS,
    requiredAmount: totalBetWei,
    userAddress: address,
    enabled: isConnected && paymentMethod === 'MORBIUS' && totalBetWei > BigInt(0),
  });

  // Custom approval handler
  const handleCustomApproval = useCallback((amount: bigint) => {
    approve(amount);
  }, [approve]);

  // PLS quote
  const { plsValue: plsRequiredWei, isLoading: isPlsQuoteLoading } = usePlsQuote({
    morbiusCost: totalBetWei,
    enabled: isConnected && paymentMethod === 'PLS' && totalBetWei > BigInt(0),
  });

  // Map contract segment index to frontend visual segment index
  // Contract uses numerical ranges (0-23=1x, 24-38=2x, etc.)
  // Frontend uses visual pattern for better gameplay
  const mapContractSegmentToFrontend = useCallback((contractSegmentIndex: number): number => {
    // Get the bet type that the contract segment represents
    let contractBetType: '1' | '2' | '5' | '10' | '20' | 'JOKER' | 'MORBIUS';
    if (contractSegmentIndex < 24) contractBetType = '1';
    else if (contractSegmentIndex < 24 + 15) contractBetType = '2';
    else if (contractSegmentIndex < 24 + 15 + 7) contractBetType = '5';
    else if (contractSegmentIndex < 24 + 15 + 7 + 4) contractBetType = '10';
    else if (contractSegmentIndex < 24 + 15 + 7 + 4 + 2) contractBetType = '20';
    else if (contractSegmentIndex === 24 + 15 + 7 + 4 + 2) contractBetType = 'JOKER';
    else contractBetType = 'MORBIUS';

    // Find the first frontend segment with this bet type
    const frontendSegmentIndex = WHEEL_SEGMENTS.findIndex(segment => segment.value === contractBetType);

    console.log(`🎯 Mapping contract segment ${contractSegmentIndex} (${contractBetType}) to frontend segment ${frontendSegmentIndex}`);
    return frontendSegmentIndex;
  }, []);

  // Helper function to decode BetPlaced event from receipt and trigger wheel spin
  const processBetPlacedEventFromReceipt = useCallback((receipt: any) => {
    try {
      console.log('🔍 Processing receipt for BetPlaced event:', {
        receiptHash: receipt.transactionHash,
        logsCount: receipt.logs?.length || 0,
        contractAddress: BIGWHEEL_ADDRESS,
      });

      const betPlacedLogs = receipt.logs.filter((log: any) =>
        log.address.toLowerCase() === BIGWHEEL_ADDRESS.toLowerCase()
      );

      console.log(`Found ${betPlacedLogs.length} logs from Big Wheel contract`);

      for (const log of betPlacedLogs) {
        try {
          console.log('🔍 Attempting to decode log:', {
            address: log.address,
            topicsCount: log.topics?.length || 0,
            hasData: !!log.data,
          });

          const decoded = decodeEventLog({
            abi: BIGWHEEL_ABI_ARRAY as any,
            data: log.data,
            topics: log.topics,
          }) as any;

          console.log('🔍 Decoded event:', decoded);

          if (decoded && decoded.eventName === 'BetPlaced' && decoded.args) {
            const args = decoded.args;
            const { player, betType, betAmount, winningSegment, payout, usedPLS } = args;
            
            console.log('🎰 Found BetPlaced event:', {
              player,
              currentAddress: address,
              winningSegment,
              segmentIndex: Number(winningSegment),
            });
            
            // Only process events for current player
            if (player?.toLowerCase() === address?.toLowerCase()) {
              const segmentIndex = Number(winningSegment);
              console.log('✅ Processing BetPlaced event for current player:', {
                segmentIndex,
                payout: payout?.toString(),
                betAmount: betAmount?.toString(),
              });
              
              // Store payout info for handleSpinComplete
              setContractPayout({
                payout: payout ? BigInt(payout.toString()) : BigInt(0),
                betAmount: betAmount ? BigInt(betAmount.toString()) : BigInt(0),
                txHash: receipt.transactionHash,
              });
              
              // Map contract segment to frontend visual segment
              const frontendSegmentIndex = mapContractSegmentToFrontend(segmentIndex);

              // Set winning segment index FIRST (frontend visual index)
              console.log('🎡 Setting winningSegmentIndex to:', frontendSegmentIndex, '(mapped from contract segment', segmentIndex, ')');
              setWinningSegmentIndex(frontendSegmentIndex);
              
              // Then set spinning state to trigger wheel spin
              // Use a longer delay to ensure state updates are processed
              setTimeout(() => {
                console.log('🎡 Setting isSpinning to true, targetSegment should be:', segmentIndex);
                setGameState(prev => {
                  console.log('🎡 Current gameState.isSpinning:', prev.isSpinning);
                  console.log('🎡 Setting isSpinning to true');
                  return { ...prev, isSpinning: true };
                });
              }, 100);
              
              return true; // Found our event
            } else {
              console.log('⚠️ BetPlaced event is for different player:', {
                eventPlayer: player,
                currentPlayer: address,
              });
            }
          } else {
            console.log('⚠️ Decoded event is not BetPlaced:', decoded?.eventName);
          }
        } catch (err) {
          console.warn('❌ Failed to decode log:', err);
        }
      }
      console.warn('⚠️ BetPlaced event not found in receipt logs');
      return false; // Event not found
    } catch (error) {
      console.error('❌ Error decoding events from receipt:', error);
      return false;
    }
  }, [address]);

  // Robust transaction receipt polling for PulseChain
  const pollForReceipt = useCallback(async (
    txHash: `0x${string}`,
    options: {
      maxAttempts?: number;
      intervalMs?: number;
      onAttempt?: (attempt: number) => void;
    } = {}
  ) => {
    const { maxAttempts = 60, intervalMs = 5000, onAttempt } = options;

    console.log(`🔄 Starting receipt polling for tx: ${txHash}`);
    console.log(`⏰ Will poll for ${maxAttempts} attempts with ${intervalMs}ms intervals`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        onAttempt?.(attempt);

        if (!publicClient) {
          console.warn(`⚠️ Attempt ${attempt}: publicClient not available`);
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, intervalMs));
          }
          continue;
        }

        console.log(`🔍 Attempt ${attempt}: Checking receipt for ${txHash}`);
        const receipt = await publicClient.getTransactionReceipt({ hash: txHash });

        if (receipt) {
          console.log(`✅ Transaction confirmed on attempt ${attempt}!`);
          console.log(`📋 Receipt status: ${receipt.status}`);
          console.log(`🔢 Block number: ${receipt.blockNumber}`);
          return receipt;
        }

        console.log(`⏳ Attempt ${attempt}: Receipt not found yet, waiting...`);

        // Wait before next attempt
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      } catch (error) {
        console.warn(`❌ Receipt fetch attempt ${attempt} failed:`, error);
        // Continue to next attempt
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      }
    }

    console.error(`❌ Receipt polling timed out after ${maxAttempts} attempts`);
    return null;
  }, [publicClient]);

  // Execute bet (separated from handleSpin to allow execution after approval)
  // NOTE: This does NOT set isSpinning - that happens only after transaction confirmation
  const executeBet = useCallback(async (betType: string, betAmount: number) => {
    if (!isConnected || !address) return;

    try {
      const betTypeEnum = betTypeToEnum(betType);
      const betAmountWei = parseEther(betAmount.toString());

      setIsConfirmingTransaction(true);
      setConfirmationStage('broadcast');

      if (paymentMethod === 'PLS') {
        if (plsRequiredWei === BigInt(0)) {
          toast.error('Unable to quote PLS required. Please try again.');
          setIsConfirmingTransaction(false);
          setConfirmationStage(null);
          return;
        }

        const txHash = await writeContractAsync({
          address: BIGWHEEL_ADDRESS,
          abi: BIGWHEEL_ABI_ARRAY as any,
          functionName: 'placeBetWithPLS',
          args: [betTypeEnum, betAmountWei],
          value: plsRequiredWei,
          maxPriorityFeePerGas: 40_000n, // PulseChain tip
        } as any);

        setPendingTxHash(txHash);
        toast.success('Transaction submitted! Waiting for confirmation...');
        
        // Poll for receipt with confirmation stage updates (increased timeout for PulseChain)
        const receipt = await pollForReceipt(txHash, {
          maxAttempts: 60, // Increased from 30 to 60 attempts
          intervalMs: 5000, // Increased from 4000 to 5000ms
          onAttempt: (attempt) => {
            if (attempt % 10 === 0) {
              console.log(`Still waiting for confirmation... (${attempt}/60)`);
            }
            // Update confirmation stage based on progress
            if (attempt <= 20) {
              setConfirmationStage('broadcast');
            } else if (attempt <= 40) {
              setConfirmationStage('mempool');
            } else {
              setConfirmationStage('mined');
            }
          }
        });

        setIsConfirmingTransaction(false);
        setConfirmationStage(null);

        if (!receipt) {
          console.error('❌ Transaction receipt not found after polling timeout');
          console.error('Transaction hash:', txHash);
          console.error('This may indicate:');
          console.error('1. Transaction is still pending on PulseChain');
          console.error('2. RPC connection issues');
          console.error('3. Low gas price causing slow mining');
          console.error('4. Network congestion');
          throw new Error(`Transaction receipt not found after 5 minutes. Tx: ${txHash}`);
        }

        if (receipt.status === 'reverted') {
          console.error('❌ Transaction reverted!');
          console.error('Receipt:', receipt);
          throw new Error(`Transaction reverted! Check gas price or contract state. Tx: ${txHash}`);
        }

        toast.success('Bet placed successfully!');
        // Event watcher will handle the result and trigger wheel spin
        // isSpinning will be set when event is received
      } else {
        // MORBIUS payment
        const txHash = await writeContractAsync({
          address: BIGWHEEL_ADDRESS,
          abi: BIGWHEEL_ABI_ARRAY as any,
          functionName: 'placeBet',
          args: [betTypeEnum, betAmountWei],
          maxPriorityFeePerGas: 40_000n, // PulseChain tip
        } as any);

        setPendingTxHash(txHash);
        toast.success('Transaction submitted! Waiting for confirmation...');
        
        // Poll for receipt with confirmation stage updates (increased timeout for PulseChain)
        const receipt = await pollForReceipt(txHash, {
          maxAttempts: 60, // Increased from 30 to 60 attempts
          intervalMs: 5000, // Increased from 4000 to 5000ms
          onAttempt: (attempt) => {
            if (attempt % 10 === 0) {
              console.log(`Still waiting for confirmation... (${attempt}/60)`);
            }
            // Update confirmation stage based on progress
            if (attempt <= 20) {
              setConfirmationStage('broadcast');
            } else if (attempt <= 40) {
              setConfirmationStage('mempool');
            } else {
              setConfirmationStage('mined');
            }
          }
        });

        setIsConfirmingTransaction(false);
        setConfirmationStage(null);

        if (!receipt) {
          console.error('❌ Transaction receipt not found after polling timeout');
          console.error('Transaction hash:', txHash);
          console.error('This may indicate:');
          console.error('1. Transaction is still pending on PulseChain');
          console.error('2. RPC connection issues');
          console.error('3. Low gas price causing slow mining');
          console.error('4. Network congestion');
          throw new Error(`Transaction receipt not found after 5 minutes. Tx: ${txHash}`);
        }

        if (receipt.status === 'reverted') {
          console.error('❌ Transaction reverted!');
          console.error('Receipt:', receipt);
          throw new Error(`Transaction reverted! Check gas price or contract state. Tx: ${txHash}`);
        }

        toast.success('Bet placed successfully!');
        
        // Decode BetPlaced event from receipt and trigger wheel spin
        console.log('🔍 Processing receipt for BetPlaced event (MORBIUS)...');
        const eventFound = processBetPlacedEventFromReceipt(receipt);
        if (!eventFound) {
          console.warn('⚠️ BetPlaced event not found in receipt, falling back to event watcher');
        } else {
          console.log('✅ BetPlaced event found and processed from receipt');
        }
      }
    } catch (error: any) {
      console.error('Error placing bet:', error);
      toast.error(error?.message || 'Failed to place bet');
      setPendingTxHash(null);
      setIsConfirmingTransaction(false);
      setConfirmationStage(null);
    }
  }, [
    isConnected,
    address,
    paymentMethod,
    plsRequiredWei,
    writeContractAsync,
    publicClient,
    pollForReceipt,
    processBetPlacedEventFromReceipt,
    mapContractSegmentToFrontend,
  ]);

  // UI state
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window !== 'undefined') {
      const introShown = localStorage.getItem('bigwheel-intro-shown');
      return introShown !== 'true';
    }
    return true;
  });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showPayouts, setShowPayouts] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [pendingBet, setPendingBet] = useState<{ betType: string; betAmount: number } | null>(null);

  // Handle approval success and execute pending bet
  useEffect(() => {
    if (isApprovalSuccess && pendingBet) {
      console.log('✅ APPROVAL SUCCESS! Executing pending bet...');
      // Execute the pending bet
      executeBet(pendingBet.betType, pendingBet.betAmount);
      setPendingBet(null);
    }
  }, [isApprovalSuccess, pendingBet, executeBet]);

  const [isConfirmingTransaction, setIsConfirmingTransaction] = useState(false);
  const [confirmationStage, setConfirmationStage] = useState<'broadcast' | 'mempool' | 'mined' | null>(null);
  const [winNotification, setWinNotification] = useState<{ amount: number; segment: WheelSegment } | null>(null);
  const [wheelSize, setWheelSize] = useState(WHEEL_SIZE.DESKTOP);

  // Refs
  const wheelRef = useRef<BigWheelGameRef>(null);

  // Update balance from contract
  useEffect(() => {
    if (isConnected && address) {
      // Contract mode - use real balance
      const balance = paymentMethod === 'MORBIUS' 
        ? parseFloat(tokenBalanceFormatted)
        : parseFloat(plsBalanceFormatted);
      setGameState(prev => ({ ...prev, balance }));
    } else {
      setGameState(prev => ({ ...prev, balance: 0 }));
    }
  }, [isConnected, address, tokenBalanceFormatted, plsBalanceFormatted, paymentMethod]);

  // State to track winning segment from contract
  const [winningSegmentIndex, setWinningSegmentIndex] = useState<number | undefined>(undefined);
  const [contractPayout, setContractPayout] = useState<{ payout: bigint; betAmount: bigint; txHash: string } | null>(null);

  // Watch for BetPlaced events - this triggers AFTER transaction confirmation
  useWatchBetPlaced((log) => {
    console.log('🎰 BetPlaced event:', log);
    // Extract event data
    const eventData = log.args;
    if (eventData) {
      const { player, betType, betAmount, winningSegment, payout, usedPLS } = eventData;
      
      // Only process events for current player
      if (player?.toLowerCase() === address?.toLowerCase()) {
        const segmentIndex = Number(winningSegment);
        console.log('🎰 Processing BetPlaced event for player:', {
          segmentIndex,
          payout: payout?.toString(),
          betAmount: betAmount?.toString(),
        });
        
        // Store payout info for handleSpinComplete FIRST
        setContractPayout({
          payout: payout ? BigInt(payout.toString()) : BigInt(0),
          betAmount: betAmount ? BigInt(betAmount.toString()) : BigInt(0),
          txHash: log.transactionHash,
        });

        // Map contract segment to frontend visual segment
        const frontendSegmentIndex = mapContractSegmentToFrontend(segmentIndex);

        // Set winning segment index FIRST to ensure it's ready
        setWinningSegmentIndex(frontendSegmentIndex);
        
        // Then set spinning state - wheel will spin now that we have confirmation
        // Use a small delay to ensure state updates are batched correctly
        setTimeout(() => {
          setGameState(prev => {
            console.log('🎡 Setting isSpinning to true, targetSegment:', segmentIndex);
            return { ...prev, isSpinning: true };
          });
        }, 50);
      }
    }
  });

  // Helper: Map segment index to WheelSegment
  const getSegmentFromIndex = useCallback((index: number): WheelSegment => {
    // Segment distribution: [18, 18, 7, 4, 2, 2, 3] = 54 total
    const segments: WheelSegment[] = [];
    const counts = [18, 18, 7, 4, 2, 2, 3];
    const types: BetType[] = ['1' as BetType, '2' as BetType, '5' as BetType, '10' as BetType, '20' as BetType, 'JOKER' as BetType, 'MORBIUS' as BetType];
    
    let currentIndex = 0;
    counts.forEach((count, typeIndex) => {
      for (let i = 0; i < count; i++) {
        segments.push({
          id: currentIndex,
          value: types[typeIndex],
          multiplier: MULTIPLIERS[types[typeIndex]],
          angle: (currentIndex / 54) * 360,
          arcLength: 360 / 54,
        });
        currentIndex++;
      }
    });
    
    return segments[index % 54];
  }, []);

  // Handle spin complete
  const handleSpinComplete = useCallback((
    segment: WheelSegment, 
    contractResult?: { payout: bigint; betAmount: bigint; txHash?: string }
  ) => {
    const winningBet = gameState.bets.find(bet => bet.type === segment.value);
    
    let winAmount = 0;
    if (contractResult) {
      // Contract mode - use actual payout
      winAmount = parseFloat(formatEther(contractResult.payout));
    } else {
      // Free play mode - calculate expected payout
      winAmount = winningBet ? winningBet.amount * (segment.multiplier + 1) : 0;
    }

    const spinResult: SpinResult = {
      id: Date.now(),
      segment,
      totalBet,
      totalWin: winAmount,
      timestamp: Date.now(),
      txHash: contractResult?.txHash,
    };

    setGameState(prev => ({
      ...prev,
      isSpinning: false,
      lastResult: segment,
      balance: prev.balance, // Contract updates balance automatically
      history: [spinResult, ...prev.history].slice(0, 100),
    }));

    // Clear pending tx
    setPendingTxHash(null);

    // Wheel animation is triggered by winningSegmentIndex being set
    // The wheel component will automatically spin when winningSegmentIndex changes

    if (winAmount > 0) {
      const profit = winAmount - totalBet;
      setWinNotification({ amount: profit, segment });
      setTimeout(() => setWinNotification(null), 3000);
    }
  }, [gameState.bets, totalBet]);

  // Handle intro complete
  const handleIntroComplete = useCallback(() => {
    setShowIntro(false);
    if (typeof window !== 'undefined') {
      localStorage.setItem('bigwheel-intro-shown', 'true');
    }
  }, []);


  // Handle bet changes
  const handleBetChange = useCallback((newBets: Bet[]) => {
    setGameState(prev => ({
      ...prev,
      bets: newBets,
    }));
  }, []);

  // Handle clear bets
  const handleClearBets = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      bets: [],
    }));
  }, []);

  // Handle spin
  const handleSpin = useCallback(async () => {
    if (gameState.isSpinning || totalBet === 0) return;
    
    // Require wallet connection
    if (!isConnected || !address) {
      toast.error('Please connect your wallet to place bets');
      return;
    }

    // Check balance
    const hasEnoughBalance = paymentMethod === 'MORBIUS'
      ? tokenBalance >= totalBetWei
      : plsBalance >= plsRequiredWei;

    if (!hasEnoughBalance) {
      toast.error(`Insufficient ${paymentMethod} balance`);
      return;
    }

    // Check approval for MORBIUS - show modal if needed
    if (paymentMethod === 'MORBIUS' && needsApproval) {
      const primaryBet = gameState.bets[0];
      if (primaryBet) {
        setPendingBet({ betType: primaryBet.type, betAmount: primaryBet.amount });
        setShowApprovalModal(true);
      }
      return;
    }

    // If we get here, approval is not needed - execute bet directly
    const primaryBet = gameState.bets[0];
    if (!primaryBet) return;
    
    executeBet(primaryBet.type, primaryBet.amount);
  }, [
    gameState.isSpinning, 
    gameState.bets,
    totalBet, 
    gameState.balance,
    isConnected,
    address,
    paymentMethod,
    tokenBalance,
    plsBalance,
    totalBetWei,
    plsRequiredWei,
    needsApproval,
    executeBet,
  ]);


  // Handle clear history
  const handleClearHistory = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      history: [],
    }));
  }, []);

  // Handle responsive wheel size
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 480) {
        setWheelSize(WHEEL_SIZE.MOBILE);
      } else if (width < 768) {
        setWheelSize(WHEEL_SIZE.TABLET);
      } else {
        setWheelSize(WHEEL_SIZE.DESKTOP);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (showIntro) {
    return <IntroScreen onComplete={handleIntroComplete} />;
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(10, 15, 20))',
      }}
    >
      {/* Navigation */}
      <MainNav
        balance={paymentMethod === 'MORBIUS' ? parseFloat(tokenBalanceFormatted) : parseFloat(plsBalanceFormatted)}
        soundEnabled={soundEnabled}
        onSoundToggle={() => setSoundEnabled(prev => !prev)}
        onShowHistory={() => setShowHistory(true)}
        onShowPayouts={() => setShowPayouts(true)}
      />

      {/* Main Content */}
      <main className="flex-1 pt-16 pb-4 px-4">
        <div className="container mx-auto max-w-6xl">
          {/* History Strip */}
          <HistoryStrip history={gameState.history} />

          {/* Game Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* Wheel Section */}
            <div className="flex flex-col items-center">
              {/* Wheel container with embossed background */}
              <div
                className="relative p-6 rounded-2xl"
                style={{
                  background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
                  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                  border: '1px solid rgba(60, 60, 60, 0.5)',
                }}
              >
                <BigWheelGame
                  ref={wheelRef}
                  onSpinComplete={(segment) => {
                    // When wheel completes animation, update state with contract result
                    if (contractPayout) {
                      handleSpinComplete(segment, contractPayout);
                      setContractPayout(null);
                      setWinningSegmentIndex(undefined);
                    } else {
                      handleSpinComplete(segment);
                    }
                  }}
                  isSpinning={gameState.isSpinning}
                  targetSegment={winningSegmentIndex}
                  soundEnabled={soundEnabled}
                  size={wheelSize}
                />
              </div>

              {/* Last result indicator */}
              {gameState.lastResult && !gameState.isSpinning && (
                <div className="mt-3 text-center">
                  <span className="text-cyan-300/50 text-sm">Last spin: </span>
                  <span
                    className="inline-block px-3 py-1 rounded-lg font-bold text-cyan-300 ml-2"
                    style={{
                      background: 'linear-gradient(145deg, rgba(6, 182, 212, 0.2), rgba(8, 145, 178, 0.2))',
                      boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
                    }}
                  >
                    {gameState.lastResult.value === 'JOKER' ? 'Joker' :
                     gameState.lastResult.value === 'MORBIUS' ? 'Morbius' :
                     gameState.lastResult.value}
                    {' '}({gameState.lastResult.multiplier}x)
                  </span>
                </div>
              )}
            </div>

            {/* Betting Section */}
            <div className="flex flex-col">
              {/* Payment Method & Approval */}
              <div
                  className="mb-4 rounded-2xl p-4"
                  style={{
                    background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                    border: '1px solid rgba(60, 60, 60, 0.5)',
                  }}
                >
                  {/* Payment Method Selection */}
                  <div className="mb-3">
                    <div className="text-xs text-cyan-300/60 mb-2 text-center font-bold uppercase tracking-wider">Payment Method</div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setPaymentMethod('MORBIUS')}
                        disabled={!isConnected}
                        className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
                          !isConnected ? 'opacity-50 cursor-not-allowed' : ''
                        } ${
                          paymentMethod === 'MORBIUS'
                            ? 'text-cyan-300'
                            : 'text-cyan-300/50'
                        }`}
                        style={{
                          background: paymentMethod === 'MORBIUS'
                            ? 'linear-gradient(145deg, rgba(6, 182, 212, 0.3), rgba(8, 145, 178, 0.3))'
                            : 'linear-gradient(145deg, rgb(35, 45, 55), rgb(25, 35, 45))',
                          boxShadow: paymentMethod === 'MORBIUS'
                            ? 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.05)'
                            : 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
                        }}
                      >
                        MORBIUS
                      </button>
                      <button
                        onClick={() => setPaymentMethod('PLS')}
                        disabled={!isConnected}
                        className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${
                          !isConnected ? 'opacity-50 cursor-not-allowed' : ''
                        } ${
                          paymentMethod === 'PLS'
                            ? 'text-cyan-300'
                            : 'text-cyan-300/50'
                        }`}
                        style={{
                          background: paymentMethod === 'PLS'
                            ? 'linear-gradient(145deg, rgba(6, 182, 212, 0.3), rgba(8, 145, 178, 0.3))'
                            : 'linear-gradient(145deg, rgb(35, 45, 55), rgb(25, 45, 55))',
                          boxShadow: paymentMethod === 'PLS'
                            ? 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.05)'
                            : 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
                        }}
                      >
                        PLS
                      </button>
                    </div>
                  </div>

                  {/* Approval Button for MORBIUS */}
                  {isConnected && paymentMethod === 'MORBIUS' && needsApproval && totalBet > 0 && (
                    <button
                      onClick={() => approve()}
                      disabled={isApproving}
                      className="w-full py-2 rounded-lg font-bold text-sm transition-all text-cyan-300 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: 'linear-gradient(145deg, rgba(6, 182, 212, 0.3), rgba(8, 145, 178, 0.3))',
                        boxShadow: 'inset 4px 4px 8px rgba(0, 0, 0, 0.3), inset -4px -4px 8px rgba(255, 255, 255, 0.05)',
                      }}
                    >
                      {isApproving ? 'Approving...' : 'Approve MORBIUS'}
                    </button>
                  )}

                  {/* PLS Quote Info */}
                  {isConnected && paymentMethod === 'PLS' && totalBet > 0 && (
                    <div className="text-xs text-cyan-300/50 text-center mt-2">
                      {isPlsQuoteLoading ? (
                        'Calculating PLS required...'
                      ) : plsRequiredWei > BigInt(0) ? (
                        `Requires: ${parseFloat(formatEther(plsRequiredWei)).toFixed(4)} PLS`
                      ) : (
                        'Unable to calculate PLS quote'
                      )}
                    </div>
                  )}
                </div>

              <BettingPanel
                bets={gameState.bets}
                onBetChange={handleBetChange}
                balance={gameState.balance}
                isSpinning={gameState.isSpinning || isTxConfirming}
                onSpin={handleSpin}
                onClearBets={handleClearBets}
                totalBet={totalBet}
              />

              {/* Quick stats */}
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div
                  className="rounded-lg p-2"
                  style={{
                    background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
                    boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <div className="text-xs text-cyan-300/40">Spins</div>
                  <div className="font-bold text-cyan-300">{gameState.history.length}</div>
                </div>
                <div
                  className="rounded-lg p-2"
                  style={{
                    background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
                    boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <div className="text-xs text-cyan-300/40">Wins</div>
                  <div className="font-bold text-cyan-400">
                    {gameState.history.filter(h => h.totalWin > 0).length}
                  </div>
                </div>
                <div
                  className="rounded-lg p-2"
                  style={{
                    background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
                    boxShadow: 'inset 2px 2px 4px rgba(0, 0, 0, 0.3), inset -2px -2px 4px rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <div className="text-xs text-cyan-300/40">Net P/L</div>
                  <div className={`font-bold ${
                    gameState.history.reduce((sum, h) => sum + h.totalWin - h.totalBet, 0) >= 0
                      ? 'text-cyan-400'
                      : 'text-red-400'
                  }`}>
                    {gameState.history.reduce((sum, h) => sum + h.totalWin - h.totalBet, 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Contract Address */}
      <div className="w-full py-4 px-4 flex justify-center">
        <ContractAddress
          address={BIGWHEEL_ADDRESS}
          label="Big Wheel Contract"
          explorerUrl="https://scan.pulsechain.com/address/"
        />
      </div>

      {/* Footer */}
      <Footer />

      {/* Modals */}
      <PayoutTableModal open={showPayouts} onOpenChange={setShowPayouts} />
      <WinHistoryModal
        open={showHistory}
        onOpenChange={setShowHistory}
        history={gameState.history}
        onClearHistory={handleClearHistory}
      />

      {/* Win Notification */}
      {winNotification && (
        <WinNotification amount={winNotification.amount} segment={winNotification.segment} />
      )}

      {/* Custom Approval Modal */}
      <CustomApprovalModal
        open={showApprovalModal}
        onOpenChange={setShowApprovalModal}
        onApprove={handleCustomApproval}
        isApproving={isApproving}
        tokenSymbol="MORBIUS"
        spenderName="Big Wheel Game"
      />

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
    </div>
  );
}
