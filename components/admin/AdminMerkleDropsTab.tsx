'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAccount, useWriteContract, usePublicClient, useReadContract } from 'wagmi';
import { formatEther, parseAbiItem } from 'viem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Loader2, RefreshCw, Plus, ChevronDown, ChevronRight,
  CheckCircle2, Gift, TreePine, Globe, ShieldX, Trash2, XCircle,
  Coins, ArrowRight, ExternalLink, Info, Settings, Zap, Layers, Users,
} from 'lucide-react';
import { WalletIcon } from '@/components/shared/WalletIcon';
import { merkleClaimMorbiusAbi } from '@/abi/merkle-claim-morbius';
import { ERC20_ABI } from '@/abi/erc20';
import {
  MERKLE_CLAIM_MORBIUS_ADDRESS,
  MORBIUS_TOKEN_ADDRESS,
  PLINKO_ADDRESS,
  KENO_ADDRESS,
  BIGWHEEL_ADDRESS,
  LOTTERY_INSTANT_ADDRESS,
  BLACKJACK_ADDRESS,
  MORBIUS_STAKING_ADDRESS,
  MORBIUS_LP_STAKING_ADDRESS,
  MERKLE_CLAIM_LP_ADDRESS,
  MORBIUS_WPLS_V1_PAIR,
  TOURNAMENT_PRIZE_ESCROW_ADDRESS,
  MORBIUS_TOURNAMENT_ADDRESS,
  MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS,
} from '@/lib/contracts';
import { pulsechain } from '@/lib/chains';
import { getApiUrlOptional } from '@/lib/api-urls';
import { SNAPSHOT_EXCLUSION_SET } from '@/lib/snapshot-exclusions';
import { useGasParams } from '@/lib/tx-gas';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EpochRecord {
  id: number;
  epoch_number: number;
  snapshot_block: string | null;
  total_holders: number;
  total_balance: string;
  total_reward_amount: string;   // new + rollup (sum of all Merkle leaves)
  new_reward_amount: string;     // freshly deposited this epoch
  rollup_amount: string;         // carried over from prior unclaimed epochs
  merkle_root: string | null;
  status: 'pending' | 'snapshot' | 'calculated' | 'finalized' | 'published';
  min_holding_threshold: string;
  cron_triggered: boolean;
  created_at: string;
  snapshot_at: string | null;
  calculated_at: string | null;
  finalized_at: string | null;
  published_at: string | null;
}

interface BlocklistEntry {
  address: string;
  reason: string;
  added_at: string;
}

interface SnapshotRow {
  wallet_address: string;
  morbius_balance: string;
  reward_amount: string;
  merkle_proof: string[] | null;
}

interface ClaimRow {
  wallet_address: string;
  reward_amount: string;
  claimed_at: string;
}

type EpochDetailTab = 'overview' | 'funding' | 'holders' | 'claims' | 'onchain';

const EPOCH_DETAIL_TABS: { id: EpochDetailTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'funding', label: 'Funding' },
  { id: 'holders', label: 'Holders' },
  { id: 'claims', label: 'Claims' },
  { id: 'onchain', label: 'On-chain' },
];

interface MerkleSettings {
  schedule_type: 'manual' | 'weekly' | 'biweekly' | 'monthly' | 'interval_minutes' | 'interval_hours';
  schedule_day: string;      // 0-6 for weekly/biweekly, 1-28 for monthly
  schedule_hour_utc: string; // 0-23
  schedule_interval: string; // numeric interval for interval_minutes / interval_hours
  default_reward_wei: string;
  auto_publish_onchain: string; // 'true' | 'false'
  countdown_duration: string;  // custom countdown in seconds ('0' = use auto-calculated from schedule)
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Compute next UTC fire date from schedule settings. Returns null if manual. */
function nextEpochDate(settings: MerkleSettings): Date | null {
  if (settings.schedule_type === 'manual') return null;

  const now = new Date();

  if (settings.schedule_type === 'interval_minutes' || settings.schedule_type === 'interval_hours') {
    const interval = parseInt(settings.schedule_interval, 10) || 1;
    const intervalMs = settings.schedule_type === 'interval_minutes'
      ? interval * 60_000
      : interval * 3_600_000;
    // Next aligned interval from epoch
    const nextMs = Math.ceil(now.getTime() / intervalMs) * intervalMs;
    // If we're exactly on the boundary, go to the next one
    return new Date(nextMs <= now.getTime() ? nextMs + intervalMs : nextMs);
  }

  const day = parseInt(settings.schedule_day, 10);
  const hour = parseInt(settings.schedule_hour_utc, 10);
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));

  if (settings.schedule_type === 'weekly' || settings.schedule_type === 'biweekly') {
    // Find next occurrence of day-of-week >= today
    let daysAhead = day - now.getUTCDay();
    if (daysAhead < 0 || (daysAhead === 0 && now.getUTCHours() >= hour)) daysAhead += 7;
    if (settings.schedule_type === 'biweekly' && daysAhead < 7) daysAhead += 7; // skip one week
    next.setUTCDate(now.getUTCDate() + daysAhead);
  } else if (settings.schedule_type === 'monthly') {
    // Next occurrence of day-of-month
    next.setUTCDate(day);
    if (next <= now) {
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(day);
    }
  }
  return next;
}

