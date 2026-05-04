'use client';

/**
 * Approve + addToPrizePool; parent passes tx hash to server join.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { erc20Abi, formatUnits } from 'viem';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { TOURNAMENT_PRIZE_ESCROW_ADDRESS, WPLS_TOKEN_ADDRESS } from '@/lib/contracts';
import { getWplsShortfall, WPLS_DEPOSIT_ABI } from '@/lib/ensure-wpls-balance';
import { tournamentPrizeEscrowV2Abi } from '@/abi/tournament-prize-escrow-v2';
import { tournamentIdToBytes32 } from '@/lib/tournament-id-bytes32';
import { formatPrizeTokenUnitLabel } from '@/lib/format-poker-tournament-prize-display';
import { fetchDexScreenerTokenInfo } from '@/lib/dexscreener-token-info';
import { BackgroundBeams } from '@/components/ui/background-beams';

export type EscrowBuyInJoinStep =
  | 'idle'
  | 'wrapping'
  | 'wrapped'
  | 'approving'
  | 'depositing'
  | 'done'
  | 'failed';

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
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    void (async () => {
      try {
        const info = await fetchDexScreenerTokenInfo(tokenAddress, ctrl.signal);
        if (!cancelled) setLogoUrl(info?.logoUrl ?? null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [tokenAddress]);

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

  // PLS preset uses the WPLS address. On mobile, wrapping in the same chain as
  // approve loses the user-gesture context and the wallet popup gets dismissed.
  // So we preflight: if a wrap is needed, surface it as its own user-clicked step.
  const isWplsToken = tokenAddress.toLowerCase() === WPLS_TOKEN_ADDRESS.toLowerCase();
  const [wrapShortfall, setWrapShortfall] = useState<bigint | null>(null);
  const wrapNeeded = isWplsToken && wrapShortfall != null && wrapShortfall > 0n && step !== 'wrapped' && step !== 'done';

  useEffect(() => {
    if (!isWplsToken || !address || !publicClient) {
      setWrapShortfall(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const sf = await getWplsShortfall({ publicClient, owner: address, requiredWei: buyInWei });
        if (!cancelled) setWrapShortfall(sf);
      } catch {
        if (!cancelled) setWrapShortfall(0n); // fail open — let approve step handle real errors
      }
    })();
    return () => { cancelled = true; };
  }, [isWplsToken, address, publicClient, buyInWei]);

  const runWrap = useCallback(async () => {
    if (!address || !publicClient || wrapShortfall == null || wrapShortfall <= 0n) return;
    setErr(null);
    setStep('wrapping');
    try {
      const nativeBalance = await publicClient.getBalance({ address });
      if (nativeBalance < wrapShortfall) {
        throw new Error(
          `Need ${wrapShortfall.toString()} more PLS to wrap, but wallet only has ${nativeBalance.toString()}.`,
        );
      }
      const hash = await writeContractAsync({
        address: WPLS_TOKEN_ADDRESS as `0x${string}`,
        abi: WPLS_DEPOSIT_ABI,
        functionName: 'deposit',
        value: wrapShortfall,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setStep('wrapped');
      setWrapShortfall(0n);
    } catch (e) {
      setStep('failed');
      setErr((e as Error).message ?? 'Wrap PLS failed');
    }
  }, [address, publicClient, wrapShortfall, writeContractAsync]);

  const runApproveAndDeposit = useCallback(async () => {
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

  const busy = step === 'wrapping' || step === 'approving' || step === 'depositing';
  const symbolForBadge = (tokenSymbol ?? '?').slice(0, 4).toUpperCase();
  const initial = symbolForBadge.charAt(0);

  const STEPS: { key: 'wrap' | 'approve' | 'deposit' | 'done'; label: string }[] = isWplsToken
    ? [
        { key: 'wrap', label: 'Wrap PLS' },
        { key: 'approve', label: 'Approve' },
        { key: 'deposit', label: 'Deposit' },
        { key: 'done', label: 'Joined' },
      ]
    : [
        { key: 'approve', label: 'Approve token' },
        { key: 'deposit', label: 'Deposit to escrow' },
        { key: 'done', label: 'Joined' },
      ];

  const stepStateOf = (key: 'wrap' | 'approve' | 'deposit' | 'done'): 'pending' | 'active' | 'complete' => {
    if (key === 'wrap') {
      if (step === 'wrapping') return 'active';
      if (step === 'wrapped' || step === 'approving' || step === 'depositing' || step === 'done') return 'complete';
      return 'pending';
    }
    if (key === 'approve') {
      if (step === 'approving') return 'active';
      if (step === 'depositing' || step === 'done') return 'complete';
      return 'pending';
    }
    if (key === 'deposit') {
      if (step === 'depositing') return 'active';
      if (step === 'done') return 'complete';
      return 'pending';
    }
    return step === 'done' ? 'complete' : 'pending';
  };

  const ctaLabel = wrapNeeded
    ? step === 'wrapping' ? 'Wrapping PLS…' : 'Wrap PLS'
    : step === 'approving'
      ? 'Approving…'
      : step === 'depositing'
        ? 'Depositing…'
        : step === 'done'
          ? 'Joined ✓'
          : step === 'failed'
            ? 'Try again'
            : 'Approve & pay buy-in';

  const onCtaClick = wrapNeeded ? runWrap : runApproveAndDeposit;

  return (
    <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-950 shadow-[0_0_60px_-15px_rgba(34,211,238,0.35)]">
      {/* Animated beams background */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-60">
        <BackgroundBeams palette={{ primary: '#3B82F6', accent: '#A855F7', tail: '#EC4899' }} />
      </div>
      {/* Soft top glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-40"
        style={{
          background:
            'radial-gradient(60% 100% at 50% 0%, rgba(34,211,238,0.18) 0%, rgba(99,68,245,0.10) 45%, transparent 80%)',
        }}
      />

      <div className="relative z-10 p-5 space-y-5">
        {/* Header / token spotlight */}
        <div className="flex flex-col items-center text-center pt-2">
          <div className="relative">
            <div
              className="absolute -inset-3 rounded-full blur-2xl opacity-70"
              style={{
                background:
                  'conic-gradient(from 0deg, #18CCFC, #6344F5, #AE48FF, #18CCFC)',
              }}
            />
            <div className="relative h-24 w-24 rounded-full ring-2 ring-cyan-400/60 bg-slate-900 overflow-hidden flex items-center justify-center">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={tokenSymbol ?? 'token'}
                  className="h-full w-full object-cover"
                  onError={() => setLogoUrl(null)}
                />
              ) : (
                <span className="text-3xl font-extrabold tracking-tight text-white/90">
                  {initial}
                </span>
              )}
            </div>
          </div>

          <div className="mt-3 text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">
            Tournament buy-in
          </div>
          <div className="mt-1 flex items-baseline justify-center gap-2">
            <span className="font-mono tabular-nums text-3xl font-bold text-white">
              {human}
            </span>
            <span className="text-sm font-semibold text-cyan-200/90">{ticker}</span>
          </div>
          {tokenName && (
            <div className="mt-1 text-xs text-slate-400 truncate max-w-full">
              {tokenName}
            </div>
          )}
        </div>

        {/* Step tracker */}
        <div className="rounded-xl border border-white/10 bg-slate-900/60 backdrop-blur-sm p-3">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const state = stepStateOf(s.key);
              return (
                <React.Fragment key={s.key}>
                  <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
                    <div
                      className={[
                        'relative h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold transition-all',
                        state === 'complete'
                          ? 'bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.6)]'
                          : state === 'active'
                            ? 'bg-cyan-500 text-white shadow-[0_0_14px_rgba(34,211,238,0.7)]'
                            : 'bg-slate-800 text-slate-500 ring-1 ring-white/10',
                      ].join(' ')}
                    >
                      {state === 'active' && (
                        <span className="absolute inset-0 rounded-full animate-ping bg-cyan-400/40" />
                      )}
                      <span className="relative">
                        {state === 'complete' ? '✓' : i + 1}
                      </span>
                    </div>
                    <span
                      className={[
                        'text-[10px] uppercase tracking-wider truncate',
                        state === 'complete'
                          ? 'text-emerald-300'
                          : state === 'active'
                            ? 'text-cyan-200'
                            : 'text-slate-500',
                      ].join(' ')}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div
                      className={[
                        'h-px flex-1 mx-1 transition-colors',
                        stepStateOf(STEPS[i + 1].key) !== 'pending' ||
                        stepStateOf(s.key) === 'complete'
                          ? 'bg-cyan-400/60'
                          : 'bg-white/10',
                      ].join(' ')}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {err && (
          <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2 break-words">
            {err}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || busy || step === 'done'}
            onClick={() => void onCtaClick()}
            className="relative flex-1 min-w-[180px] inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:shadow-cyan-500/40 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
          >
            {busy && (
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
            )}
            <span className="relative inline-flex items-center gap-2">
              {busy && (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeOpacity="0.25"
                    strokeWidth="3"
                  />
                  <path
                    d="M22 12a10 10 0 0 1-10 10"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              )}
              {ctaLabel}
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-xl border border-slate-500/40 bg-slate-900/60 px-4 py-3 text-sm text-slate-300 hover:bg-white/[0.04] disabled:opacity-40"
          >
            Cancel
          </button>
        </div>

        <p className="text-[10px] text-slate-500 text-center">
          Funds are held in the on-chain prize escrow and refunded automatically if the tournament is cancelled.
        </p>
      </div>
    </div>
  );
}
