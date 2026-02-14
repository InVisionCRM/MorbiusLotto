'use client';

import { useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatEther } from 'viem';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS } from '@/lib/contracts';
import { morbiusHolderDistributorAbi } from '@/abi/morbius-holder-distributor';
import { toast } from 'sonner';

export default function ClaimFeesPage() {
  const { address, isConnected } = useAccount();
  const { data: earned, refetch: refetchEarned } = useReadContract({
    address: MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS,
    abi: morbiusHolderDistributorAbi,
    functionName: 'earned',
    args: address ? [address] : undefined,
  });
  const { data: circulating } = useReadContract({
    address: MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS,
    abi: morbiusHolderDistributorAbi,
    functionName: 'getCirculating',
  });
  const { writeContract: writeClaim, data: claimHash, isPending: claimPending } = useWriteContract();
  const { isLoading: claimConfirming, isSuccess: claimSuccess } = useWaitForTransactionReceipt({ hash: claimHash });

  const earnedBigInt = earned ?? 0n;
  const hasClaimable = earnedBigInt > 0n;
  const isClaiming = claimPending || claimConfirming;

  useEffect(() => {
    if (claimSuccess) {
      refetchEarned();
      toast.success('Claim successful');
    }
  }, [claimSuccess, refetchEarned]);

  const handleClaim = () => {
    if (!hasClaimable) {
      toast.error('Nothing to claim');
      return;
    }
    writeClaim({
      address: MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS,
      abi: morbiusHolderDistributorAbi,
      functionName: 'claim',
    });
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="border-b border-white/10 py-4">
        <div className="container mx-auto px-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>
      </div>

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
              ) : (
                <>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-400">Claimable</span>
                    <span className="font-mono text-cyan-300">
                      {formatEther(earnedBigInt)} MORBIUS
                    </span>
                  </div>
                  {circulating !== undefined && (
                    <div className="flex justify-between items-center text-xs text-slate-500">
                      <span>Circulating supply (reference)</span>
                      <span className="font-mono">{formatEther(circulating)}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleClaim}
                    disabled={!hasClaimable || isClaiming}
                    className="w-full py-3 rounded-xl font-medium bg-gradient-to-r from-cyan-600 to-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:from-cyan-500 hover:to-blue-500 transition-all"
                  >
                    {isClaiming ? 'Claiming…' : hasClaimable ? 'Claim MORBIUS' : 'Nothing to claim'}
                  </button>
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
  );
}
