'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useReadContracts, useWriteContract } from 'wagmi';
import { formatEther } from 'viem';
import { toast } from 'sonner';
import { merkleClaimLpAbi } from '@/abi/merkle-claim-lp';
import { MERKLE_CLAIM_LP_ADDRESS } from '@/lib/contracts';
import { getMerkleLpClaimPath, getMerkleLpEpochsPath } from '@/lib/api-urls';

export interface LPPublishedEpoch {
  id: number;
  epoch_number: number;
  snapshot_block: string | null;
  total_holders: number;
  total_reward_amount: string;
  merkle_root: string;
  status: string;
  published_at: string;
}

export interface LPClaimableEpoch {
  epoch: LPPublishedEpoch;
  amount: string;
  amountFormatted: string;
  proof: string[];
  claimed: boolean;
  supersededByEpochNumber: number | null;
}

interface UseMerkleClaimsLPReturn {
  claimableEpochs: LPClaimableEpoch[];
  totalClaimable: bigint;
  isLoading: boolean;
  error: string | null;
  claim: (epochId: number, amount: string, proof: string[]) => Promise<void>;
  isClaiming: boolean;
  claimingEpochId: number | null;
  claimConfirmed: boolean;
  refetch: () => void;
}

export function useMerkleClaimsLP(): UseMerkleClaimsLPReturn {
  const { address } = useAccount();

  const [publishedEpochs, setPublishedEpochs] = useState<LPPublishedEpoch[]>([]);
  const [proofMap, setProofMap] = useState<Map<number, {
    amount: string;
    proof: string[];
    supersededByEpochNumber: number | null;
  }>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimingEpochId, setClaimingEpochId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch published LP epochs
  useEffect(() => {
    fetch(getMerkleLpEpochsPath(), { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => setPublishedEpochs(Array.isArray(data) ? data : []))
      .catch(() => { /* non-critical */ });
  }, [refreshKey]);

  // Fetch proofs for connected wallet
  useEffect(() => {
    if (!address || publishedEpochs.length === 0) return;

    const fetchProofs = async () => {
      const newMap = new Map<number, { amount: string; proof: string[]; supersededByEpochNumber: number | null }>();
      await Promise.allSettled(
        publishedEpochs.map(async (epoch) => {
          try {
            const res = await fetch(getMerkleLpClaimPath(epoch.epoch_number, address), { cache: 'no-store' });
            if (res.ok) {
              const data = await res.json();
              newMap.set(epoch.id, {
                amount: data.amount,
                proof: data.proof,
                supersededByEpochNumber: data.supersededByEpochNumber ?? null,
              });
            }
          } catch { /* wallet not in this epoch */ }
        }),
      );
      setProofMap(newMap);
    };

    fetchProofs();
  }, [address, publishedEpochs, refreshKey]);

  // Read hasClaimed for non-superseded entries
  const contractAddress = MERKLE_CLAIM_LP_ADDRESS || undefined;

  const claimableEntries = contractAddress && address
    ? publishedEpochs.filter((e) => {
        const pd = proofMap.get(e.id);
        return pd && pd.supersededByEpochNumber === null;
      })
    : [];

  const hasClaimedCalls = claimableEntries.map((e) => ({
    address: contractAddress as `0x${string}`,
    abi: merkleClaimLpAbi,
    functionName: 'hasClaimed' as const,
    args: [BigInt(e.epoch_number), address!] as const,
  }));

  const { data: hasClaimedResults, refetch: refetchClaimed } = useReadContracts({
    contracts: hasClaimedCalls,
    query: { enabled: hasClaimedCalls.length > 0 },
  });

  // Build claimable list
  const claimableEpochs: LPClaimableEpoch[] = [];

  for (const epoch of publishedEpochs) {
    const proofData = proofMap.get(epoch.id);
    if (!proofData) continue;

    if (proofData.supersededByEpochNumber !== null) {
      claimableEpochs.push({
        epoch,
        amount: proofData.amount,
        amountFormatted: formatEther(BigInt(proofData.amount)),
        proof: [],
        claimed: false,
        supersededByEpochNumber: proofData.supersededByEpochNumber,
      });
      continue;
    }

    const idx = claimableEntries.findIndex((e) => e.id === epoch.id);
    const result = idx >= 0 ? hasClaimedResults?.[idx] : undefined;
    const claimed = result?.status === 'success' ? Boolean(result.result) : false;

    claimableEpochs.push({
      epoch,
      amount: proofData.amount,
      amountFormatted: formatEther(BigInt(proofData.amount)),
      proof: proofData.proof,
      claimed,
      supersededByEpochNumber: null,
    });
  }

  const totalClaimable = claimableEpochs
    .filter((e) => !e.claimed && e.supersededByEpochNumber === null)
    .reduce((sum, e) => sum + BigInt(e.amount), 0n);

  // Claim transaction
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [claimConfirmed, setClaimConfirmed] = useState(false);

  const isClaiming = claimingEpochId !== null;

  const claim = useCallback(
    async (epochId: number, amount: string, proof: string[]) => {
      if (!contractAddress) {
        toast.error('LP claim contract not configured');
        return;
      }
      setClaimingEpochId(epochId);
      try {
        const args = [BigInt(epochId), BigInt(amount), proof as `0x${string}`[]] as const;
        let gasLimit = 300_000n; // fallback if estimation fails
        if (publicClient && address) {
          try {
            const estimated = await publicClient.estimateContractGas({
              address: contractAddress as `0x${string}`,
              abi: merkleClaimLpAbi,
              functionName: 'claim',
              args,
              account: address,
            });
            gasLimit = estimated * 2n; // double gas for safety
          } catch {
            // keep fallback
          }
        }
        const hash = await writeContractAsync({
          address: contractAddress as `0x${string}`,
          abi: merkleClaimLpAbi,
          functionName: 'claim',
          args,
          gas: gasLimit,
          maxPriorityFeePerGas: 200_000n, // 200k wei/beats tip (PulseChain) for faster inclusion
        });
        toast.success('Claim submitted! Waiting for confirmation…');
        if (publicClient) {
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status === 'reverted') {
            throw new Error(
              'Transaction reverted on-chain. The claim failed (e.g. invalid proof, already claimed, or epoch not active). Check the transaction on the explorer.',
            );
          }
        }
        setClaimConfirmed(true);
        setRefreshKey((k) => k + 1);
        refetchClaimed();
        setClaimingEpochId(null);
        toast.success('LP rewards claimed successfully!');
      } catch (err: any) {
        const msg = err?.shortMessage || err?.message || 'Claim failed';
        toast.error(msg);
        setClaimingEpochId(null);
      }
    },
    [contractAddress, address, writeContractAsync, refetchClaimed, publicClient],
  );

  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1);
    refetchClaimed();
  }, [refetchClaimed]);

  return {
    claimableEpochs,
    totalClaimable,
    isLoading,
    error,
    claim,
    isClaiming,
    claimingEpochId,
    claimConfirmed,
    refetch,
  };
}
