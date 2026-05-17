'use client';

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  parseEther,
  type PublicClient,
  type TransactionReceipt,
} from 'viem';
import { PLINKO_ABI } from '@/abi/plinko';
import { PLINKO_ADDRESS } from '@/lib/contracts';
import { calculateWplsAmount } from '@/hooks/use-wpls-price';
import { RiskLevel } from '@/app/PLINKO/types';
import { type PlinkoAnimationItem } from '@/hooks/use-plinko-animation-queue';
import {
  decodePlinkoBallDroppedLog,
  getPlinkoTransactionErrorMessage,
} from '@/lib/plinko-transaction-utils';
import { useGasParams } from '@/lib/tx-gas';

export type RiskLevelMap = Record<'green' | 'yellow' | 'red', number>;

interface DropSummary {
  txHash: string;
  totalWon: number;
  ballCount: number;
  results: Array<{ bucket: number; multiplier: number; payout: number }>;
}

interface PendingPurchase {
  count: number;
  wagerPerBallMORBIUS: number;
  useNativePLS: boolean;
}

interface UsePlinkoTransactionFlowParams {
  address?: `0x${string}`;
  isConnected: boolean;
  minWager: number;
  maxWager: number;
  allowance?: bigint;
  buyRiskLevel: RiskLevel;
  wplsPerMORBIUS?: bigint;
  writeContractAsync: (config: Record<string, unknown>) => Promise<`0x${string}`>;
  publicClient?: PublicClient;
  playerInfo: { refetch: () => Promise<unknown> };
  plinkoHistory: {
    recordDrop: (
      wager: number,
      multiplier: number,
      riskLevel: RiskLevel,
      bucketIndex: number,
      transactionHash?: string
    ) => Promise<void>;
  };
  riskLevelMap: RiskLevelMap;
  onRequireApproval: (requiredAmount: bigint, purchase: PendingPurchase) => void;
  setIsConfirmingTransaction: Dispatch<SetStateAction<boolean>>;
  setConfirmationStage: Dispatch<SetStateAction<'broadcast' | 'mempool' | 'mined' | null>>;
  setScoredBallCount: Dispatch<SetStateAction<number>>;
  setBallsLaunched: Dispatch<SetStateAction<number>>;
  setExpectedBallCount: Dispatch<SetStateAction<number>>;
  setAnimationQueue: Dispatch<SetStateAction<PlinkoAnimationItem[]>>;
  setDropSummaryData: Dispatch<SetStateAction<DropSummary | null>>;
}

