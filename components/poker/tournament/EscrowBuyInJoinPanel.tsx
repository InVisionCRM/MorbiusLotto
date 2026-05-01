'use client';

/**
 * Approve + addToPrizePool; parent passes tx hash to server join.
 */

import React, { useCallback, useState } from 'react';
import { erc20Abi, formatUnits } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { TOURNAMENT_PRIZE_ESCROW_ADDRESS } from '@/lib/contracts';
import { tournamentPrizeEscrowV2Abi } from '@/abi/tournament-prize-escrow-v2';
import { tournamentIdToBytes32 } from '@/lib/tournament-id-bytes32';
import { formatPrizeTokenUnitLabel } from '@/lib/format-poker-tournament-prize-display';

export type EscrowBuyInJoinStep = 'idle' | 'approving' | 'depositing' | 'done' | 'failed';

export function EscrowBuyInJoinPanel({
  tournamentId,
  tokenAddress,
  tokenDecimals,
  tokenSymbol,
  tokenName,
  buyInWei,
  onSuccess,
  onCancel,
  disabled,
}: {
  tournamentId: string;
  tokenAddress: `0x${string}`;
  tokenDecimals: number;
  tokenSymbol: string | null;
  tokenName: string | null;
  buyInWei: bigint;
  onSuccess: (depositTxHash: `0x${string}`) => void | Promise<void>;
  onCancel: () => void;
  disabled?: boolean;
}) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [step, setStep] = useState<EscrowBuyInJoinStep>('idle');
  const [err, setErr] = useState<string | null>(null);

  const ticker = formatPrizeTokenUnitLabel({
    prizeTokenAddress: tokenAddress,
    prizeTokenSymbol: tokenSymbol,
    prizeTokenName: tokenName,
  });
  let human: string;
  try {
    human = formatUnits(buyInWei, tokenDecimals);
  } catch {
    human = buyInWei.toString();
  }

  const run = useCallback(async () => {
    if (!address || !publicClient) {
      setErr('Connect your wallet');
      return;
    }
    setErr(null);
    setStep('approving');
    try {
      const escrow = TOURNAMENT_PRIZE_ESCROW_ADDRESS as `0x${string}`;
      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, escrow],
      });
      if (allowance < buyInWei) {
        const approveHash = await writeContractAsync({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [escrow, buyInWei],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }
      setStep('depositing');
      const bytes32 = tournamentIdToBytes32(tournamentId) as `0x${string}`;
      const depositHash = await writeContractAsync({
        address: escrow,
        abi: tournamentPrizeEscrowV2Abi,
        functionName: 'addToPrizePool',
        args: [bytes32, tokenAddress, buyInWei],
      });
      await publicClient.waitForTransactionReceipt({ hash: depositHash });
      setStep('done');
      await onSuccess(depositHash);
    } catch (e) {
      setStep('failed');
      setErr((e as Error).message ?? 'Transaction failed');
    }
  }, [address, publicClient, tokenAddress, buyInWei, tournamentId, writeContractAsync, onSuccess]);

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 p-4 space-y-3 max-w-md">
      <h3 className="text-sm font-semibold text-white">Pay buy-in on-chain</h3>
      <p className="text-xs text-slate-400">
        Approve then deposit <span className="text-cyan-200/90 font-mono tabular-nums">{human}</span>{' '}
        <span className="text-slate-300">{ticker}</span> into the prize escrow for this tournament.
      </p>
      {err && (
        <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2 break-words">{err}</p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          disabled={disabled || step === 'approving' || step === 'depositing' || step === 'done'}
          onClick={() => void run()}
          className="inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"
        >
          {step === 'idle' || step === 'failed'
            ? 'Approve & pay'
            : step === 'approving'
              ? 'Approving…'
              : step === 'depositing'
                ? 'Depositing…'
                : step === 'done'
                  ? 'Done'
                  : '…'}
        </button>
        <button
          type="button"
          disabled={step === 'approving' || step === 'depositing'}
          onClick={onCancel}
          className="inline-flex items-center justify-center rounded-lg border border-slate-500/50 px-4 py-2 text-xs text-slate-300 hover:bg-white/[0.04]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
