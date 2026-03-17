'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useReadContracts, useWriteContract } from 'wagmi';
import { formatEther } from 'viem';
import { toast } from 'sonner';
import { merkleClaimMorbiusAbi } from '@/abi/merkle-claim-morbius';
import { MERKLE_CLAIM_MORBIUS_ADDRESS } from '@/lib/contracts';
import { getApiUrlOptional } from '@/lib/api-urls';
import { pulsechain } from 'viem/chains';

export interface PublishedEpoch {
  id: number;
  epoch_number: number;
  snapshot_block: string | null;
  total_holders: number;
  total_reward_amount: string;
  merkle_root: string;
  status: string;
  published_at: string;
}

export interface ClaimableEpoch {
  epoch: PublishedEpoch;
  amount: string;       // raw wei string
  amountFormatted: string; // human-readable MORBIUS
  proof: string[];
  claimed: boolean;
  /** Set when this epoch's rewards were rolled into a newer epoch. Not directly claimable. */
  supersededByEpochNumber: number | null;
}

interface UseMerkleClaimsReturn {
  claimableEpochs: ClaimableEpoch[];
  totalClaimable: bigint;
  isLoading: boolean;
  error: string | null;
  claim: (epochId: number, amount: string, proof: string[]) => Promise<void>;
  isClaiming: boolean;
  claimingEpochId: number | null;
  claimConfirmed: boolean;
  refetch: () => void;
}

export function useMerkleClaims(): UseMerkleClaimsReturn {
  const { address } = useAccount();
  const apiBase = getApiUrlOptional();

  const [publishedEpochs, setPublishedEpochs] = useState<PublishedEpoch[]>([]);
  const [proofMap, setProofMap] = useState<Map<number, { amount: string; proof: string[]; supersededByEpochNumber: number | null }>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimingEpochId, setClaimingEpochId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Fetch published epochs ──────────────────────────────────────────────────
  useEffect(() => {
    if (!apiBase) return;
    fetch(`${apiBase}/api/merkle/epochs`)
      .then((r) => r.json())
      .then((data) => setPublishedEpochs(Array.isArray(data) ? data : []))
      .catch(() => { /* non-critical */ });
  }, [apiBase, refreshKey]);

  // ── Fetch proofs for the connected wallet ───────────────────────────────────
  useEffect(() => {
    if (!apiBase || !address || publishedEpochs.length === 0) return;

    const fetchProofs = async () => {
      const newMap = new Map<number, { amount: string; proof: string[]; supersededByEpochNumber: number | null }>();
      await Promise.allSettled(
        publishedEpochs.map(async (epoch) => {
          try {
            const res = await fetch(
              `${apiBase}/api/merkle/claim/${epoch.epoch_number}/${address}`,
            );
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
  }, [apiBase, address, publishedEpochs, refreshKey]);

  // ── Read hasClaimed for each epoch from contract ────────────────────────────
  const contractAddress = MERKLE_CLAIM_MORBIUS_ADDRESS || undefined;

  // Only check hasClaimed for non-superseded entries (superseded ones can't be claimed directly)
  const claimableEntries = contractAddress && address
    ? publishedEpochs.filter((e) => {
        const pd = proofMap.get(e.id);
        return pd && pd.supersededByEpochNumber === null;
      })
    : [];

  type HasClaimedCall = {
    address: `0x${string}`;
    abi: typeof merkleClaimMorbiusAbi;
    functionName: 'hasClaimed';
    args: readonly [bigint, `0x${string}`];
  };

  const hasClaimedCalls: HasClaimedCall[] = claimableEntries.map((e) => ({
    address: contractAddress as `0x${string}`,
    abi: merkleClaimMorbiusAbi,
    functionName: 'hasClaimed' as const,
    args: [BigInt(e.epoch_number), address!] as const,
  }));

  const { data: hasClaimedResults, refetch: refetchClaimed } = useReadContracts<
    readonly unknown[]
  >({
    contracts: hasClaimedCalls as readonly unknown[],
    query: { enabled: hasClaimedCalls.length > 0 },
  });

  // ── Build claimable list ────────────────────────────────────────────────────
  const claimableEpochs: ClaimableEpoch[] = [];

  for (const epoch of publishedEpochs) {
    const proofData = proofMap.get(epoch.id);
    if (!proofData) continue;

    if (proofData.supersededByEpochNumber !== null) {
      // Include in list so UI can show "rolled into epoch N"
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

  // ── Claim transaction ───────────────────────────────────────────────────────
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [claimConfirmed, setClaimConfirmed] = useState(false);

  const isClaiming = claimingEpochId !== null;

  const claim = useCallback(
    async (epochId: number, amount: string, proof: string[]) => {
      if (!contractAddress) {
        toast.error('Claim contract not configured yet');
        return;
      }
      setClaimingEpochId(epochId);
      try {
        const args = [BigInt(epochId), BigInt(amount), proof as `0x${string}`[]] as const;
        const hash = await writeContractAsync({
          address: contractAddress as `0x${string}`,
          abi: merkleClaimMorbiusAbi,
          functionName: 'claim',
          args,
          gas: 2_000_000n,
          maxPriorityFeePerGas: 200_000n,
          chain: pulsechain,
          account: address,
        });
        toast.success('Claim submitted! Waiting for confirmation…');
        // Wait for the on-chain receipt and verify it did not revert
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
        toast.success('MORBIUS claimed successfully!');
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