export function usePlinkoTransactionFlow({
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
  riskLevelMap,
  onRequireApproval,
  setIsConfirmingTransaction,
  setConfirmationStage,
  setScoredBallCount,
  setBallsLaunched,
  setExpectedBallCount,
  setAnimationQueue,
  setDropSummaryData,
}: UsePlinkoTransactionFlowParams) {
  const getGas = useGasParams();

  const pollForReceipt = useCallback(async (
    txHash: `0x${string}`,
    options: {
      maxAttempts?: number;
      intervalMs?: number;
      onAttempt?: (attempt: number) => void;
    } = {}
  ) => {
    const { maxAttempts = 30, intervalMs = 4000, onAttempt } = options;
    if (!publicClient) {
      throw new Error('Public client is not available');
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        onAttempt?.(attempt);
        const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
        if (receipt) return receipt;
        if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, intervalMs));
      } catch {
        if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    throw new Error(`Transaction receipt not found after ${maxAttempts} attempts`);
  }, [publicClient]);

  const buyBalls = useCallback(async (count: number, wagerPerBallMORBIUS: number, useNativePLS: boolean) => {
    if (!address || !isConnected) {
      alert('Please connect your wallet first');
      return;
    }

    if (wagerPerBallMORBIUS < minWager || wagerPerBallMORBIUS > maxWager) {
      alert(`Wager must be between ${minWager} and ${maxWager} MORBIUS per ball`);
      return;
    }

    const requiredAmount = parseEther((wagerPerBallMORBIUS * count).toString());
    if (!useNativePLS && allowance !== undefined && allowance < requiredAmount) {
      onRequireApproval(requiredAmount, { count, wagerPerBallMORBIUS, useNativePLS });
      return;
    }

    try {
      const riskKey = buyRiskLevel.toLowerCase() as keyof RiskLevelMap;
      const contractRiskLevel = riskLevelMap[riskKey];
      if (contractRiskLevel === undefined) {
        throw new Error(`Invalid risk level: ${buyRiskLevel}`);
      }

      const wagerAmount = parseEther(wagerPerBallMORBIUS.toString());
      let txHash: `0x${string}`;

      if (useNativePLS) {
        if (!wplsPerMORBIUS) {
          throw new Error('PLS price not available. Please try again or use MORBIUS.');
        }
        const totalCost = wagerAmount * BigInt(count);
        const plsNeeded = calculateWplsAmount(totalCost, wplsPerMORBIUS, 150);
        txHash = await writeContractAsync({
          address: PLINKO_ADDRESS,
          abi: PLINKO_ABI,
          functionName: 'buyBallsWithPLSAndDrop',
          args: [BigInt(count), Number(contractRiskLevel)],
          value: plsNeeded,
          gas: 2n * (BigInt(500_000) + BigInt(count) * BigInt(150_000)),
          ...getGas(),
        });
      } else {
        txHash = await writeContractAsync({
          address: PLINKO_ADDRESS,
          abi: PLINKO_ABI,
          functionName: 'buyBallsAndDrop',
          args: [BigInt(count), wagerAmount, Number(contractRiskLevel)],
          gas: 2n * (BigInt(400_000) + BigInt(count) * BigInt(150_000)),
          ...getGas(),
        });
      }

      setIsConfirmingTransaction(true);
      setConfirmationStage('broadcast');

      const receipt: TransactionReceipt = await pollForReceipt(txHash, {
        maxAttempts: 30,
        intervalMs: 4000,
        onAttempt: (attempt) => {
          if (attempt <= 10) setConfirmationStage('broadcast');
          else if (attempt <= 20) setConfirmationStage('mempool');
          else setConfirmationStage('mined');
        },
      });

      setIsConfirmingTransaction(false);
      setConfirmationStage(null);

      if (!receipt || receipt.status === 'reverted') {
        throw new Error('Transaction reverted! Please verify approval, balances, and reserve.');
      }

      const plinkoLogs = receipt.logs.filter(
        (log) => log.address.toLowerCase() === PLINKO_ADDRESS.toLowerCase()
      );

      let totalWon = 0;
      const results: Array<{ bucket: number; multiplier: number; payout: number }> = [];
      const newAnimations: PlinkoAnimationItem[] = [];

      plinkoLogs.forEach((log) => {
        try {
          const animation = decodePlinkoBallDroppedLog(log);
          if (animation) {
            totalWon += animation.payout;
            results.push({
              bucket: animation.bucket,
              multiplier: animation.multiplier,
              payout: animation.payout,
            });
            newAnimations.push(animation);
          }
        } catch {
          // Skip malformed logs
        }
      });

      if (newAnimations.length > 0) {
        setScoredBallCount(0);
        setBallsLaunched(0);
        setExpectedBallCount(newAnimations.length);
        setAnimationQueue((prev) => [...prev, ...newAnimations]);

        for (let i = 0; i < newAnimations.length; i++) {
          const animation = newAnimations[i];
          const result = results[i];
          if (result) {
            await plinkoHistory.recordDrop(
              wagerPerBallMORBIUS,
              result.multiplier,
              animation.risk,
              result.bucket,
              txHash
            );
          }
        }

        setDropSummaryData({
          txHash,
          totalWon,
          ballCount: newAnimations.length,
          results,
        });
      }

      await playerInfo.refetch();
    } catch (error) {
      setIsConfirmingTransaction(false);
      const baseMessage = getPlinkoTransactionErrorMessage(error);
      let errorMessage = baseMessage;
      if (baseMessage.includes('user rejected')) errorMessage = 'Transaction rejected by user';
      else if (baseMessage.includes('insufficient funds')) errorMessage = 'Insufficient funds in wallet';
      alert(errorMessage);
    }
  }, [
    address,
    isConnected,
    minWager,
    maxWager,
    allowance,
    buyRiskLevel,
    riskLevelMap,
    wplsPerMORBIUS,
    writeContractAsync,
    getGas,
    pollForReceipt,
    plinkoHistory,
    playerInfo,
    onRequireApproval,
    setIsConfirmingTransaction,
    setConfirmationStage,
    setScoredBallCount,
    setBallsLaunched,
    setExpectedBallCount,
    setAnimationQueue,
    setDropSummaryData,
  ]);

  return { pollForReceipt, buyBalls };
}
