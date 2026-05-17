'use client';

import { useCallback, useEffect } from 'react';
import type { PublicClient } from 'viem';
import { usePublicClient } from 'wagmi';
import { pulsechain } from './chains';

export interface GasParams {
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}

// PulseChain runs at vastly higher absolute gas prices than Ethereum: a typical baseFee
// is ~600,000 gwei (= 6 × 10^14 wei) and the network spikes hard and often. The old
// hardcoded `200_000n` wei (0.0002 gwei) was billions of times below the network minimum,
// which is why so many txs sat in mempool indefinitely.
//
// Tuned for PulseChain's spiky gas market: priority sits above the observed p95 tail
// across recent blocks (seen up to ~2.85M gwei in single blocks), and the baseFee
// multiplier handles 4x spikes mid-mempool. Cost stays in pennies even at these levels.
//
// Units: bigint values below are wei (= "beats" in PulseChain parlance). 1 gwei = 1e9 wei.
const GWEI = 1_000_000_000n;

// Floor for priority tip. 3,000,000 gwei sits above the p95 tail of recent confirmed
// blocks — guarantees top-tier inclusion even during spikes.
const MIN_PRIORITY_FEE = 3_000_000n * GWEI;

// Multiplier on current baseFee for maxFeePerGas headroom. 4x absorbs a 4x baseFee
// spike while the tx waits in mempool — common on PulseChain.
const BASE_FEE_MULTIPLIER = 4n;

const POLL_INTERVAL_MS = 8_000;

// Fallback if RPC is unreachable before the first snapshot lands. 10,000,000 gwei maxFee
// is ~16x typical baseFee, covering even severe network spikes during the brief gap
// before the first live snapshot arrives.
const FALLBACK: GasParams = {
  maxFeePerGas: 10_000_000n * GWEI,
  maxPriorityFeePerGas: MIN_PRIORITY_FEE,
};

let snapshot: GasParams = FALLBACK;
let pollerStarted = false;

function startPoller(client: PublicClient): void {
  if (pollerStarted) return;
  pollerStarted = true;

  const refresh = async () => {
    try {
      const block = await client.getBlock({ blockTag: 'latest' });
      const baseFee = block.baseFeePerGas ?? 0n;
      if (baseFee === 0n) return;
      snapshot = {
        maxFeePerGas: baseFee * BASE_FEE_MULTIPLIER + MIN_PRIORITY_FEE,
        maxPriorityFeePerGas: MIN_PRIORITY_FEE,
      };
    } catch {
      // RPC hiccup; keep last good snapshot
    }
  };

  void refresh();
  setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
}

/**
 * Synchronous getter for the latest PulseChain gas params. Call inside writeContractAsync
 * so the wallet popup stays in the user-gesture window (no preceding await).
 *
 *   const getGas = useGasParams()
 *   await writeContractAsync({ address, abi, functionName, args, ...getGas() })
 */
export function useGasParams(): () => GasParams {
  const client = usePublicClient({ chainId: pulsechain.id });

  useEffect(() => {
    if (client) startPoller(client);
  }, [client]);

  return useCallback(() => snapshot, []);
}

/** Async variant for non-React callers. */
export async function fetchGasParams(client: PublicClient): Promise<GasParams> {
  try {
    const block = await client.getBlock({ blockTag: 'latest' });
    const baseFee = block.baseFeePerGas ?? 0n;
    if (baseFee === 0n) return FALLBACK;
    return {
      maxFeePerGas: baseFee * BASE_FEE_MULTIPLIER + MIN_PRIORITY_FEE,
      maxPriorityFeePerGas: MIN_PRIORITY_FEE,
    };
  } catch {
    return FALLBACK;
  }
}
