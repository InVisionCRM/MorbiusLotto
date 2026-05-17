'use client';

import React, { useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { Theme } from '@/lib/theme';
import { formatEther } from 'viem';
import { pulsechain } from 'viem/chains';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { TOURNAMENT_PRIZE_ESCROW_ADDRESS } from '@/lib/contracts';
import { tournamentPrizeEscrowV2Abi } from '@/abi/tournament-prize-escrow-v2';
import { tournamentIdToBytes32 } from '@/lib/tournament-id-bytes32';
import { useGasParams } from '@/lib/tx-gas';

const ESCROW_ZERO = '0x0000000000000000000000000000000000000000';

interface TournamentCancelReclaimProps {
  tournamentId: string;
  tournamentName: string;
  status: 'registration' | 'active' | 'completed' | 'cancelled';
  creatorAddress?: string | null;
  playerAddress?: string | null;
  prizeTokenAddress?: string | null;
  prizePool?: string;
  entryCount?: number;
  onChainTournamentId?: number | null;
  wsClient?: BlackjackWebSocketClient | null;
  onCancel?: () => void;
  onReclaim?: () => void;
}

export function TournamentCancelReclaim({
  tournamentId,
  tournamentName,
  status,
  creatorAddress,
  playerAddress,
  prizeTokenAddress,
  prizePool = '0',
  entryCount = 0,
  onChainTournamentId,
  wsClient,
  onCancel,
  onReclaim,
}: TournamentCancelReclaimProps) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const getGas = useGasParams();
  const [isCancelling, setIsCancelling] = useState(false);
  const [isReclaiming, setIsReclaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isCreator = creatorAddress && playerAddress && 
    creatorAddress.toLowerCase() === playerAddress.toLowerCase();
  const canCancel = isCreator && status === 'registration' && entryCount === 0;
  const canReclaim = isCreator && status === 'cancelled' && prizeTokenAddress;

  const handleCancel = async () => {
    if (!wsClient || !address) {
      setError('Not connected');
      return;
    }

    if (!confirm(`Are you sure you want to cancel "${tournamentName}"? All buy-ins will be refunded to players.`)) {
      return;
    }

    setIsCancelling(true);
    setError(null);
    setSuccess(null);

    try {
      await wsClient.sendRequest('tournament_cancel', { tournamentId });
      setSuccess('Tournament cancelled successfully. Buy-ins have been refunded.');
      onCancel?.();
    } catch (err: any) {
      setError(err.message || 'Failed to cancel tournament');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleReclaim = async () => {
    if (!address) {
      setError('Please connect your wallet');
      return;
    }

    if (!confirm(`Reclaim funds from cancelled tournament "${tournamentName}"?`)) {
      return;
    }

    setIsReclaiming(true);
    setError(null);
    setSuccess(null);

    try {
      // Custom token always uses V2 (bytes32) escrow
      const escrowStr = String(TOURNAMENT_PRIZE_ESCROW_ADDRESS ?? '').toLowerCase();
      if (!escrowStr || escrowStr === ESCROW_ZERO) {
        setError('Escrow contract not configured for this tournament type');
        return;
      }
      const idBytes32 = tournamentIdToBytes32(tournamentId);
      const hash = await writeContractAsync({
        address: TOURNAMENT_PRIZE_ESCROW_ADDRESS,
        abi: tournamentPrizeEscrowV2Abi,
        functionName: 'creatorReclaim',
        args: [idBytes32],
        account: address,
        chain: pulsechain,
        ...getGas(),
      });
      setSuccess(`Funds reclaimed successfully! Transaction: ${hash.slice(0, 10)}...`);
      onReclaim?.();
    } catch (err: any) {
      setError(err.message || 'Failed to reclaim funds');
    } finally {
      setIsReclaiming(false);
    }
  };

  if (!isCreator) return null;

  return (
    <div className="space-y-3">
      {error && (
        <div className="p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-red-400 text-sm" style={Theme.panel.base}>
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-900/30 border border-green-500/30 text-green-400 text-sm" style={Theme.panel.base}>
          {success}
        </div>
      )}

      {canCancel && (
        <button
          onClick={handleCancel}
          disabled={isCancelling}
          className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all border border-red-500/30"
        >
          {isCancelling ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Cancelling...
            </span>
          ) : (
            'Cancel Tournament'
          )}
        </button>
      )}

      {canReclaim && (
        <div className="p-3 rounded-lg border border-yellow-500/30" style={Theme.panel.base}>
          <p className="text-yellow-400 text-xs mb-2 font-medium">Funds Available for Reclaim</p>
          <p className="text-white text-sm mb-3">
            {prizePool ? `${Number(formatEther(BigInt(prizePool))).toLocaleString()} tokens` : 'Unknown amount'}
          </p>
          <button
            onClick={handleReclaim}
            disabled={isReclaiming}
            className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-500 hover:to-yellow-600 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-semibold text-sm transition-all border border-yellow-500/30"
          >
            {isReclaiming ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Reclaiming...
              </span>
            ) : (
              'Reclaim Funds'
            )}
          </button>
        </div>
      )}

      {status === 'cancelled' && !canReclaim && (
        <div className="p-3 rounded-lg border border-gray-500/30 text-gray-400 text-xs" style={Theme.panel.base}>
          {prizeTokenAddress
            ? 'Tournament cancelled. Funds may be available for reclaim.'
            : onChainTournamentId != null
              ? 'Tournament cancelled. If you paid a buy-in, call refund() on the MorbiusTournament contract to recover it.'
              : 'Tournament cancelled. No escrow funds to reclaim.'}
        </div>
      )}
    </div>
  );
}