// on-chain sub-step within the "finalized" stage
type OnchainStep = 'approve' | 'deposit' | 'setroot' | 'done';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMorbius(raw: string | number): string {
  const n = typeof raw === 'string' ? Number(raw) / 1e18 : raw;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const STATUS_LABELS: Record<EpochRecord['status'], { label: string; color: string }> = {
  pending:    { label: 'Pending',     color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  snapshot:   { label: 'Snapshotted', color: 'text-blue-400   bg-blue-400/10   border-blue-400/20' },
  calculated: { label: 'Calculated',  color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  finalized:  { label: 'Finalized',   color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
  published:  { label: 'Published',   color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
};

const MERKLE_ADDR = MERKLE_CLAIM_MORBIUS_ADDRESS as `0x${string}`;
const MERKLE_LP_ADDR = MERKLE_CLAIM_LP_ADDRESS as `0x${string}`;
const TOKEN_ADDR  = MORBIUS_TOKEN_ADDRESS as `0x${string}`;
const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

// ─── On-chain sub-component (needs hooks, so isolated) ────────────────────────

function OnchainActions({
  epoch,
  adminAddr,
  onPublished,
}: {
  epoch: EpochRecord;
  adminAddr: `0x${string}`;
  onPublished: (epochId: number) => void;
}) {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const getGas = useGasParams();

  // Only deposit the NEW rewards; rolled-up amounts are already in the contract.
  const depositWei = BigInt(epoch.new_reward_amount || epoch.total_reward_amount || '0');
  // total_reward_amount = new + rolled-up; passed to setEpochRoot as informational total.
  const totalWei = BigInt(epoch.total_reward_amount || '0');
  const rollupWei = BigInt(epoch.rollup_amount || '0');

  // Read current MORBIUS allowance for the MerkleClaim contract
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: TOKEN_ADDR,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [adminAddr, MERKLE_ADDR],
    query: { enabled: Boolean(MERKLE_ADDR) && depositWei > 0n },
  });
  const currentAllowance = (allowance as bigint | undefined) ?? 0n;

  // Contract balance: if already >= totalWei, deposit is done (e.g. after refresh or RPC timeout)
  const { data: contractBalance } = useReadContract({
    address: TOKEN_ADDR,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [MERKLE_ADDR],
    query: { enabled: Boolean(MERKLE_ADDR) && totalWei > 0n },
  });
  const contractMorbiusBalance = (contractBalance as bigint | undefined) ?? 0n;

  const [step, setStep] = useState<OnchainStep>(
    depositWei === 0n ? 'setroot' :        // no new deposit needed
    currentAllowance >= depositWei ? 'deposit' : 'approve',
  );
  const [waiting, setWaiting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  // Keep step in sync with allowance and contract balance (e.g. already deposited, or after refresh)
  useEffect(() => {
    if (depositWei === 0n && step === 'approve') {
      setStep('setroot');
    } else if (contractMorbiusBalance >= totalWei && totalWei > 0n && (step === 'approve' || step === 'deposit')) {
      setStep('setroot'); // contract already has enough — e.g. deposit succeeded, user refreshed or RPC timed out
    } else if (currentAllowance >= depositWei && depositWei > 0n && step === 'approve') {
      setStep('deposit');
    }
  }, [currentAllowance, contractMorbiusBalance, depositWei, totalWei, step]);

  const waitForTx = async (hash: `0x${string}`, then: () => void) => {
    setTxHash(hash);
    setWaiting(true);
    const RECEIPT_TIMEOUT_MS = 90_000; // 90s — avoid stuck loading if RPC hangs
    try {
      await publicClient!.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
      then();
    } catch {
      setMsg('Confirmation timed out. If the tx succeeded on PulseScan, proceed to Set Root.');
      then(); // advance step so user can continue without getting stuck
    } finally {
      setWaiting(false);
      setTxHash(null);
    }
  };

  // ── Step 1: Approve ───────────────────────────────────────────────────────

  const handleApprove = async () => {
    if (depositWei === 0n) { setStep('setroot'); return; }
    setMsg('');
    try {
      const hash = await writeContractAsync({
        address: TOKEN_ADDR,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [MERKLE_ADDR, MAX_UINT256],
        ...getGas(),
        chain: pulsechain,
        account: adminAddr,
      });
      await waitForTx(hash, () => {
        refetchAllowance();
        setStep('deposit');
        setMsg('✓ Approved');
      });
    } catch (e: any) {
      setMsg(e?.shortMessage || e?.message || 'Approval failed');
    }
  };

  // ── Step 2: Deposit Rewards ───────────────────────────────────────────────

  const handleDeposit = async () => {
    if (depositWei === 0n) { setStep('setroot'); return; }
    setMsg('');
    try {
      const hash = await writeContractAsync({
        address: MERKLE_ADDR,
        abi: merkleClaimMorbiusAbi,
        functionName: 'depositRewards',
        args: [depositWei],
        ...getGas(),
        chain: pulsechain,
        account: adminAddr,
      });
      await waitForTx(hash, () => {
        setStep('setroot');
        setMsg(`✓ Deposited ${fmtMorbius(epoch.new_reward_amount || epoch.total_reward_amount)} MORBIUS`);
      });
    } catch (e: any) {
      setMsg(e?.shortMessage || e?.message || 'Deposit failed');
    }
  };

  // ── Step 3: Set Epoch Root ────────────────────────────────────────────────

  const handleSetRoot = async () => {
    if (!epoch.merkle_root) { setMsg('No Merkle root — finalize first'); return; }
    setMsg('');
    try {
      const hash = await writeContractAsync({
        address: MERKLE_ADDR,
        abi: merkleClaimMorbiusAbi,
        functionName: 'setEpochRoot',
        args: [BigInt(epoch.epoch_number), epoch.merkle_root as `0x${string}`, totalWei],
        ...getGas(),
        chain: pulsechain,
        account: adminAddr,
      });
      await waitForTx(hash, async () => {
        setStep('done');
        setMsg('✓ Root set on-chain! Epoch is now published — users can claim.');
        // Auto-mark published in backend, then refresh after a short delay so
        // the success message is visible before OnchainActions unmounts.
        try {
          const publishRes = await fetch(`/api/admin/merkle/epoch/${epoch.id}/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-wallet': adminAddr },
          });
          if (!publishRes.ok) throw new Error(`HTTP ${publishRes.status}`);
          setTimeout(() => onPublished(epoch.id), 2500);
        } catch (publishErr: any) {
          setMsg(`✓ Root set on-chain! But auto-publish failed (${publishErr?.message ?? 'unknown'}) — click the page refresh button to reload.`);
        }
      });
    } catch (e: any) {
      setMsg(e?.shortMessage || e?.message || 'setEpochRoot failed');
    }
  };

  if (totalWei === 0n) {
    return <p className="text-xs text-yellow-400">Set reward amount first (Calculate Rewards step).</p>;
  }

  const stepNum = step === 'approve' ? 1 : step === 'deposit' ? 2 : step === 'setroot' ? 3 : 4;
  const noNewDeposit = depositWei === 0n;

  return (
    <div className="space-y-3">
      {/* Rollup summary */}
      {rollupWei > 0n && (
        <div className="rounded border border-amber-500/20 bg-amber-950/10 px-3 py-2 text-[11px] text-amber-300 space-y-0.5">
          <p className="font-semibold">Cumulative rewards (rollup active)</p>
          <p>New deposit: <span className="font-mono">{fmtMorbius(epoch.new_reward_amount)} MORBIUS</span></p>
          <p>Rolled up from prior unclaimed: <span className="font-mono">{fmtMorbius(epoch.rollup_amount)} MORBIUS</span> (already in contract)</p>
          <p>Total epoch amount: <span className="font-mono">{fmtMorbius(epoch.total_reward_amount)} MORBIUS</span></p>
        </div>
      )}
      {noNewDeposit && (
        <p className="text-[11px] text-amber-400">All rewards are rolled up from prior epochs — no new deposit needed.</p>
      )}

      {/* Progress bar */}
      <div className="flex items-center gap-1.5 text-[11px]">
        {(['approve', 'deposit', 'setroot'] as const).map((s, i) => {
          const done = stepNum > i + 1;
          const active = stepNum === i + 1;
          const labels = ['1. Approve MORBIUS', '2. Deposit Rewards', '3. Set Root On-Chain'];
          return (
            <React.Fragment key={s}>
              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                done   ? 'border-emerald-500/40 text-emerald-400 bg-emerald-400/10' :
                active ? 'border-orange-400/40 text-orange-300 bg-orange-400/10' :
                         'border-slate-600 text-slate-500'
              }`}>
                {done ? '✓' : labels[i]}
              </span>
              {i < 2 && <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Action button */}
      <div className="flex items-center gap-3 flex-wrap">
        {step === 'approve' && (
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={waiting}
            className="h-8 bg-yellow-600 hover:bg-yellow-500 text-white text-xs"
          >
            {waiting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <WalletIcon size={12} className="mr-1" />}
            Approve MORBIUS
          </Button>
        )}

        {step === 'deposit' && (
          <Button
            size="sm"
            onClick={handleDeposit}
            disabled={waiting}
            className="h-8 bg-blue-600 hover:bg-blue-500 text-white text-xs"
          >
            {waiting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Coins className="w-3 h-3 mr-1" />}
            Deposit {fmtMorbius(epoch.new_reward_amount || epoch.total_reward_amount)} MORBIUS
          </Button>
        )}

        {step === 'setroot' && (
          <Button
            size="sm"
            onClick={handleSetRoot}
            disabled={waiting}
            className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
          >
            {waiting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Globe className="w-3 h-3 mr-1" />}
            Set Root On-Chain
          </Button>
        )}

        {step === 'done' && (
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
            <CheckCircle2 className="w-4 h-4" />
            Complete — users can now claim
          </div>
        )}

        {txHash && (
          <a
            href={`https://scan.pulsechain.com/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
          >
            Tx <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {msg && (
        <p className={`text-xs px-3 py-1.5 rounded border ${
          msg.startsWith('✓')
            ? 'text-emerald-400 bg-emerald-950/20 border-emerald-500/20'
            : 'text-red-400 bg-red-950/20 border-red-500/20'
        }`}>{msg}</p>
      )}
    </div>
  );
}

// ─── Standalone deposit (top-up) component ───────────────────────────────────
// Allows depositing an arbitrary MORBIUS amount into the holder claim contract
// without needing an active epoch — used to cover contract shortfalls.

function StandaloneDepositButton({ adminAddr }: { adminAddr: `0x${string}` }) {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const getGas = useGasParams();

  const [amountInput, setAmountInput] = useState('');
  const [step, setStep] = useState<'idle' | 'approve' | 'deposit' | 'done'>('idle');
  const [waiting, setWaiting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const parsedWei = (() => {
    const n = parseFloat(amountInput);
    if (!amountInput || isNaN(n) || n <= 0) return 0n;
    return BigInt(Math.round(n * 1e9)) * BigInt(1e9);
  })();

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: TOKEN_ADDR,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [adminAddr, MERKLE_ADDR],
    query: { enabled: parsedWei > 0n },
  });
  const currentAllowance = (allowance as bigint | undefined) ?? 0n;

  const waitForTx = async (hash: `0x${string}`, then: () => void) => {
    setTxHash(hash);
    setWaiting(true);
    try {
      await publicClient!.waitForTransactionReceipt({ hash, timeout: 90_000 });
      then();
    } catch {
      setMsg('Confirmation timed out — check PulseScan to confirm.');
      then();
    } finally {
      setWaiting(false);
      setTxHash(null);
    }
  };

  const handleBegin = () => {
    if (parsedWei === 0n) { setMsg('Enter a valid MORBIUS amount'); return; }
    setMsg('');
    setStep(currentAllowance >= parsedWei ? 'deposit' : 'approve');
  };

  const handleApprove = async () => {
    setMsg('');
    try {
      const hash = await writeContractAsync({
        address: TOKEN_ADDR,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [MERKLE_ADDR, MAX_UINT256],
        ...getGas(),
        chain: pulsechain,
        account: adminAddr,
      });
      await waitForTx(hash, () => {
        refetchAllowance();
        setStep('deposit');
        setMsg('✓ Approved');
      });
    } catch (e: any) {
      setMsg(e?.shortMessage || e?.message || 'Approval failed');
    }
  };

  const handleDeposit = async () => {
    setMsg('');
    try {
      const hash = await writeContractAsync({
        address: MERKLE_ADDR,
        abi: merkleClaimMorbiusAbi,
        functionName: 'depositRewards',
        args: [parsedWei],
        ...getGas(),
        chain: pulsechain,
        account: adminAddr,
      });
      await waitForTx(hash, () => {
        setStep('done');
        setMsg(`✓ Deposited ${fmtMorbius(parsedWei.toString())} MORBIUS into the holder claim contract`);
        setAmountInput('');
      });
    } catch (e: any) {
      setMsg(e?.shortMessage || e?.message || 'Deposit failed');
    }
  };

  const reset = () => { setStep('idle'); setMsg(''); setTxHash(null); };

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Deposit via contract (approve + depositRewards)</p>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number"
          min="0"
          step="any"
          placeholder="Amount in MORBIUS"
          value={amountInput}
          onChange={(e) => { setAmountInput(e.target.value); reset(); }}
          disabled={waiting}
          className="h-8 w-48 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
        />

        {step === 'idle' && (
          <Button
            size="sm"
            onClick={handleBegin}
            disabled={parsedWei === 0n || waiting}
            className="h-8 bg-cyan-700 hover:bg-cyan-600 text-white text-xs"
          >
            <Coins className="w-3 h-3 mr-1" />
            Deposit MORBIUS
          </Button>
        )}

        {step === 'approve' && (
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={waiting}
            className="h-8 bg-yellow-600 hover:bg-yellow-500 text-white text-xs"
          >
            {waiting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <WalletIcon size={12} className="mr-1" />}
            Step 1: Approve MORBIUS
          </Button>
        )}

        {step === 'deposit' && (
          <Button
            size="sm"
            onClick={handleDeposit}
            disabled={waiting}
            className="h-8 bg-cyan-600 hover:bg-cyan-500 text-white text-xs"
          >
            {waiting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Coins className="w-3 h-3 mr-1" />}
            Step 2: Deposit {fmtMorbius(parsedWei.toString())} MORBIUS
          </Button>
        )}

        {step === 'done' && (
          <Button size="sm" onClick={reset} variant="outline" className="h-8 text-xs border-slate-600">
            Deposit another
          </Button>
        )}

        {txHash && (
          <a
            href={`https://scan.pulsechain.com/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
          >
            Tx <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {msg && (
        <p className={`text-xs px-3 py-1.5 rounded border ${
          msg.startsWith('✓')
            ? 'text-emerald-400 bg-emerald-950/20 border-emerald-500/20'
            : 'text-red-400 bg-red-950/20 border-red-500/20'
        }`}>{msg}</p>
      )}
    </div>
  );
}

function StandaloneLPTransferButton({ adminAddr }: { adminAddr: `0x${string}` }) {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const getGas = useGasParams();

  const [amountInput, setAmountInput] = useState('');
  const [step, setStep] = useState<'idle' | 'approve' | 'transfer' | 'done'>('idle');
  const [waiting, setWaiting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const parsedWei = (() => {
    const n = parseFloat(amountInput);
    if (!amountInput || isNaN(n) || n <= 0) return 0n;
    return BigInt(Math.round(n * 1e9)) * BigInt(1e9);
  })();

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: TOKEN_ADDR,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [adminAddr, MERKLE_LP_ADDR],
    query: { enabled: parsedWei > 0n && Boolean(MERKLE_LP_ADDR) },
  });
  const currentAllowance = (allowance as bigint | undefined) ?? 0n;

  const waitForTx = async (hash: `0x${string}`, then: () => void) => {
    setTxHash(hash);
    setWaiting(true);
    try {
      await publicClient!.waitForTransactionReceipt({ hash, timeout: 90_000 });
      then();
    } catch {
      setMsg('Confirmation timed out — check PulseScan to confirm.');
      then();
    } finally {
      setWaiting(false);
      setTxHash(null);
    }
  };

  const reset = () => { setStep('idle'); setMsg(''); setTxHash(null); };

  const handleBegin = () => {
    if (parsedWei === 0n) { setMsg('Enter a valid MORBIUS amount'); return; }
    setMsg('');
    setStep(currentAllowance >= parsedWei ? 'transfer' : 'approve');
  };

  const handleApprove = async () => {
    setMsg('');
    try {
      const hash = await writeContractAsync({
        address: TOKEN_ADDR,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [MERKLE_LP_ADDR, MAX_UINT256],
        ...getGas(),
        chain: pulsechain,
        account: adminAddr,
      });
      await waitForTx(hash, () => {
        refetchAllowance();
        setStep('transfer');
        setMsg('✓ Approved');
      });
    } catch (e: any) {
      setMsg(e?.shortMessage || e?.message || 'Approval failed');
    }
  };

  const handleTransfer = async () => {
    setMsg('');
    try {
      const hash = await writeContractAsync({
        address: TOKEN_ADDR,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [MERKLE_LP_ADDR, parsedWei],
        ...getGas(),
        chain: pulsechain,
        account: adminAddr,
      });
      await waitForTx(hash, () => {
        setStep('done');
        setMsg(`✓ Sent ${fmtMorbius(parsedWei.toString())} MORBIUS to LP claim contract`);
        setAmountInput('');
      });
    } catch (e: any) {
      setMsg(e?.shortMessage || e?.message || 'Transfer failed');
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Approve + transfer to contract</p>
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="number"
          min="0"
          step="any"
          placeholder="Amount in MORBIUS"
          value={amountInput}
          onChange={(e) => { setAmountInput(e.target.value); reset(); }}
          disabled={waiting}
          className="h-8 w-48 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 focus:outline-none focus:border-blue-500 disabled:opacity-50"
        />
        {step === 'idle' && (
          <Button size="sm" onClick={handleBegin} disabled={parsedWei === 0n || waiting} className="h-8 bg-blue-700 hover:bg-blue-600 text-white text-xs">
            <Coins className="w-3 h-3 mr-1" />
            Send MORBIUS
          </Button>
        )}
        {step === 'approve' && (
          <Button size="sm" onClick={handleApprove} disabled={waiting} className="h-8 bg-yellow-600 hover:bg-yellow-500 text-white text-xs">
            {waiting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <WalletIcon size={12} className="mr-1" />}
            Step 1: Approve
          </Button>
        )}
        {step === 'transfer' && (
          <Button size="sm" onClick={handleTransfer} disabled={waiting} className="h-8 bg-blue-600 hover:bg-blue-500 text-white text-xs">
            {waiting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Coins className="w-3 h-3 mr-1" />}
            Step 2: Send {fmtMorbius(parsedWei.toString())}
          </Button>
        )}
        {step === 'done' && (
          <Button size="sm" onClick={reset} variant="outline" className="h-8 text-xs border-slate-600">Send another</Button>
        )}
        {txHash && (
          <a href={`https://scan.pulsechain.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1">
            Tx <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
      {msg && (
        <p className={`text-xs px-3 py-1.5 rounded border ${msg.startsWith('✓') ? 'text-emerald-400 bg-emerald-950/20 border-emerald-500/20' : 'text-red-400 bg-red-950/20 border-red-500/20'}`}>{msg}</p>
      )}
    </div>
  );
}

function EpochFundingPanel({
  adminAddr,
  holderBalanceWei,
}: {
  adminAddr: `0x${string}`;
  holderBalanceWei: bigint;
}) {
  const { data: lpBalance } = useReadContract({
    address: TOKEN_ADDR,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [MERKLE_LP_ADDR],
    query: { enabled: Boolean(MERKLE_LP_ADDR) },
  });
  const lpBalanceWei = (lpBalance as bigint | undefined) ?? 0n;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        Game fees arrive automatically. Use these controls to manually top up the vault before calculating a new epoch.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-emerald-500/20 bg-slate-800/40 px-3 py-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-emerald-400/90 font-semibold">Holder claims</p>
          <a
            href={`https://scan.pulsechain.com/address/${MERKLE_CLAIM_MORBIUS_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-mono text-slate-200 hover:text-cyan-400 break-all flex items-center gap-1"
          >
            {MERKLE_CLAIM_MORBIUS_ADDRESS}
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
          <p className="text-[11px] text-slate-400">
            Balance: <span className="font-mono text-cyan-400">{fmtMorbius(holderBalanceWei.toString())} MORBIUS</span>
          </p>
          <StandaloneDepositButton adminAddr={adminAddr} />
        </div>
        <div className="rounded-lg border border-blue-500/20 bg-slate-800/40 px-3 py-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-blue-400/90 font-semibold">LP drops</p>
          <a
            href={`https://scan.pulsechain.com/address/${MERKLE_CLAIM_LP_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-mono text-slate-200 hover:text-cyan-400 break-all flex items-center gap-1"
          >
            {MERKLE_CLAIM_LP_ADDRESS}
            <ExternalLink className="w-3 h-3 shrink-0" />
          </a>
          <p className="text-[11px] text-slate-400">
            Balance: <span className="font-mono text-blue-400">{fmtMorbius(lpBalanceWei.toString())} MORBIUS</span>
          </p>
          <StandaloneLPTransferButton adminAddr={adminAddr} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminMerkleDropsTab() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const getGas = useGasParams();

  const [epochs, setEpochs] = useState<EpochRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [epochVisibleCount, setEpochVisibleCount] = useState(5);

  const [rewardInputs, setRewardInputs] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [actionMsg, setActionMsg] = useState<Record<number, string>>({});

  const [creating, setCreating] = useState(false);
  const [quickCreating, setQuickCreating] = useState(false);
  const [minThresholdInput, setMinThresholdInput] = useState('1000');

  // ── Settings ────────────────────────────────────────────────────────────────
  const defaultSettings: MerkleSettings = {
    schedule_type: 'manual', schedule_day: '5',
    schedule_hour_utc: '12', schedule_interval: '60',
    default_reward_wei: '0', auto_publish_onchain: 'false',
    countdown_duration: '0',
  };
  const [settings, setSettings] = useState<MerkleSettings>(defaultSettings);
  const [settingsDraft, setSettingsDraft] = useState<MerkleSettings>(defaultSettings);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');

  const [blocklist, setBlocklist] = useState<BlocklistEntry[]>([]);
  const [blocklistLoading, setBlocklistLoading] = useState(false);
  const [blocklistVisibleCount, setBlocklistVisibleCount] = useState(25);
  const [newBlockAddr, setNewBlockAddr] = useState('');
  const [newBlockReason, setNewBlockReason] = useState('');
  const [blocklistBusy, setBlocklistBusy] = useState(false);
  const [lpPairAddresses, setLpPairAddresses] = useState<string[]>([]);
  const [seedBlocklistBusy, setSeedBlocklistBusy] = useState(false);
  const [syncFromLpBlocklistBusy, setSyncFromLpBlocklistBusy] = useState(false);

  // ── Operator management ────────────────────────────────────────────────────
  const [newOperatorAddr, setNewOperatorAddr] = useState('');
  const [operatorBusy, setOperatorBusy] = useState(false);
  const [operatorMsg, setOperatorMsg] = useState('');
  const [currentOperators, setCurrentOperators] = useState<string[]>([]);
  const [operatorsLoading, setOperatorsLoading] = useState(false);

  // Live MORBIUS balance in the holder claim contract (same as MerkleClaimsPanel "Reward Pool")
  const { data: holderContractBalance } = useReadContract({
    address: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [MERKLE_CLAIM_MORBIUS_ADDRESS as `0x${string}`],
    query: { enabled: Boolean(MERKLE_CLAIM_MORBIUS_ADDRESS) },
  });
  const holderContractBalanceWei = (holderContractBalance as bigint | undefined) ?? 0n;

  // ── Health data (contract balance vs DB owed, per-epoch breakdown) ──────────
  interface HealthRow { epoch_number: number; unclaimed_holders: string; unclaimed_morbius: string; claimed: string; superseded: string; }
  interface HealthData { contractBalanceWei: string; owedWei: string; availableWei: string; byEpoch: HealthRow[]; }
  const [holderHealth, setHolderHealth] = useState<HealthData | null>(null);
  const [lpHealth, setLpHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [showHolderEpochBreakdown, setShowHolderEpochBreakdown] = useState(false);
  const [showLpEpochBreakdown, setShowLpEpochBreakdown] = useState(false);

  const adminHeaders = useCallback(
    () => address ? { 'x-admin-wallet': address, 'Content-Type': 'application/json' } : {},
    [address],
  );

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const [h, l] = await Promise.all([
        fetch('/api/admin/merkle/health').then(r => r.json()),
        fetch('/api/admin/merkle-lp/health').then(r => r.json()),
      ]);
      setHolderHealth(h);
      setLpHealth(l);
    } catch { /* non-critical */ }
    finally { setHealthLoading(false); }
  }, []);

  // ── Snapshot holder viewer (per-epoch, from DB) ─────────────────────────────
  const [snapshotData, setSnapshotData] = useState<Record<number, { rows: SnapshotRow[]; total: number; page: number; loading: boolean }>>({});
  const [claimsData, setClaimsData] = useState<Record<number, { rows: ClaimRow[]; total: number; page: number; loading: boolean }>>({});
  const [epochDetailTab, setEpochDetailTab] = useState<Record<number, EpochDetailTab>>({});

  const fetchSnapshotPage = useCallback(async (epochId: number, page = 1) => {
    setSnapshotData((prev) => ({
      ...prev,
      [epochId]: { rows: prev[epochId]?.rows ?? [], total: prev[epochId]?.total ?? 0, page, loading: true },
    }));
    try {
      const res = await fetch(`/api/admin/merkle/epoch/${epochId}/snapshot?page=${page}&pageSize=50`, {
        headers: adminHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load snapshot');
      setSnapshotData((prev) => ({
        ...prev,
        [epochId]: { rows: data.rows ?? [], total: data.total ?? 0, page, loading: false },
      }));
    } catch {
      setSnapshotData((prev) => ({
        ...prev,
        [epochId]: { ...prev[epochId], loading: false },
      }));
    }
  }, [adminHeaders]);

  const fetchClaimsPage = useCallback(async (epochId: number, page = 1) => {
    setClaimsData((prev) => ({
      ...prev,
      [epochId]: { rows: prev[epochId]?.rows ?? [], total: prev[epochId]?.total ?? 0, page, loading: true },
    }));
    try {
      const res = await fetch(`/api/admin/merkle/epoch/${epochId}/claims?page=${page}&pageSize=50`, {
        headers: adminHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load claims');
      setClaimsData((prev) => ({
        ...prev,
        [epochId]: { rows: data.rows ?? [], total: data.total ?? 0, page, loading: false },
      }));
    } catch {
      setClaimsData((prev) => ({
        ...prev,
        [epochId]: { ...prev[epochId], loading: false },
      }));
    }
  }, [adminHeaders]);

  const setEpochTab = useCallback((epochId: number, tab: EpochDetailTab) => {
    setEpochDetailTab((prev) => ({ ...prev, [epochId]: tab }));
    if (tab === 'holders') fetchSnapshotPage(epochId, 1);
    if (tab === 'claims') fetchClaimsPage(epochId, 1);
  }, [fetchSnapshotPage, fetchClaimsPage]);

  // ── Fetch epochs ─────────────────────────────────────────────────────────

  const fetchEpochs = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/merkle/epochs', { headers: adminHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEpochs(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load epochs');
    } finally {
      setLoading(false);
    }
  }, [address, adminHeaders]);

  useEffect(() => { fetchEpochs(); fetchHealth(); }, [fetchEpochs, fetchHealth]);

  const fetchSettings = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch('/api/admin/merkle/settings', { headers: adminHeaders() });
      if (res.ok) {
        const data = await res.json() as MerkleSettings;
        setSettings(data);
        setSettingsDraft(data);
      }
    } catch { /* non-critical */ }
  }, [address, adminHeaders]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSaveSettings = async () => {
    setSettingsBusy(true);
    setSettingsMsg('');
    try {
      const res = await fetch('/api/admin/merkle/settings', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify(settingsDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSettings(data as MerkleSettings);
      setSettingsDraft(data as MerkleSettings);
      setSettingsMsg('✓ Settings saved');
    } catch (e) {
      setSettingsMsg(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSettingsBusy(false);
    }
  };

  // Quick Create: snapshot + auto-calculate in one click (requires default_reward_wei > 0)
  const handleQuickCreate = async () => {
    setQuickCreating(true);
    setError(null);
    try {
      // 1. Create epoch (triggers snapshot)
      const createRes = await fetch('/api/admin/merkle/epoch/create', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ minHoldingThreshold: Number(minThresholdInput) || 1000 }),
      });
      const epochData = await createRes.json();
      if (!createRes.ok) throw new Error(epochData.error || `HTTP ${createRes.status}`);
      const epochId = epochData.id;

      // 2. Auto-calculate with default reward
      const calcRes = await fetch(`/api/admin/merkle/epoch/${epochId}/calculate`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ newRewardAmount: settings.default_reward_wei }),
      });
      const calcData = await calcRes.json();
      if (!calcRes.ok) throw new Error(calcData.error || `HTTP ${calcRes.status}`);

      await fetchEpochs();
      setExpandedId(epochId); // auto-expand the new epoch
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Quick create failed');
    } finally {
      setQuickCreating(false);
    }
  };

  const fetchBlocklist = useCallback(async () => {
    if (!address) return;
    setBlocklistLoading(true);
    try {
      const res = await fetch('/api/admin/merkle/blocklist', { headers: adminHeaders() });
      const data = await res.json();
      setBlocklist(Array.isArray(data) ? data : []);
    } catch { /* non-critical */ } finally {
      setBlocklistLoading(false);
    }
  }, [address, adminHeaders]);

  const apiBase = getApiUrlOptional() ?? '';
  const fetchLpPairs = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`${apiBase}/api/admin/merkle-lp/pairs`, { headers: adminHeaders() });
      const data = await res.json();
      const pairs = Array.isArray(data) ? data : [];
      setLpPairAddresses(pairs.map((p: { pair_address: string }) => p.pair_address?.toLowerCase()).filter(Boolean));
    } catch {
      setLpPairAddresses([]);
    }
  }, [address, adminHeaders, apiBase]);

  useEffect(() => { fetchBlocklist(); }, [fetchBlocklist]);
  useEffect(() => { fetchLpPairs(); }, [fetchLpPairs]);

  const handleSeedBlocklist = useCallback(async () => {
    if (!address) return;
    setSeedBlocklistBusy(true);
    setError(null);
    try {
      const existingSet = new Set(blocklist.map((e) => e.address.toLowerCase()));
      const toAdd: string[] = [];
      lpPairAddresses.forEach((addr) => {
        if (addr && !existingSet.has(addr)) {
          toAdd.push(addr);
          existingSet.add(addr);
        }
      });
      for (let i = 0; i < toAdd.length; i++) {
        const addr = toAdd[i];
        const res = await fetch('/api/admin/merkle/blocklist', {
          method: 'POST',
          headers: adminHeaders(),
          body: JSON.stringify({
            address: addr.startsWith('0x') ? addr : `0x${addr}`,
            reason: 'LP pair (merkle-lp)',
          }),
        });
        if (!res.ok) throw new Error(`Failed to add ${addr}`);
      }
      await fetchBlocklist();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to seed blocklist');
    } finally {
      setSeedBlocklistBusy(false);
    }
  }, [address, adminHeaders, blocklist, lpPairAddresses, fetchBlocklist]);

  const handleSyncFromLpBlocklist = useCallback(async () => {
    if (!address) return;
    setSyncFromLpBlocklistBusy(true);
    setError(null);
    const apiBaseUrl = getApiUrlOptional() ?? '';
    try {
      const lpRes = await fetch(`${apiBaseUrl}/api/admin/merkle-lp/blocklist`, { headers: adminHeaders() });
      if (!lpRes.ok) throw new Error('Failed to load LP Staking blocklist');
      const lpEntries = (await lpRes.json()) as Array<{ address: string; reason?: string | null }>;
      const existingSet = new Set(blocklist.map((e) => e.address.toLowerCase()));
      const toAdd = lpEntries.filter((e) => e?.address && !existingSet.has(String(e.address).toLowerCase()));
      for (let i = 0; i < toAdd.length; i++) {
        const entry = toAdd[i];
        const addr = entry.address.startsWith('0x') ? entry.address : `0x${entry.address}`;
        const res = await fetch('/api/admin/merkle/blocklist', {
          method: 'POST',
          headers: adminHeaders(),
          body: JSON.stringify({
            address: addr,
            reason: entry.reason?.trim() || 'From LP Staking blocklist',
          }),
        });
        if (!res.ok) throw new Error(`Failed to add ${addr}`);
        existingSet.add(addr.toLowerCase());
      }
      await fetchBlocklist();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to sync from LP Staking blocklist');
    } finally {
      setSyncFromLpBlocklistBusy(false);
    }
  }, [address, adminHeaders, blocklist, fetchBlocklist]);

  // ── Create epoch ─────────────────────────────────────────────────────────

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/merkle/epoch/create', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ minHoldingThreshold: Number(minThresholdInput) || 1000 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // Auto-fill default reward if configured
      if (settings.default_reward_wei !== '0' && BigInt(settings.default_reward_wei || '0') > 0n) {
        const defaultMorbius = formatEther(BigInt(settings.default_reward_wei));
        setRewardInputs((p) => ({ ...p, [data.id]: defaultMorbius }));
      }
      await fetchEpochs();
      setExpandedId(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create epoch');
    } finally {
      setCreating(false);
    }
  };

  // ── Per-epoch off-chain actions ───────────────────────────────────────────

  const setEpochBusy = (id: number, val: boolean) => setBusy((p) => ({ ...p, [id]: val }));
  const setEpochMsg  = (id: number, msg: string)  => setActionMsg((p) => ({ ...p, [id]: msg }));

  const handleSnapshot = async (epochId: number) => {
    setEpochBusy(epochId, true); setEpochMsg(epochId, '');
    try {
      const res = await fetch(`/api/admin/merkle/epoch/${epochId}/snapshot`, { method: 'POST', headers: adminHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEpochMsg(epochId, `✓ Snapshot: ${data.total_holders ?? '?'} holders`);
      await fetchEpochs();
    } catch (e) {
      setEpochMsg(epochId, e instanceof Error ? e.message : 'Failed');
    } finally {
      setEpochBusy(epochId, false);
    }
  };

  const handleCalculate = async (epochId: number) => {
    const raw = rewardInputs[epochId]?.trim();
    if (!raw) { setEpochMsg(epochId, 'Enter new MORBIUS amount first'); return; }
    const weiAmount = (BigInt(Math.round(Number(raw) * 1e9)) * BigInt(1e9)).toString();
    setEpochBusy(epochId, true); setEpochMsg(epochId, '');
    try {
      const res = await fetch(`/api/admin/merkle/epoch/${epochId}/calculate`, {
        method: 'POST', headers: adminHeaders(),
        body: JSON.stringify({ newRewardAmount: weiAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const rollup = Number(data.rollup_amount ?? '0');
      const rollupMsg = rollup > 0 ? ` + ${fmtMorbius(String(rollup))} rolled up` : '';
      setEpochMsg(epochId, `✓ Rewards calculated${rollupMsg}`);
      await fetchEpochs();
    } catch (e) {
      setEpochMsg(epochId, e instanceof Error ? e.message : 'Failed');
    } finally {
      setEpochBusy(epochId, false);
    }
  };

  const handleFinalize = async (epochId: number) => {
    setEpochBusy(epochId, true); setEpochMsg(epochId, '');
    try {
      const res = await fetch(`/api/admin/merkle/epoch/${epochId}/finalize`, { method: 'POST', headers: adminHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEpochMsg(epochId, `✓ Root: ${data.root?.slice(0, 18)}…`);
      await fetchEpochs();
    } catch (e) {
      setEpochMsg(epochId, e instanceof Error ? e.message : 'Failed');
    } finally {
      setEpochBusy(epochId, false);
    }
  };

  // Called by OnchainActions after on-chain publish completes
  const handlePublished = useCallback(async (epochId: number) => {
    await fetchEpochs();
  }, [fetchEpochs]);

  // Manual publish — for when setEpochRoot succeeded on-chain but auto-publish failed
  const handleManualPublish = async (epochId: number) => {
    setEpochBusy(epochId, true); setEpochMsg(epochId, '');
    try {
      const res = await fetch(`/api/admin/merkle/epoch/${epochId}/publish`, {
        method: 'POST', headers: adminHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEpochMsg(epochId, '✓ Epoch marked as published — users can now claim');
      await fetchEpochs();
    } catch (e) {
      setEpochMsg(epochId, e instanceof Error ? e.message : 'Failed to publish');
    } finally {
      setEpochBusy(epochId, false);
    }
  };

  // ── Blocklist ─────────────────────────────────────────────────────────────

  const handleAddToBlocklist = async () => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(newBlockAddr.trim())) { setError('Invalid address'); return; }
    setBlocklistBusy(true);
    try {
      const res = await fetch('/api/admin/merkle/blocklist', {
        method: 'POST', headers: adminHeaders(),
        body: JSON.stringify({ address: newBlockAddr.trim(), reason: newBlockReason.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewBlockAddr(''); setNewBlockReason('');
      await fetchBlocklist();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add');
    } finally {
      setBlocklistBusy(false);
    }
  };

  const handleRemoveFromBlocklist = async (addr: string) => {
    setBlocklistBusy(true);
    try {
      await fetch(`/api/admin/merkle/blocklist/${addr}`, { method: 'DELETE', headers: adminHeaders() });
      await fetchBlocklist();
    } catch { /* non-critical */ } finally {
      setBlocklistBusy(false);
    }
  };

  // ── Operator management handlers ─────────────────────────────────────────

  const fetchCurrentOperators = useCallback(async () => {
    if (!publicClient) return;
    setOperatorsLoading(true);
    try {
      const [addedLogs, removedLogs] = await Promise.all([
        publicClient.getLogs({
          address: MERKLE_ADDR,
          event: parseAbiItem('event OperatorAdded(address indexed operator)'),
          fromBlock: 0n,
          toBlock: 'latest',
        }),
        publicClient.getLogs({
          address: MERKLE_ADDR,
          event: parseAbiItem('event OperatorRemoved(address indexed operator)'),
          fromBlock: 0n,
          toBlock: 'latest',
        }),
      ]);
      const added = new Set(addedLogs.map((l) => (l.args.operator as string)?.toLowerCase()).filter(Boolean));
      const removed = new Set(removedLogs.map((l) => (l.args.operator as string)?.toLowerCase()).filter(Boolean));
      setCurrentOperators([...added].filter((a) => !removed.has(a)));
    } catch {
      setCurrentOperators([]);
    } finally {
      setOperatorsLoading(false);
    }
  }, [publicClient]);

  useEffect(() => { fetchCurrentOperators(); }, [fetchCurrentOperators]);

  const handleAddOperator = async () => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(newOperatorAddr.trim())) {
      setOperatorMsg('Invalid address');
      return;
    }
    setOperatorBusy(true);
    setOperatorMsg('');
    try {
      const hash = await writeContractAsync({
        address: MERKLE_ADDR,
        abi: merkleClaimMorbiusAbi,
        functionName: 'addOperator',
        args: [newOperatorAddr.trim() as `0x${string}`],
        ...getGas(),
        chain: pulsechain,
        account: address!,
      });
      setOperatorMsg(`✓ Operator added — tx: ${hash.slice(0, 14)}…`);
      setNewOperatorAddr('');
      setTimeout(fetchCurrentOperators, 3000);
    } catch (e: any) {
      setOperatorMsg(e?.shortMessage || e?.message || 'Failed to add operator');
    } finally {
      setOperatorBusy(false);
    }
  };

  const handleRemoveOperator = async (addr: string) => {
    setOperatorBusy(true);
    setOperatorMsg('');
    try {
      const hash = await writeContractAsync({
        address: MERKLE_ADDR,
        abi: merkleClaimMorbiusAbi,
        functionName: 'removeOperator',
        args: [addr as `0x${string}`],
        ...getGas(),
        chain: pulsechain,
        account: address!,
      });
      setOperatorMsg(`✓ Operator removed — tx: ${hash.slice(0, 14)}…`);
      setTimeout(fetchCurrentOperators, 3000);
    } catch (e: any) {
      setOperatorMsg(e?.shortMessage || e?.message || 'Failed to remove operator');
    } finally {
      setOperatorBusy(false);
    }
  };

  // ── Revoke epoch on-chain ──────────────────────────────────────────────────

  const handleRevokeEpoch = async (epoch: EpochRecord) => {
    if (!confirm(`Revoke Epoch #${epoch.epoch_number} on-chain?\n\nThis clears the Merkle root so it can be re-set. Only works if nobody has claimed yet.\n\nThe epoch will be reset to "finalized" status in the database so you can re-publish.`)) return;
    setEpochBusy(epoch.id, true);
    setEpochMsg(epoch.id, '');
    try {
      const hash = await writeContractAsync({
        address: MERKLE_ADDR,
        abi: merkleClaimMorbiusAbi,
        functionName: 'revokeEpoch',
        args: [BigInt(epoch.epoch_number)],
        ...getGas(),
        chain: pulsechain,
        account: address!,
      });
      setEpochMsg(epoch.id, `Revoking on-chain… tx: ${hash.slice(0, 14)}…`);
      await publicClient!.waitForTransactionReceipt({ hash });
      // Reset status to finalized in the backend so admin can re-publish
      try {
        await fetch(`/api/admin/merkle/epoch/${epoch.id}/revoke`, {
          method: 'POST',
          headers: adminHeaders(),
        });
      } catch { /* non-critical — manual refresh will pick it up */ }
      setEpochMsg(epoch.id, `✓ Epoch #${epoch.epoch_number} revoked on-chain — root cleared. You can now re-set the root.`);
      await fetchEpochs();
    } catch (e: any) {
      setEpochMsg(epoch.id, e?.shortMessage || e?.message || 'Revoke failed');
    } finally {
      setEpochBusy(epoch.id, false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  // Compute derived values for settings UI
  const nextEpoch = nextEpochDate(settingsDraft);
  const defaultRewardMorbius = settings.default_reward_wei !== '0' && BigInt(settings.default_reward_wei || '0') > 0n
    ? formatEther(BigInt(settings.default_reward_wei))
    : null;

  const latestPublishedEpochId = epochs.find((e) => e.status === 'published')?.id ?? null;

  return (
    <div className="space-y-4">

      {/* ── Contract Health Panel ── */}
      <Card className="bg-slate-900/80 border-slate-700/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Contract Health
            <button onClick={fetchHealth} className="ml-auto text-slate-400 hover:text-cyan-400" title="Refresh">
              <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          {[
            { label: 'Holder Claims (MORBIUS)', health: holderHealth, showBreakdown: showHolderEpochBreakdown, setShow: setShowHolderEpochBreakdown },
            { label: 'LP Drops', health: lpHealth, showBreakdown: showLpEpochBreakdown, setShow: setShowLpEpochBreakdown },
          ].map(({ label, health, showBreakdown, setShow }) => {
            if (!health) return <div key={label} className="text-xs text-slate-500">{label}: loading…</div>;
            const contract = Number(health.contractBalanceWei) / 1e18;
            const owed = Number(health.owedWei) / 1e18;
            const available = Number(health.availableWei) / 1e18;
            const isHealthy = available >= 0 && contract >= owed;
            const strandedEpochs = health.byEpoch.filter(e => Number(e.unclaimed_morbius) > 0 && e.epoch_number < Math.max(...health.byEpoch.map(x => x.epoch_number)));
            return (
              <div key={label} className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-300">{label}</p>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isHealthy ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {isHealthy ? 'Healthy' : 'Underfunded'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide">Contract Balance</p>
                    <p className="text-xs font-mono text-cyan-400">{contract.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide">DB Owed</p>
                    <p className="text-xs font-mono text-yellow-400">{owed.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide">Available Next Epoch</p>
                    <p className={`text-xs font-mono ${available > 0 ? 'text-green-400' : 'text-red-400'}`}>{available.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                  </div>
                </div>
                {strandedEpochs.length > 0 && (
                  <p className="text-[10px] text-yellow-400/80">
                    ⚠ {strandedEpochs.length} older epoch{strandedEpochs.length > 1 ? 's' : ''} have unclaimed amounts not yet rolled up
                  </p>
                )}
                <button onClick={() => setShow(!showBreakdown)} className="text-[10px] text-slate-400 hover:text-cyan-400 flex items-center gap-1">
                  {showBreakdown ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  {showBreakdown ? 'Hide' : 'Show'} per-epoch breakdown
                </button>
                {showBreakdown && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px] font-mono">
                      <thead>
                        <tr className="text-slate-500 border-b border-slate-700">
                          <th className="text-left py-1">Epoch</th>
                          <th className="text-right py-1">Unclaimed MORBIUS</th>
                          <th className="text-right py-1">Holders</th>
                          <th className="text-right py-1">Claimed</th>
                          <th className="text-right py-1">Superseded</th>
                        </tr>
                      </thead>
                      <tbody>
                        {health.byEpoch.filter(e => Number(e.unclaimed_morbius) > 0 || Number(e.claimed) > 0).map(e => (
                          <tr key={e.epoch_number} className="border-b border-slate-800 hover:bg-slate-700/20">
                            <td className="py-1 text-slate-300">#{e.epoch_number}</td>
                            <td className={`py-1 text-right ${Number(e.unclaimed_morbius) > 0 ? 'text-yellow-400' : 'text-slate-500'}`}>
                              {(Number(e.unclaimed_morbius) / 1e18).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-1 text-right text-slate-400">{e.unclaimed_holders}</td>
                            <td className="py-1 text-right text-green-400/70">{e.claimed}</td>
                            <td className="py-1 text-right text-slate-500">{e.superseded}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Schedule & Settings Card ── */}
      <Card className="bg-slate-900/80 border-slate-700/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-400" />
            Drop Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">

          {/* Snapshot explainer */}
          <div className="flex gap-2 rounded border border-slate-700/40 bg-slate-800/30 px-3 py-2.5 text-[11px] text-slate-400">
            <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
            <span>
              <span className="text-slate-300 font-medium">How snapshots work: </span>
              At epoch creation time, every wallet holding ≥ min threshold MORBIUS on PulseChain is captured via the blockchain explorer API. Rewards are split <span className="text-white">proportionally</span> to each wallet's share of total eligible MORBIUS. Burn addresses, LP pairs, and all game/staking contracts are excluded automatically.
            </span>
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Auto-Schedule</p>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={settingsDraft.schedule_type}
                onChange={(e) => setSettingsDraft((p) => ({ ...p, schedule_type: e.target.value as MerkleSettings['schedule_type'] }))}
                className="h-8 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 focus:outline-none focus:border-emerald-500"
              >
                <option value="manual">Manual only</option>
                <option value="interval_minutes">Every N minutes</option>
                <option value="interval_hours">Every N hours</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
              </select>

              {/* Interval input for interval_minutes / interval_hours */}
              {(settingsDraft.schedule_type === 'interval_minutes' || settingsDraft.schedule_type === 'interval_hours') && (
                <>
                  <span className="text-xs text-slate-400">every</span>
                  <input
                    type="number"
                    min="1"
                    max={settingsDraft.schedule_type === 'interval_minutes' ? '1440' : '168'}
                    value={settingsDraft.schedule_interval || ''}
                    onChange={(e) => setSettingsDraft((p) => ({ ...p, schedule_interval: e.target.value }))}
                    placeholder={settingsDraft.schedule_type === 'interval_minutes' ? 'e.g. 15, 30, 60' : 'e.g. 1, 2, 6'}
                    className="h-8 w-28 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-xs text-slate-400">
                    {settingsDraft.schedule_type === 'interval_minutes' ? 'min' : 'hr'}
                  </span>
                </>
              )}

              {/* Day/hour selectors for weekly/biweekly/monthly */}
              {(settingsDraft.schedule_type === 'weekly' || settingsDraft.schedule_type === 'biweekly' || settingsDraft.schedule_type === 'monthly') && (
                <>
                  {settingsDraft.schedule_type !== 'monthly' ? (
                    <select
                      value={settingsDraft.schedule_day}
                      onChange={(e) => setSettingsDraft((p) => ({ ...p, schedule_day: e.target.value }))}
                      className="h-8 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 focus:outline-none focus:border-emerald-500"
                    >
                      {DAY_NAMES.map((d, i) => (
                        <option key={d} value={String(i)}>{d}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number" min="1" max="28"
                      value={settingsDraft.schedule_day}
                      onChange={(e) => setSettingsDraft((p) => ({ ...p, schedule_day: e.target.value }))}
                      placeholder="Day 1-28"
                      className="h-8 w-20 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 font-mono focus:outline-none focus:border-emerald-500"
                    />
                  )}
                  <select
                    value={settingsDraft.schedule_hour_utc}
                    onChange={(e) => setSettingsDraft((p) => ({ ...p, schedule_hour_utc: e.target.value }))}
                    className="h-8 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 focus:outline-none focus:border-emerald-500"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={String(i)}>{String(i).padStart(2, '0')}:00 UTC</option>
                    ))}
                  </select>
                </>
              )}
            </div>

            {/* Next epoch preview */}
            {nextEpoch && (
              <p className="text-[11px] text-emerald-400/80">
                Next auto-epoch: {nextEpoch.toUTCString().replace(' GMT', ' UTC')}
              </p>
            )}
            {settingsDraft.schedule_type === 'manual' && (
              <p className="text-[11px] text-slate-500">Auto-schedule is off — epochs are created manually only.</p>
            )}
            {(settingsDraft.schedule_type === 'interval_minutes' || settingsDraft.schedule_type === 'interval_hours') && (
              <p className="text-[11px] text-slate-400">
                Drops every {settingsDraft.schedule_interval || '?'} {settingsDraft.schedule_type === 'interval_minutes' ? 'minute(s)' : 'hour(s)'} — aligned to clock intervals.
              </p>
            )}
          </div>

          {/* Default reward */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Reward Amount per Epoch</p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="number" min="0" step="1000"
                placeholder="0 = use contract balance"
                value={settingsDraft.default_reward_wei !== '0' ? Number(formatEther(BigInt(settingsDraft.default_reward_wei || '0'))) : ''}
                onChange={(e) => {
                  const n = Number(e.target.value) || 0;
                  const wei = n > 0 ? (BigInt(Math.round(n * 1e9)) * BigInt(1e9)).toString() : '0';
                  setSettingsDraft((p) => ({ ...p, default_reward_wei: wei }));
                }}
                className="h-8 w-44 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 font-mono focus:outline-none focus:border-emerald-500"
              />
              <span className="text-xs text-slate-500">MORBIUS</span>
              {defaultRewardMorbius && (
                <span className="text-[11px] text-slate-400">({defaultRewardMorbius} MORBIUS / epoch)</span>
              )}
            </div>
            <p className="text-[10px] text-slate-600">
              When <span className="text-slate-400">0</span> (default): each epoch automatically distributes whatever MORBIUS has accumulated in the contract from game fees.
              When non-zero: uses a fixed amount per epoch.
            </p>
          </div>

          {/* Auto-publish on-chain toggle */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Auto-Publish On-Chain</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settingsDraft.auto_publish_onchain === 'true'}
                onChange={(e) => setSettingsDraft((p) => ({ ...p, auto_publish_onchain: e.target.checked ? 'true' : 'false' }))}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-xs text-slate-300">Automatically finalize and publish epochs on-chain via server keeper wallet</span>
            </label>
            <p className="text-[10px] text-slate-600">
              Requires <code className="text-slate-400">MERKLE_KEEPER_PRIVATE_KEY</code> env var and the keeper wallet to be added as an operator on the contract.
              MORBIUS accumulates in the contract from game fees — the keeper wallet only needs PLS for gas to call <code className="text-slate-400">setEpochRoot</code>.
            </p>
            {settingsDraft.auto_publish_onchain === 'true' && settingsDraft.schedule_type === 'manual' && (
              <p className="text-[10px] text-amber-400">Note: Auto-publish only triggers from scheduled cron epochs. Set a schedule above for fully automated drops.</p>
            )}
          </div>

          {/* Countdown timer display */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Claim Page Countdown Timer</p>
            <div className="flex items-center gap-2 flex-wrap">
              {['hh', 'mm', 'ss'].map((unit, i) => {
                const totalSec = parseInt(settingsDraft.countdown_duration || '0', 10);
                const vals = [Math.floor(totalSec / 3600), Math.floor((totalSec % 3600) / 60), totalSec % 60];
                return (
                  <React.Fragment key={unit}>
                    {i > 0 && <span className="text-slate-500 font-bold">:</span>}
                    <input
                      type="number" min="0" max={unit === 'hh' ? '99' : '59'}
                      value={String(vals[i]).padStart(2, '0')}
                      onChange={(e) => {
                        const newVals = [...vals];
                        newVals[i] = Math.max(0, parseInt(e.target.value, 10) || 0);
                        const newTotal = newVals[0] * 3600 + newVals[1] * 60 + newVals[2];
                        setSettingsDraft((p) => ({ ...p, countdown_duration: String(newTotal) }));
                      }}
                      className="h-8 w-14 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 font-mono text-center focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-[10px] text-slate-500 -ml-1">{unit}</span>
                  </React.Fragment>
                );
              })}
              {parseInt(settingsDraft.countdown_duration || '0', 10) > 0 && (
                <button
                  onClick={() => setSettingsDraft((p) => ({ ...p, countdown_duration: '0' }))}
                  className="text-[10px] text-red-400 hover:text-red-300  ml-1"
                >
                  Clear (use auto)
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-600">
              {parseInt(settingsDraft.countdown_duration || '0', 10) > 0
                ? `Claim page shows a repeating ${(() => { const s = parseInt(settingsDraft.countdown_duration, 10); const h = Math.floor(s/3600); const m = Math.floor((s%3600)/60); const sec = s%60; return [h && `${h}h`, m && `${m}m`, sec && `${sec}s`].filter(Boolean).join(' '); })()} countdown timer.`
                : 'Set to 00:00:00 to auto-calculate from schedule, or enter a custom repeating countdown duration.'}
            </p>
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3 flex-wrap">
            <Button size="sm" onClick={handleSaveSettings} disabled={settingsBusy}
              className="h-8 bg-slate-700 hover:bg-slate-600 text-white text-xs">
              {settingsBusy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
              Save Settings
            </Button>
            {settingsMsg && (
              <p className={`text-xs ${settingsMsg.startsWith('✓') ? 'text-emerald-400' : 'text-red-400'}`}>{settingsMsg}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── How It Works / Create ── */}
      <Card className="bg-slate-900/80 border-slate-700/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-slate-200 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-emerald-400" />
              Merkle Drops — Holder Reward Epochs
            </span>
            <button onClick={fetchEpochs} className="p-1.5 rounded border border-slate-600 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {/* Flow diagram */}
          <div className="flex items-center gap-1 flex-wrap text-[10px]">
            {[
              { label: '1. Snapshot',  color: 'text-blue-400   border-blue-400/30',   desc: 'Fetch holder balances from chain' },
              { label: '2. Calculate', color: 'text-purple-400 border-purple-400/30', desc: 'Assign proportional rewards' },
              { label: '3. Finalize',  color: 'text-orange-400 border-orange-400/30', desc: 'Build Merkle tree + store proofs' },
              { label: '4. On-Chain',  color: 'text-cyan-400   border-cyan-400/30',   desc: 'Approve → Deposit → setEpochRoot' },
              { label: '5. Published', color: 'text-emerald-400 border-emerald-400/30', desc: 'Users can claim' },
            ].map((s, i) => (
              <React.Fragment key={s.label}>
                <div className={`px-2 py-1 rounded border ${s.color} bg-slate-800/60`} title={s.desc}>
                  {s.label}
                </div>
                {i < 4 && <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />}
              </React.Fragment>
            ))}
          </div>

          {/* Create new epoch */}
          <div className="flex items-center gap-2 flex-wrap pt-1">
            <input
              type="number"
              value={minThresholdInput}
              onChange={(e) => setMinThresholdInput(e.target.value)}
              placeholder="Min holding"
              className="h-8 w-32 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 font-mono focus:outline-none focus:border-emerald-500"
            />
            <span className="text-xs text-slate-500">min MORBIUS</span>
            <Button size="sm" onClick={handleCreate} disabled={creating || quickCreating}
              className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs">
              {creating
                ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Creating…</>
                : <><Plus className="w-3 h-3 mr-1" /> Create Epoch + Snapshot</>
              }
            </Button>
            {/* Quick Create: snapshot + auto-calculate in one click */}
            {defaultRewardMorbius && (
              <Button size="sm" onClick={handleQuickCreate} disabled={creating || quickCreating}
                className="h-8 bg-violet-600 hover:bg-violet-500 text-white text-xs">
                {quickCreating
                  ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Working…</>
                  : <><Zap className="w-3 h-3 mr-1" /> Quick Create ({fmtMorbius(settings.default_reward_wei)} MORBIUS)</>
                }
              </Button>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-500/20 rounded px-3 py-2">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* ── Epoch List ── */}
      <Card className="bg-slate-900/80 border-slate-700/50">
        <CardContent className="px-4 py-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-emerald-500/40" /></div>
          ) : epochs.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-6">No epochs yet.</p>
          ) : (
            <div className="space-y-2">
              {epochs.slice(0, epochVisibleCount).map((epoch) => {
                const { label, color } = STATUS_LABELS[epoch.status];
                const isExpanded = expandedId === epoch.id;
                const isEpochBusy = busy[epoch.id] ?? false;
                const activeTab = epochDetailTab[epoch.id] ?? 'overview';
                const healthRow = holderHealth?.byEpoch.find((e) => e.epoch_number === epoch.epoch_number);
                const claimedCount = claimsData[epoch.id]?.total ?? Number(healthRow?.claimed ?? 0);

                return (
                  <div key={epoch.id} className="border border-slate-700/40 rounded-lg bg-slate-800/30 overflow-hidden">

                    {/* Row header */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-700/20 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : epoch.id)}
                    >
                      <div className="text-slate-400">
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 flex items-center gap-4 flex-wrap">
                        <span className="text-sm font-semibold text-white">Epoch #{epoch.epoch_number}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${color}`}>{label}</span>
                        {epoch.cron_triggered && (
                          <span className="text-[10px] text-slate-500 border border-slate-600 rounded-full px-2 py-0.5">Auto</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-right text-[11px] text-slate-400 shrink-0">
                        {/* Date: published > snapshot > created */}
                        <span className="text-slate-500 hidden sm:block">
                          {epoch.published_at
                            ? fmtDate(epoch.published_at)
                            : epoch.snapshot_at
                            ? fmtDate(epoch.snapshot_at)
                            : fmtDate(epoch.created_at)}
                        </span>
                        <span>{epoch.total_holders.toLocaleString()} holders</span>
                        {Number(epoch.total_reward_amount) > 0 && (
                          <span className="text-emerald-400 font-mono flex items-center gap-1 flex-wrap">
                            {Number(epoch.rollup_amount) > 0 ? (
                              <>
                                {fmtMorbius(epoch.new_reward_amount || '0')} new
                                <span className="text-slate-500">+</span>
                                <span className="text-amber-400">{fmtMorbius(epoch.rollup_amount)} rollup</span>
                                <span className="text-slate-500">=</span>
                                {fmtMorbius(epoch.total_reward_amount)} total
                              </>
                            ) : (
                              <>{fmtMorbius(epoch.total_reward_amount)} MORBIUS</>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded */}
                    {isExpanded && (
                      <div className="border-t border-slate-700/40 px-4 py-4 space-y-4">

                        <div className="flex flex-wrap gap-1 border-b border-slate-700/50 pb-2">
                          {EPOCH_DETAIL_TABS.map(({ id, label }) => (
                            <button
                              key={id}
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setEpochTab(epoch.id, id); }}
                              className={`px-3 py-1.5 text-[11px] font-semibold rounded-t border-b-2 -mb-[9px] transition-colors ${
                                activeTab === id
                                  ? 'text-cyan-400 border-cyan-400'
                                  : 'text-slate-500 border-transparent hover:text-slate-300'
                              }`}
                            >
                              {label}
                              {id === 'claims' && claimedCount > 0 ? ` (${claimedCount})` : ''}
                            </button>
                          ))}
                        </div>

                        {actionMsg[epoch.id] && (
                          <p className={`text-xs px-3 py-2 rounded border ${
                            actionMsg[epoch.id].startsWith('✓')
                              ? 'text-emerald-400 bg-emerald-950/30 border-emerald-500/20'
                              : 'text-red-400 bg-red-950/30 border-red-500/20'
                          }`}>{actionMsg[epoch.id]}</p>
                        )}

                        {activeTab === 'overview' && (
                          <>
                        {/* Details */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          {[
                            ['Snapshot Block', epoch.snapshot_block ? Number(epoch.snapshot_block).toLocaleString() : '—'],
                            ['Total Balance',  Number(epoch.total_balance) > 0 ? `${fmtMorbius(epoch.total_balance)} MORBIUS` : '—'],
                            ['Min Threshold',  `${Number(epoch.min_holding_threshold).toLocaleString()} MORBIUS`],
                            ['Created',        fmtDate(epoch.created_at)],
                          ].map(([lbl, val]) => (
                            <div key={lbl}>
                              <p className="text-[10px] text-slate-500 uppercase tracking-wider">{lbl}</p>
                              <p className="text-slate-200 font-mono mt-0.5">{val}</p>
                            </div>
                          ))}
                        </div>

                        {/* Reward breakdown (shown once calculated) */}
                        {Number(epoch.total_reward_amount) > 0 && (
                          <>
                            <div className="grid grid-cols-3 gap-3 text-xs bg-slate-800/40 rounded p-3 border border-slate-700/30">
                              <div>
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider">New Rewards</p>
                                <p className="text-blue-300 font-mono mt-0.5">{fmtMorbius(epoch.new_reward_amount || '0')} MORBIUS</p>
                                <p className="text-[9px] text-slate-600 mt-0.5">admin deposits this</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Rolled Up</p>
                                <p className="text-amber-300 font-mono mt-0.5">{fmtMorbius(epoch.rollup_amount || '0')} MORBIUS</p>
                                <p className="text-[9px] text-slate-600 mt-0.5">already in contract</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total Epoch</p>
                                <p className="text-emerald-300 font-mono mt-0.5">{fmtMorbius(epoch.total_reward_amount)} MORBIUS</p>
                                <p className="text-[9px] text-slate-600 mt-0.5">sum of all leaves</p>
                              </div>
                            </div>
                            {latestPublishedEpochId === epoch.id
                              && BigInt(epoch.total_reward_amount) > holderContractBalanceWei && (
                              <div className="rounded border border-amber-500/50 bg-amber-950/20 px-3 py-2 text-[11px] text-amber-200">
                                <strong>Live epoch total ({fmtMorbius(epoch.total_reward_amount)} MORBIUS)</strong> exceeds{' '}
                                <strong>contract balance ({fmtMorbius(holderContractBalanceWei.toString())} MORBIUS)</strong>.
                                Use the <button type="button" className="underline text-amber-100" onClick={() => setEpochTab(epoch.id, 'funding')}>Funding</button> tab to deposit more.
                              </div>
                            )}
                          </>
                        )}

                        {epoch.merkle_root && (
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Merkle Root</p>
                            <p className="text-[10px] text-orange-300 font-mono break-all">{epoch.merkle_root}</p>
                          </div>
                        )}

                        {/* ── Off-chain steps ── */}
                        <div className="flex flex-wrap gap-2">

                          {/* Re-snapshot */}
                          {(epoch.status === 'pending' || epoch.status === 'snapshot') && (
                            <Button size="sm" variant="outline"
                              onClick={() => handleSnapshot(epoch.id)} disabled={isEpochBusy}
                              className="h-7 text-[11px] border-blue-500/30 text-blue-400 hover:bg-blue-950/30">
                              {isEpochBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              <span className="ml-1">Re-Snapshot</span>
                            </Button>
                          )}

                          {/* Calculate */}
                          {epoch.status === 'snapshot' && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <input
                                type="number"
                                placeholder="New MORBIUS to add"
                                value={rewardInputs[epoch.id] ?? ''}
                                onChange={(e) => setRewardInputs((p) => ({ ...p, [epoch.id]: e.target.value }))}
                                className="h-7 w-44 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 font-mono focus:outline-none focus:border-purple-500"
                              />
                              <Button size="sm"
                                onClick={() => handleCalculate(epoch.id)}
                                disabled={isEpochBusy || !rewardInputs[epoch.id]}
                                className="h-7 text-[11px] bg-purple-600 hover:bg-purple-500">
                                {isEpochBusy && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                                Calculate Rewards
                              </Button>
                              <span className="text-[10px] text-slate-500">Unclaimed prior rewards roll up automatically</span>
                            </div>
                          )}

                          {/* Finalize */}
                          {epoch.status === 'calculated' && (
                            <Button size="sm"
                              onClick={() => handleFinalize(epoch.id)} disabled={isEpochBusy}
                              className="h-7 text-[11px] bg-orange-600 hover:bg-orange-500">
                              {isEpochBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <TreePine className="w-3 h-3 mr-1" />}
                              Finalize (Build Merkle Tree)
                            </Button>
                          )}
                        </div>

                        {epoch.status === 'published' && (
                          <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-3 space-y-3">
                            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              Live — users can claim
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <div>
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Published</p>
                                <p className="text-slate-200 font-mono mt-0.5 text-[11px]">{fmtDate(epoch.published_at)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Snapshot Taken</p>
                                <p className="text-slate-200 font-mono mt-0.5 text-[11px]">{fmtDate(epoch.snapshot_at)}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Eligible Holders</p>
                                <p className="text-white font-semibold mt-0.5">{epoch.total_holders.toLocaleString()}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total Distributed</p>
                                <p className="text-emerald-400 font-semibold font-mono mt-0.5">{fmtMorbius(epoch.total_reward_amount)} MORBIUS</p>
                              </div>
                            </div>
                          </div>
                        )}
                          </>
                        )}

                        {activeTab === 'funding' && (
                          address
                            ? <EpochFundingPanel adminAddr={address as `0x${string}`} holderBalanceWei={holderContractBalanceWei} />
                            : <p className="text-xs text-amber-400">Connect your admin wallet to deposit or send MORBIUS.</p>
                        )}

                        {activeTab === 'holders' && epoch.status !== 'pending' && (
                          <div className="rounded-lg border border-slate-700/40 bg-slate-800/20 overflow-hidden">
                            {snapshotData[epoch.id]?.loading && (
                              <div className="flex items-center justify-center py-8 text-slate-500 text-xs">
                                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading holders…
                              </div>
                            )}
                            {!snapshotData[epoch.id]?.loading && (snapshotData[epoch.id]?.rows?.length ?? 0) === 0 && (
                              <p className="text-xs text-slate-500 py-6 text-center">No holder rows loaded.</p>
                            )}
                            {(snapshotData[epoch.id]?.rows?.length ?? 0) > 0 && (
                              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                                <table className="w-full text-[11px]">
                                  <thead className="sticky top-0 bg-slate-800">
                                    <tr className="border-b border-slate-700/50">
                                      <th className="text-left text-slate-500 font-medium py-1.5 px-3">#</th>
                                      <th className="text-left text-slate-500 font-medium py-1.5 px-3">Wallet</th>
                                      <th className="text-right text-slate-500 font-medium py-1.5 px-3">MORBIUS Held</th>
                                      <th className="text-right text-slate-500 font-medium py-1.5 px-3">Claimable</th>
                                      <th className="text-center text-slate-500 font-medium py-1.5 px-3">Proof</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {snapshotData[epoch.id].rows.map((row, idx) => {
                                      const pageOffset = (snapshotData[epoch.id].page - 1) * 50;
                                      const balance = Number(row.morbius_balance) / 1e18;
                                      const reward = Number(row.reward_amount) / 1e18;
                                      return (
                                        <tr key={row.wallet_address} className="border-b border-slate-800/50 hover:bg-slate-700/20">
                                          <td className="py-1.5 px-3 text-slate-600 font-mono">{pageOffset + idx + 1}</td>
                                          <td className="py-1.5 px-3">
                                            <a href={`https://scan.pulsechain.com/address/${row.wallet_address}`} target="_blank" rel="noopener noreferrer" className="font-mono text-slate-300 hover:text-white">
                                              {row.wallet_address}
                                            </a>
                                          </td>
                                          <td className="py-1.5 px-3 text-right font-mono text-slate-400">
                                            {balance >= 1000 ? `${(balance / 1000).toFixed(2)}K` : balance.toFixed(2)}
                                          </td>
                                          <td className="py-1.5 px-3 text-right font-mono text-emerald-400">
                                            {reward > 0 ? (reward >= 1000 ? `${(reward / 1000).toFixed(2)}K` : reward.toFixed(4)) : '—'}
                                          </td>
                                          <td className="py-1.5 px-3 text-center">
                                            {row.merkle_proof ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : '—'}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                                {snapshotData[epoch.id].total > 50 && (
                                  <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/30 bg-slate-800/40">
                                    <span className="text-[10px] text-slate-500">
                                      {((snapshotData[epoch.id].page - 1) * 50) + 1}–{Math.min(snapshotData[epoch.id].page * 50, snapshotData[epoch.id].total)} of {snapshotData[epoch.id].total}
                                    </span>
                                    <div className="flex gap-1">
                                      <Button size="sm" variant="ghost" disabled={snapshotData[epoch.id].page <= 1 || snapshotData[epoch.id].loading} onClick={() => fetchSnapshotPage(epoch.id, snapshotData[epoch.id].page - 1)} className="h-6 px-2 text-[10px]">Prev</Button>
                                      <Button size="sm" variant="ghost" disabled={snapshotData[epoch.id].page * 50 >= snapshotData[epoch.id].total || snapshotData[epoch.id].loading} onClick={() => fetchSnapshotPage(epoch.id, snapshotData[epoch.id].page + 1)} className="h-6 px-2 text-[10px]">Next</Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {activeTab === 'claims' && (
                          <div className="rounded-lg border border-slate-700/40 bg-slate-800/20 overflow-hidden">
                            {claimsData[epoch.id]?.loading && (
                              <div className="flex items-center justify-center py-8 text-slate-500 text-xs">
                                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading claims…
                              </div>
                            )}
                            {!claimsData[epoch.id]?.loading && (claimsData[epoch.id]?.total ?? 0) === 0 && (
                              <p className="text-xs text-slate-500 py-6 text-center">No claims recorded for this epoch in the database.</p>
                            )}
                            {(claimsData[epoch.id]?.rows?.length ?? 0) > 0 && (
                              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                                <table className="w-full text-[11px]">
                                  <thead className="sticky top-0 bg-slate-800">
                                    <tr className="border-b border-slate-700/50">
                                      <th className="text-left text-slate-500 font-medium py-1.5 px-3">Wallet</th>
                                      <th className="text-right text-slate-500 font-medium py-1.5 px-3">Amount</th>
                                      <th className="text-left text-slate-500 font-medium py-1.5 px-3">Claimed at</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {claimsData[epoch.id].rows.map((row) => (
                                      <tr key={`${row.wallet_address}-${row.claimed_at}`} className="border-b border-slate-800/50 hover:bg-slate-700/20">
                                        <td className="py-1.5 px-3">
                                          <a href={`https://scan.pulsechain.com/address/${row.wallet_address}`} target="_blank" rel="noopener noreferrer" className="font-mono text-cyan-400/90 hover:text-cyan-300 text-[10px]">
                                            {row.wallet_address}
                                          </a>
                                        </td>
                                        <td className="py-1.5 px-3 text-right font-mono text-emerald-400">{fmtMorbius(row.reward_amount)}</td>
                                        <td className="py-1.5 px-3 text-slate-400">{fmtDate(row.claimed_at)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {activeTab === 'onchain' && (
                          <>
                        {epoch.status === 'finalized' && address && (
                          <div className="space-y-2">
                            <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-3 space-y-2">
                              <p className="text-[10px] uppercase tracking-wider text-cyan-400/60 font-semibold">
                                On-Chain — wallet required
                              </p>
                              <OnchainActions
                                epoch={epoch}
                                adminAddr={address}
                                onPublished={handlePublished}
                              />
                            </div>
                            {/* Manual publish fallback — for when root is already set on-chain */}
                            <div className="flex items-center gap-3 flex-wrap">
                              <Button
                                size="sm"
                                onClick={() => handleManualPublish(epoch.id)}
                                disabled={isEpochBusy}
                                className="h-7 text-[11px] bg-emerald-700 hover:bg-emerald-600"
                              >
                                {isEpochBusy
                                  ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                  : <CheckCircle2 className="w-3 h-3 mr-1" />
                                }
                                Root already set on-chain? Mark as Published
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleRevokeEpoch(epoch)}
                                disabled={isEpochBusy}
                                className="h-7 text-[11px] bg-red-800 hover:bg-red-700 text-red-200"
                              >
                                {isEpochBusy
                                  ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                  : <XCircle className="w-3 h-3 mr-1" />
                                }
                                Revoke Epoch On-Chain
                              </Button>
                            </div>
                          </div>
                        )}

                        {epoch.status === 'published' && (
                          <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-3 space-y-2">
                            <p className="text-xs text-emerald-400 font-semibold flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4" /> Root is live on-chain
                            </p>
                            <Button
                              size="sm"
                              onClick={() => handleRevokeEpoch(epoch)}
                              disabled={isEpochBusy || !address}
                              className="h-7 text-[11px] bg-red-800 hover:bg-red-700 text-red-200"
                            >
                              {isEpochBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                              Revoke Epoch On-Chain
                            </Button>
                            <p className="text-[10px] text-slate-600">Only works if nobody has claimed yet (owner wallet).</p>
                          </div>
                        )}

                        {!address && (epoch.status === 'finalized' || epoch.status === 'published') && (
                          <p className="text-xs text-amber-400">Connect your admin wallet for on-chain actions.</p>
                        )}

                        {epoch.status !== 'finalized' && epoch.status !== 'published' && (
                          <p className="text-xs text-slate-500">Approve, deposit, and set root here after you finalize the Merkle tree.</p>
                        )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {epochVisibleCount < epochs.length && (
                <div className="flex justify-center pt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEpochVisibleCount((c) => c + 5)}
                    className="h-8 text-xs border-slate-600 text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    Load more ({epochs.length - epochVisibleCount} remaining)
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Blocklist ── */}
      <Card className="bg-slate-900/80 border-slate-700/50">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <ShieldX className="w-4 h-4 text-red-400" />
            Snapshot Exclusion Blocklist
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="rounded border border-emerald-500/20 bg-emerald-950/10 px-3 py-2.5 text-[11px] text-slate-300 space-y-2">
            <p className="font-medium text-emerald-400/90">
              Snapshots exclude addresses in <code className="text-slate-500">merkle_blocklist</code>, all LP pair contracts, and the static protocol list below ({SNAPSHOT_EXCLUSION_SET.size} addresses). Migration 053 + 135 seed most contract rows; use the table to add more.
            </p>
            <p className="text-slate-400">
              The table below is for <span className="text-slate-300">additional</span> exclusions (extra LP pairs, one-off wallets). LP pairs can also be bulk-added with the button below.
            </p>
            <details className="group mt-2">
              <summary className="cursor-pointer list-none flex items-center gap-1.5 text-slate-400 hover:text-slate-300 text-[10px] font-medium uppercase tracking-wider">
                <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
                Show built-in exclusion addresses ({SNAPSHOT_EXCLUSION_SET.size})
              </summary>
              <div className="mt-2 max-h-48 overflow-y-auto rounded border border-slate-700/50 bg-slate-900/60 p-2 space-y-1">
                {Array.from(SNAPSHOT_EXCLUSION_SET).map((addr) => (
                  <a
                    key={addr}
                    href={`https://scan.pulsechain.com/address/${addr}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[10px] font-mono text-slate-400 hover:text-cyan-400 truncate"
                    title={addr}
                  >
                    {addr}
                  </a>
                ))}
              </div>
            </details>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={handleSeedBlocklist}
              disabled={seedBlocklistBusy || blocklistLoading}
              className="h-8 bg-slate-700 hover:bg-slate-600 text-white text-xs"
            >
              {seedBlocklistBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ShieldX className="w-3 h-3 mr-1" />}
              Add LP pairs to blocklist
            </Button>
            <Button
              size="sm"
              onClick={handleSyncFromLpBlocklist}
              disabled={syncFromLpBlocklistBusy || blocklistLoading}
              className="h-8 bg-slate-600 hover:bg-slate-500 text-white text-xs"
            >
              {syncFromLpBlocklistBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Layers className="w-3 h-3 mr-1" />}
              Add all LP Staking exclusions to this blocklist
            </Button>
            <span className="text-[10px] text-slate-500">
              ({lpPairAddresses.length} LP pair{lpPairAddresses.length !== 1 ? 's' : ''} available to add)
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input type="text" value={newBlockAddr} onChange={(e) => setNewBlockAddr(e.target.value)}
              placeholder="0x… address"
              className="h-8 flex-1 min-w-40 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 font-mono focus:outline-none focus:border-red-500" />
            <input type="text" value={newBlockReason} onChange={(e) => setNewBlockReason(e.target.value)}
              placeholder="Reason (optional)"
              className="h-8 w-40 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 focus:outline-none focus:border-red-500" />
            <Button size="sm" onClick={handleAddToBlocklist} disabled={blocklistBusy || !newBlockAddr}
              className="h-8 bg-red-700 hover:bg-red-600 text-white text-xs">
              {blocklistBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              <span className="ml-1">Add</span>
            </Button>
          </div>
          {blocklistLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div>
          ) : (
            <>
              <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 280 }}>
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-slate-900 z-10">
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left text-slate-500 font-medium pb-2 pr-4">Address</th>
                      <th className="text-left text-slate-500 font-medium pb-2 pr-4">Reason</th>
                      <th className="text-left text-slate-500 font-medium pb-2">Added</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {blocklist.slice(0, blocklistVisibleCount).map((entry) => (
                      <tr key={entry.address} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                        <td className="py-1.5 pr-4">
                          <a href={`https://scan.pulsechain.com/address/${entry.address}`} target="_blank" rel="noopener noreferrer"
                            className="text-slate-300 font-mono hover:text-white transition-colors">
                            {entry.address.slice(0, 8)}…{entry.address.slice(-6)}
                          </a>
                        </td>
                        <td className="py-1.5 pr-4 text-slate-400">{entry.reason || '—'}</td>
                        <td className="py-1.5 text-slate-500 whitespace-nowrap">{new Date(entry.added_at).toLocaleDateString()}</td>
                        <td className="py-1.5">
                          <button onClick={() => handleRemoveFromBlocklist(entry.address)}
                            className="p-1 text-slate-500 hover:text-red-400 transition-colors" title="Remove">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {blocklist.length === 0 && <p className="text-center text-slate-500 py-4">No entries</p>}
              </div>
              {blocklist.length > blocklistVisibleCount && (
                <div className="flex justify-center pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setBlocklistVisibleCount((c) => c + 25)}
                    className="h-7 text-[11px] border-slate-600 text-slate-400 hover:bg-slate-800"
                  >
                    Load More ({blocklist.length - blocklistVisibleCount} remaining)
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Operator Management ── */}
      <Card className="bg-slate-900/80 border-slate-700/50">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-slate-200 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-cyan-400" />
              Contract Operator Management
            </span>
            <button onClick={fetchCurrentOperators} className="p-1.5 rounded border border-slate-600 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="Refresh operators">
              {operatorsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <p className="text-xs text-slate-400">
            Operators can deposit rewards and set epoch roots on-chain without being the contract owner.
            Add your server keeper wallet here so the cron can auto-publish.
          </p>

          {/* Current operators list */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Current Operators ({currentOperators.length})</p>
            {operatorsLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</div>
            ) : currentOperators.length === 0 ? (
              <p className="text-xs text-amber-400 bg-amber-950/20 border border-amber-500/20 rounded px-3 py-2">
                No operators — the cron cannot auto-publish until you add the keeper wallet as an operator.
              </p>
            ) : (
              <div className="space-y-1">
                {currentOperators.map((op) => (
                  <div key={op} className="flex items-center justify-between gap-2 bg-slate-800/50 rounded px-3 py-1.5 border border-slate-700/40">
                    <span className="text-[11px] font-mono text-cyan-300">{op}</span>
                    <button
                      onClick={() => handleRemoveOperator(op)}
                      disabled={operatorBusy}
                      className="text-slate-500 hover:text-red-400 transition-colors shrink-0"
                      title="Remove operator"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={newOperatorAddr}
              onChange={(e) => setNewOperatorAddr(e.target.value)}
              placeholder="0x… operator wallet address"
              className="h-8 flex-1 min-w-52 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 font-mono focus:outline-none focus:border-cyan-500"
            />
            <Button
              size="sm"
              onClick={handleAddOperator}
              disabled={operatorBusy || !newOperatorAddr}
              className="h-8 bg-cyan-700 hover:bg-cyan-600 text-white text-xs"
            >
              {operatorBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
              Add Operator
            </Button>
          </div>
          {operatorMsg && (
            <p className={`text-xs px-3 py-2 rounded border ${
              operatorMsg.startsWith('✓')
                ? 'text-emerald-400 bg-emerald-950/30 border-emerald-500/20'
                : 'text-red-400 bg-red-950/30 border-red-500/20'
            }`}>{operatorMsg}</p>
          )}
          <div className="flex gap-2 rounded border border-slate-700/40 bg-slate-800/30 px-3 py-2.5 text-[11px] text-slate-400">
            <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
            <span>
              Only the contract <span className="text-white">owner</span> can add/remove operators.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
