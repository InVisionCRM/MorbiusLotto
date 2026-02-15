'use client';

import { useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useChainId, useSwitchChain } from 'wagmi';
import { formatEther } from 'viem';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS } from '@/lib/contracts';
import { morbiusHolderDistributorAbi } from '@/abi/morbius-holder-distributor';
import { pulsechain } from '@/lib/chains';
import { toast } from 'sonner';

const DISTRIBUTOR_ADDRESS = MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS as `0x${string}`;

function formatTwoDecimals(val: bigint): string {
  const s = formatEther(val);
  const [int, dec] = s.split('.');
  return `${int}.${(dec ?? '00').slice(0, 2).padEnd(2, '0')}`;
}

export default function ClaimFeesPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const isWrongChain = chainId !== pulsechain.id;

  const { data: earned, refetch: refetchEarned } = useReadContract({
    address: DISTRIBUTOR_ADDRESS,
    abi: morbiusHolderDistributorAbi,
    functionName: 'earned',
    args: address ? [address] : undefined,
  });
  const { data: circulating } = useReadContract({
    address: DISTRIBUTOR_ADDRESS,
    abi: morbiusHolderDistributorAbi,
    functionName: 'getCirculating',
  });

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, isError, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash });

  const earnedBigInt = earned ?? 0n;
  const hasClaimable = earnedBigInt > 0n;
  const isBusy = isPending || isConfirming;

  useEffect(() => {
    if (isSuccess) {
      refetchEarned();
      toast.success('Transaction confirmed');
    }
  }, [isSuccess, refetchEarned]);

  useEffect(() => {
    if (isError && receiptError) {
      const msg = receiptError?.message || 'Transaction failed';
      toast.error(msg);
    }
  }, [isError, receiptError]);

  useEffect(() => {
    if (writeError) {
      toast.error(writeError.message || 'Transaction rejected or failed');
    }
  }, [writeError]);

  const ensureChain = async () => {
    if (isWrongChain && switchChainAsync) {
      await switchChainAsync({ chainId: pulsechain.id });
    }
  };

  const handleUpdatePool = () => {
    ensureChain().then(() => {
      writeContract({
        address: DISTRIBUTOR_ADDRESS,
        abi: morbiusHolderDistributorAbi,
        functionName: 'updatePool',
      } as unknown as Parameters<typeof writeContract>[0]);
    }).catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to switch chain'));
  };

  const handleClaim = () => {
    if (!hasClaimable) {
      toast.error('Nothing to claim');
      return;
    }
    ensureChain().then(() => {
      writeContract({
        address: DISTRIBUTOR_ADDRESS,
        abi: morbiusHolderDistributorAbi,
        functionName: 'claim',
      } as unknown as Parameters<typeof writeContract>[0]);
    }).catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to switch chain'));
  };

  return (
    <GlobalMainNav>
      <div className="min-h-screen bg-black text-white pt-4 md:pt-2">
        <div className="container mx-auto px-4 py-8">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold text-center mb-2 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
            Claim MORBIUS Rewards
          </h1>
          <p className="text-center text-slate-400 text-sm mb-8">
            Holder rewards from ticket sales and deposits. Connect wallet and claim when you have a balance.
          </p>

          <div className="rounded-2xl overflow-hidden border border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 shadow-[inset_0_3px_6px_rgba(0,0,0,0.8),inset_0_-3px_6px_rgba(255,255,255,0.1),0_1px_3px_rgba(0,0,0,0.5)]">
            <div className="p-6 space-y-4">
              {!isConnected ? (
                <p className="text-center text-slate-400 text-sm">Connect your wallet to see claimable rewards and claim.</p>
              ) : isWrongChain ? (
                <div className="space-y-3">
                  <p className="text-center text-slate-400 text-sm">Switch to PulseChain to claim rewards.</p>
                  <button
                    type="button"
                    onClick={() => switchChainAsync?.({ chainId: pulsechain.id })}
                    disabled={!switchChainAsync}
                    className="w-full py-3 rounded-xl font-medium bg-gradient-to-r from-cyan-600 to-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:from-cyan-500 hover:to-blue-500 transition-all"
                  >
                    Switch to PulseChain
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400">Claimable</span>
                    <span className="font-mono text-cyan-300">
                      {formatTwoDecimals(earnedBigInt)} MORBIUS
                    </span>
                  </div>
                  {circulating !== undefined && (
                    <div className="flex justify-between items-center text-xs text-slate-500">
                      <span>Circulating supply (reference)</span>
                      <span className="font-mono">{formatTwoDecimals(circulating)}</span>
                    </div>
                  )}
                  <p className="text-xs text-amber-400/90 bg-amber-950/30 rounded-lg p-2 border border-amber-600/30">
                    <strong>Hold MORBIUS to earn.</strong> If you hold MORBIUS but see 0 claimable, click &quot;Refresh rewards&quot; first—the pool must be updated before amounts appear.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleUpdatePool}
                      disabled={isBusy}
                      className="flex-1 py-3 rounded-xl font-medium bg-slate-700 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600 transition-all border border-slate-600"
                    >
                      {isBusy ? 'Processing…' : 'Refresh rewards'}
                    </button>
                    <button
                      type="button"
                      onClick={handleClaim}
                      disabled={!hasClaimable || isBusy}
                      className="flex-1 py-3 rounded-xl font-medium bg-gradient-to-r from-cyan-600 to-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:from-cyan-500 hover:to-blue-500 transition-all"
                    >
                      {isBusy ? 'Processing…' : hasClaimable ? 'Claim MORBIUS' : 'Nothing to claim'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <p className="text-center text-slate-500 text-xs mt-6">
            Rewards accrue from a share of lottery and game activity. You pay gas to claim.
          </p>
        </div>
        </div>
      </div>
    </GlobalMainNav>
  );
}
