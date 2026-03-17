'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAccount, useWriteContract, usePublicClient, useReadContract } from 'wagmi';
import { formatEther, parseAbiItem } from 'viem';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import {
  Loader2, RefreshCw, Droplets, Plus, CheckCircle2, XCircle,
  ChevronDown, ChevronRight, AlertTriangle, Gift, Layers, Settings2, Trash2,
  Search, Shield, ExternalLink, Info, Settings, Zap,
  Wallet, Coins, ArrowRight, Globe, TreePine, ShieldX, Users,
} from 'lucide-react';
import { merkleClaimLpAbi } from '@/abi/merkle-claim-lp';
import { ERC20_ABI } from '@/abi/erc20';
import { MERKLE_CLAIM_LP_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { pulsechain } from '@/lib/chains';
import { getApiUrlOptional } from '@/lib/api-urls';
import { SNAPSHOT_EXCLUSION_CONTRACTS } from '@/lib/snapshot-exclusions';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOKEN_ADDR = MORBIUS_TOKEN_ADDRESS as `0x${string}`;
const MERKLE_ADDR = MERKLE_CLAIM_LP_ADDRESS as `0x${string}`;
const MORBIUS_ADDR = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1'.toLowerCase();
const MAX_UINT256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');

// ─── Types ────────────────────────────────────────────────────────────────────

interface LPEpoch {
  id: number;
  epoch_number: number;
  snapshot_block: string | null;
  total_holders: number;
  total_balance: string;
  total_reward_amount: string;
  new_reward_amount: string;
  rollup_amount: string;
  merkle_root: string | null;
  status: 'pending' | 'snapshot' | 'calculated' | 'finalized' | 'published';
  cron_triggered: boolean;
  created_at: string;
  snapshot_at: string | null;
  calculated_at: string | null;
  finalized_at: string | null;
  published_at: string | null;
}

interface LPPair {
  id: number;
  pair_address: string;
  label: string;
  dex_name: string;
  active: boolean;
  added_at: string;
}

interface DiscoveredPair {
  pairAddress: string;
  label: string;
  dexName: string;
  priceUsd?: string;
  liquidity?: number;
}

interface BlocklistEntry {
  address: string;
  reason: string | null;
  added_at: string;
}

interface SnapshotRow {
  wallet_address: string;
  morbius_equivalent: string;
  reward_amount: string;
  merkle_proof: string[] | null;
  superseded_by_epoch_id: number | null;
}

interface LPSettings {
  schedule_type: 'manual' | 'weekly' | 'biweekly' | 'monthly' | 'interval_minutes' | 'interval_hours';
  schedule_day: string;
  schedule_hour_utc: string;
  schedule_interval: string;
  default_reward_wei: string;
  auto_publish_onchain: string;
  countdown_duration: string;
}

// on-chain sub-step within the "finalized" stage
type OnchainStep = 'approve' | 'transfer' | 'setroot' | 'done';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const STATUS_LABELS: Record<LPEpoch['status'], { label: string; color: string }> = {
  pending:    { label: 'Pending',     color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
  snapshot:   { label: 'Snapshotted', color: 'text-blue-400   bg-blue-400/10   border-blue-400/20' },
  calculated: { label: 'Calculated',  color: 'text-purple-400 bg-purple-400/10 border-purple-400/20' },
  finalized:  { label: 'Finalized',   color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
  published:  { label: 'Published',   color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' },
};

function nextEpochDate(settings: LPSettings): Date | null {
  if (settings.schedule_type === 'manual') return null;
  const now = new Date();
  if (settings.schedule_type === 'interval_minutes' || settings.schedule_type === 'interval_hours') {
    const interval = parseInt(settings.schedule_interval, 10) || 1;
    const intervalMs = settings.schedule_type === 'interval_minutes' ? interval * 60_000 : interval * 3_600_000;
    const nextMs = Math.ceil(now.getTime() / intervalMs) * intervalMs;
    return new Date(nextMs <= now.getTime() ? nextMs + intervalMs : nextMs);
  }
  const day = parseInt(settings.schedule_day, 10);
  const hour = parseInt(settings.schedule_hour_utc, 10);
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, 0, 0));
  if (settings.schedule_type === 'weekly' || settings.schedule_type === 'biweekly') {
    let daysAhead = day - now.getUTCDay();
    if (daysAhead < 0 || (daysAhead === 0 && now.getUTCHours() >= hour)) daysAhead += 7;
    if (settings.schedule_type === 'biweekly' && daysAhead < 7) daysAhead += 7;
    next.setUTCDate(now.getUTCDate() + daysAhead);
  } else if (settings.schedule_type === 'monthly') {
    next.setUTCDate(day);
    if (next <= now) {
      next.setUTCMonth(next.getUTCMonth() + 1);
      next.setUTCDate(day);
    }
  }
  return next;
}

// ─── On-chain sub-component ───────────────────────────────────────────────────

function OnchainActions({
  epoch,
  adminAddr,
  apiBase,
  onPublished,
}: {
  epoch: LPEpoch;
  adminAddr: `0x${string}`;
  apiBase: string;
  onPublished: (epochId: number) => void;
}) {
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  // LP contract has no depositRewards — fund by ERC20 transfer to contract
  const depositWei = BigInt(epoch.new_reward_amount || epoch.total_reward_amount || '0');
  const totalWei = BigInt(epoch.total_reward_amount || '0');
  const rollupWei = BigInt(epoch.rollup_amount || '0');

  // Read current MORBIUS allowance for the MerkleClaimLP contract
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: TOKEN_ADDR,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [adminAddr, MERKLE_ADDR],
    query: { enabled: Boolean(MERKLE_ADDR) && depositWei > 0n },
  });
  const currentAllowance = (allowance as bigint | undefined) ?? 0n;

  // Contract balance: if already >= totalWei, transfer step is done (e.g. after refresh or remount)
  const { data: contractBalance, refetch: refetchContractBalance } = useReadContract({
    address: TOKEN_ADDR,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [MERKLE_ADDR],
    query: { enabled: Boolean(MERKLE_ADDR) && totalWei > 0n },
  });
  const merkleContractBalance = (contractBalance as bigint | undefined) ?? 0n;

  // Refetch contract balance when this section mounts so we don't rely on stale cache after a transfer
  useEffect(() => {
    refetchContractBalance();
  }, [refetchContractBalance]);

  const [step, setStep] = useState<OnchainStep>(
    depositWei === 0n ? 'setroot' :
    currentAllowance >= depositWei ? 'transfer' : 'approve',
  );
  const [waiting, setWaiting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (depositWei === 0n && step === 'approve') {
      setStep('setroot');
    } else if (currentAllowance >= depositWei && depositWei > 0n && step === 'approve') {
      setStep('transfer');
    }
  }, [currentAllowance, depositWei, step]);

  // After transfer, contract has the tokens; on remount/refresh we should show setroot, not transfer
  useEffect(() => {
    if (totalWei > 0n && merkleContractBalance >= totalWei && step === 'transfer') {
      setStep('setroot');
    }
  }, [merkleContractBalance, totalWei, step]);

  const waitForTx = async (hash: `0x${string}`, then: () => void) => {
    setTxHash(hash);
    setWaiting(true);
    try {
      await publicClient!.waitForTransactionReceipt({ hash });
      then();
    } catch {
      setMsg('Tx failed or timed out — check PulseScan');
    } finally {
      setWaiting(false);
      setTxHash(null);
    }
  };

  const handleApprove = async () => {
    if (depositWei === 0n) { setStep('setroot'); return; }
    setMsg('');
    try {
      const hash = await writeContractAsync({
        address: TOKEN_ADDR,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [MERKLE_ADDR, MAX_UINT256],
        maxPriorityFeePerGas: 200_000n,
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

  // LP contract is funded by direct ERC20 transfer (no depositRewards function)
  const handleTransfer = async () => {
    if (depositWei === 0n) { setStep('setroot'); return; }
    setMsg('');
    try {
      const hash = await writeContractAsync({
        address: TOKEN_ADDR,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [MERKLE_ADDR, depositWei],
        maxPriorityFeePerGas: 200_000n,
        chain: pulsechain,
        account: adminAddr,
      });
      await waitForTx(hash, () => {
        refetchContractBalance();
        setStep('setroot');
        setMsg(`✓ Transferred ${fmtMorbius(epoch.new_reward_amount || epoch.total_reward_amount)} MORBIUS to contract`);
      });
    } catch (e: any) {
      setMsg(e?.shortMessage || e?.message || 'Transfer failed');
    }
  };

  const handleSetRoot = async () => {
    if (!epoch.merkle_root) { setMsg('No Merkle root — finalize first'); return; }
    setMsg('');
    try {
      const hash = await writeContractAsync({
        address: MERKLE_ADDR,
        abi: merkleClaimLpAbi,
        functionName: 'setEpochRoot',
        args: [BigInt(epoch.epoch_number), epoch.merkle_root as `0x${string}`, totalWei],
        maxPriorityFeePerGas: 200_000n,
        chain: pulsechain,
        account: adminAddr,
      });
      await waitForTx(hash, async () => {
        setStep('done');
        setMsg('✓ Root set on-chain! Epoch is now published — users can claim.');
        try {
          const publishRes = await fetch(`${apiBase}/api/admin/merkle-lp/epoch/${epoch.id}/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-wallet': adminAddr },
          });
          if (!publishRes.ok) throw new Error(`HTTP ${publishRes.status}`);
          setTimeout(() => onPublished(epoch.id), 2500);
        } catch (publishErr: any) {
          setMsg(`✓ Root set on-chain! But auto-publish failed (${publishErr?.message ?? 'unknown'}) — click refresh to reload.`);
        }
      });
    } catch (e: any) {
      setMsg(e?.shortMessage || e?.message || 'setEpochRoot failed');
    }
  };

  if (totalWei === 0n) {
    return <p className="text-xs text-yellow-400">Set reward amount first (Calculate Rewards step).</p>;
  }

  // Show setroot when step is setroot, or when still on transfer but contract already has enough (e.g. after refresh)
  const canSetRoot = step === 'setroot' || (step === 'transfer' && merkleContractBalance >= totalWei);
  const stepNum = step === 'approve' ? 1 : step === 'transfer' ? 2 : step === 'setroot' ? 3 : 4;
  const noNewDeposit = depositWei === 0n;

  return (
    <div className="space-y-3">
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
        {(['approve', 'transfer', 'setroot'] as const).map((s, i) => {
          const done = stepNum > i + 1 || (s === 'transfer' && canSetRoot);
          const active = (stepNum === i + 1 && !(s === 'transfer' && canSetRoot)) || (s === 'setroot' && canSetRoot);
          const labels = ['1. Approve MORBIUS', '2. Transfer to Contract', '3. Set Root On-Chain'];
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
          <Button size="sm" onClick={handleApprove} disabled={waiting}
            className="h-8 bg-yellow-600 hover:bg-yellow-500 text-white text-xs">
            {waiting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Wallet className="w-3 h-3 mr-1" />}
            Approve MORBIUS
          </Button>
        )}
        {step === 'transfer' && !canSetRoot && (
          <Button size="sm" onClick={handleTransfer} disabled={waiting}
            className="h-8 bg-blue-600 hover:bg-blue-500 text-white text-xs">
            {waiting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Coins className="w-3 h-3 mr-1" />}
            Transfer {fmtMorbius(epoch.new_reward_amount || epoch.total_reward_amount)} MORBIUS
          </Button>
        )}
        {canSetRoot && (
          <Button size="sm" onClick={handleSetRoot} disabled={waiting}
            className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs">
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
          <a href={`https://scan.pulsechain.com/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
            className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1">
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminLPStakingTab() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const apiBase = getApiUrlOptional() ?? '';

  // Contract balance
  const { data: merkleLPBalance, refetch: refetchBalance } = useReadContract({
    address: TOKEN_ADDR,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [MERKLE_ADDR],
  });
  const merkleDropBal = (merkleLPBalance ?? 0n) as bigint;

  // ── Epochs state ──────────────────────────────────────────────────────────
  const [epochs, setEpochs] = useState<LPEpoch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [epochVisibleCount, setEpochVisibleCount] = useState(5);

  const [rewardInputs, setRewardInputs] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [actionMsg, setActionMsg] = useState<Record<number, string>>({});

  const [creating, setCreating] = useState(false);
  const [quickCreating, setQuickCreating] = useState(false);

  // ── LP Pairs state ────────────────────────────────────────────────────────
  const [pairs, setPairs] = useState<LPPair[]>([]);
  const [loadingPairs, setLoadingPairs] = useState(true);
  const [newPairAddr, setNewPairAddr] = useState('');
  const [newPairLabel, setNewPairLabel] = useState('');
  const [newPairDex, setNewPairDex] = useState('PulseX V1');
  const [addingPair, setAddingPair] = useState(false);
  const [pairError, setPairError] = useState('');

  // ── Search for new pairs state ────────────────────────────────────────────
  const [searching, setSearching] = useState(false);
  const [discoveredPairs, setDiscoveredPairs] = useState<DiscoveredPair[] | null>(null);
  const [searchError, setSearchError] = useState('');
  const [addingDiscovered, setAddingDiscovered] = useState<string | null>(null);

  // ── Blocklist state ───────────────────────────────────────────────────────
  const [blocklist, setBlocklist] = useState<BlocklistEntry[]>([]);
  const [blocklistLoading, setBlocklistLoading] = useState(false);
  const [newBlockAddr, setNewBlockAddr] = useState('');
  const [newBlockReason, setNewBlockReason] = useState('');
  const [blocklistBusy, setBlocklistBusy] = useState(false);
  const [seedFromAllDeploymentsBusy, setSeedFromAllDeploymentsBusy] = useState(false);

  // ── Snapshot viewer state ──────────────────────────────────────────────────
  const [snapshotData, setSnapshotData] = useState<Record<number, { rows: SnapshotRow[]; total: number; page: number; loading: boolean }>>({});

  // ── Settings state ────────────────────────────────────────────────────────
  const defaultSettings: LPSettings = {
    schedule_type: 'manual', schedule_day: '5',
    schedule_hour_utc: '12', schedule_interval: '60',
    default_reward_wei: '0', auto_publish_onchain: 'false',
    countdown_duration: '0',
  };
  const [settings, setSettings] = useState<LPSettings>(defaultSettings);
  const [settingsDraft, setSettingsDraft] = useState<LPSettings>(defaultSettings);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');

  // ── Operator management ───────────────────────────────────────────────────
  const [newOperatorAddr, setNewOperatorAddr] = useState('');
  const [operatorBusy, setOperatorBusy] = useState(false);
  const [operatorMsg, setOperatorMsg] = useState('');
  const [currentOperators, setCurrentOperators] = useState<string[]>([]);
  const [operatorsLoading, setOperatorsLoading] = useState(false);

  const adminHeaders = useCallback(
    () => address ? { 'x-admin-wallet': address, 'Content-Type': 'application/json' } : {},
    [address],
  );

  // ── Fetch helpers ─────────────────────────────────────────────────────────

  const fetchEpochs = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/admin/merkle-lp/epochs`, { headers: adminHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEpochs(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load epochs');
    } finally {
      setLoading(false);
    }
  }, [address, adminHeaders, apiBase]);

  const fetchPairs = useCallback(async () => {
    if (!address) return;
    setLoadingPairs(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/merkle-lp/pairs`, { headers: adminHeaders() });
      const data = await res.json();
      setPairs(Array.isArray(data) ? data : []);
    } catch {
      setPairs([]);
    } finally {
      setLoadingPairs(false);
    }
  }, [address, adminHeaders, apiBase]);

  const fetchBlocklist = useCallback(async () => {
    if (!address) return;
    setBlocklistLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/merkle-lp/blocklist`, { headers: adminHeaders() });
      const data = await res.json();
      setBlocklist(Array.isArray(data) ? data : []);
    } catch { /* non-critical */ } finally {
      setBlocklistLoading(false);
    }
  }, [address, adminHeaders, apiBase]);

  const fetchSettings = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`${apiBase}/api/admin/merkle-lp/settings`, { headers: adminHeaders() });
      if (res.ok) {
        const data = await res.json() as LPSettings;
        setSettings(data);
        setSettingsDraft(data);
      }
    } catch { /* non-critical */ }
  }, [address, adminHeaders, apiBase]);

  useEffect(() => { fetchEpochs(); fetchPairs(); fetchBlocklist(); fetchSettings(); }, [fetchEpochs, fetchPairs, fetchBlocklist, fetchSettings]);

  // ── Snapshot viewer ───────────────────────────────────────────────────────

  const fetchSnapshotPage = useCallback(async (epochId: number, page = 1) => {
    setSnapshotData((prev) => ({
      ...prev,
      [epochId]: { rows: prev[epochId]?.rows ?? [], total: prev[epochId]?.total ?? 0, page, loading: true },
    }));
    try {
      const res = await fetch(`${apiBase}/api/admin/merkle-lp/epoch/${epochId}/snapshot?page=${page}&pageSize=50`, {
        headers: adminHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
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
  }, [apiBase, adminHeaders]);

  // ── Settings handlers ─────────────────────────────────────────────────────

  const handleSaveSettings = async () => {
    setSettingsBusy(true);
    setSettingsMsg('');
    try {
      const res = await fetch(`${apiBase}/api/admin/merkle-lp/settings`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify(settingsDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSettings(data as LPSettings);
      setSettingsDraft(data as LPSettings);
      setSettingsMsg('✓ Settings saved');
    } catch (e) {
      setSettingsMsg(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSettingsBusy(false);
    }
  };

  // ── Pair actions ──────────────────────────────────────────────────────────

  const addPair = async (addr?: string, label?: string, dex?: string) => {
    const pairAddr = addr ?? newPairAddr;
    if (!pairAddr.trim()) return;
    setAddingPair(true);
    setPairError('');
    try {
      const r = await fetch(`${apiBase}/api/admin/merkle-lp/pairs`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({
          pairAddress: pairAddr.trim(),
          label: (label ?? newPairLabel).trim() || pairAddr.trim(),
          dexName: dex ?? newPairDex,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? 'Failed');
      if (!addr) { setNewPairAddr(''); setNewPairLabel(''); }
      await fetchPairs();
      if (addr) {
        setDiscoveredPairs((prev) => prev ? prev.filter((p) => p.pairAddress.toLowerCase() !== addr.toLowerCase()) : prev);
      }
    } catch (e: any) {
      setPairError(e.message);
    } finally {
      setAddingPair(false);
      setAddingDiscovered(null);
    }
  };

  const togglePair = async (pairAddress: string, active: boolean) => {
    try {
      await fetch(`${apiBase}/api/admin/merkle-lp/pairs/${pairAddress}`, {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({ active }),
      });
      await fetchPairs();
    } catch { /* ignore */ }
  };

  const deletePair = async (pairAddress: string) => {
    if (!confirm('Remove this LP pair from snapshots?')) return;
    try {
      await fetch(`${apiBase}/api/admin/merkle-lp/pairs/${pairAddress}`, {
        method: 'DELETE',
        headers: adminHeaders(),
      });
      await fetchPairs();
    } catch { /* ignore */ }
  };

  // ── Search for new pairs ──────────────────────────────────────────────────

  const searchForNewPairs = async () => {
    setSearching(true);
    setSearchError('');
    setDiscoveredPairs(null);
    try {
      const resp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${MORBIUS_ADDR}`);
      if (!resp.ok) throw new Error(`DexScreener returned ${resp.status}`);
      const data = await resp.json() as {
        pairs?: Array<{
          chainId: string; dexId: string; pairAddress: string;
          baseToken: { address: string; symbol: string };
          quoteToken: { address: string; symbol: string };
          priceUsd?: string; liquidity?: { usd?: number };
        }>;
      };
      const knownAddrs = new Set(pairs.map((p) => p.pair_address.toLowerCase()));
      const pulsePairs = (data.pairs ?? []).filter((p) => p.chainId === 'pulsechain');
      const newPairs: DiscoveredPair[] = pulsePairs
        .filter((p) => !knownAddrs.has(p.pairAddress.toLowerCase()))
        .map((p) => {
          const isMorbiusBase = p.baseToken.address.toLowerCase() === MORBIUS_ADDR;
          const pairedSymbol = isMorbiusBase ? p.quoteToken.symbol : p.baseToken.symbol;
          const dexLabel = p.dexId === 'pulsex' ? 'PulseX V1' : p.dexId === 'pulsexv2' ? 'PulseX V2' : p.dexId === '9mm' ? '9mm' : p.dexId;
          return { pairAddress: p.pairAddress, label: `MORBIUS/${pairedSymbol}`, dexName: dexLabel, priceUsd: p.priceUsd, liquidity: p.liquidity?.usd };
        });
      setDiscoveredPairs(newPairs);
    } catch (e: any) {
      setSearchError(e.message ?? 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  // ── Epoch actions ─────────────────────────────────────────────────────────

  const setEpochBusy = (id: number, val: boolean) => setBusy((p) => ({ ...p, [id]: val }));
  const setEpochMsg  = (id: number, msg: string)  => setActionMsg((p) => ({ ...p, [id]: msg }));

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/admin/merkle-lp/epoch/create`, {
        method: 'POST',
        headers: adminHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
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

  const handleQuickCreate = async () => {
    setQuickCreating(true);
    setError(null);
    try {
      const createRes = await fetch(`${apiBase}/api/admin/merkle-lp/epoch/create`, {
        method: 'POST',
        headers: adminHeaders(),
      });
      const epochData = await createRes.json();
      if (!createRes.ok) throw new Error(epochData.error || `HTTP ${createRes.status}`);
      const epochId = epochData.id;

      const calcRes = await fetch(`${apiBase}/api/admin/merkle-lp/epoch/${epochId}/calculate`, {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ newRewardAmount: settings.default_reward_wei }),
      });
      const calcData = await calcRes.json();
      if (!calcRes.ok) throw new Error(calcData.error || `HTTP ${calcRes.status}`);

      await fetchEpochs();
      setExpandedId(epochId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Quick create failed');
    } finally {
      setQuickCreating(false);
    }
  };

  const handleSnapshot = async (epochId: number) => {
    setEpochBusy(epochId, true); setEpochMsg(epochId, '');
    try {
      const res = await fetch(`${apiBase}/api/admin/merkle-lp/epoch/${epochId}/snapshot`, { method: 'POST', headers: adminHeaders() });
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
      const res = await fetch(`${apiBase}/api/admin/merkle-lp/epoch/${epochId}/calculate`, {
        method: 'POST', headers: adminHeaders(),
        body: JSON.stringify({ newRewardAmount: weiAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const rollup = Number(data.rollup_amount ?? data.epoch?.rollup_amount ?? '0');
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
      const res = await fetch(`${apiBase}/api/admin/merkle-lp/epoch/${epochId}/finalize`, { method: 'POST', headers: adminHeaders() });
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

  const handlePublished = useCallback(async (_epochId: number) => {
    await fetchEpochs();
  }, [fetchEpochs]);

  const handleManualPublish = async (epochId: number) => {
    setEpochBusy(epochId, true); setEpochMsg(epochId, '');
    try {
      const res = await fetch(`${apiBase}/api/admin/merkle-lp/epoch/${epochId}/publish`, {
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

  const handleRevokeEpoch = async (epoch: LPEpoch) => {
    if (!confirm(`Revoke Epoch #${epoch.epoch_number} on-chain?\n\nThis clears the Merkle root so it can be re-set. Only works if nobody has claimed yet.\n\nThe epoch will be reset to "finalized" status in the database so you can re-publish.`)) return;
    setEpochBusy(epoch.id, true);
    setEpochMsg(epoch.id, '');
    try {
      const hash = await writeContractAsync({
        address: MERKLE_ADDR,
        abi: merkleClaimLpAbi,
        functionName: 'revokeEpoch',
        args: [BigInt(epoch.epoch_number)],
        maxPriorityFeePerGas: 200_000n, // PulseChain tip
      });
      setEpochMsg(epoch.id, `Revoking on-chain… tx: ${hash.slice(0, 14)}…`);
      await publicClient!.waitForTransactionReceipt({ hash });
      try {
        await fetch(`${apiBase}/api/admin/merkle-lp/epoch/${epoch.id}/revoke`, {
          method: 'POST',
          headers: adminHeaders(),
        });
      } catch { /* non-critical */ }
      setEpochMsg(epoch.id, `✓ Epoch #${epoch.epoch_number} revoked on-chain — root cleared. You can now re-set the root.`);
      await fetchEpochs();
    } catch (e: any) {
      setEpochMsg(epoch.id, e?.shortMessage || e?.message || 'Revoke failed');
    } finally {
      setEpochBusy(epoch.id, false);
    }
  };

  // ── Blocklist actions ─────────────────────────────────────────────────────

  const handleAddToBlocklist = async () => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(newBlockAddr.trim())) { setError('Invalid address'); return; }
    setBlocklistBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/admin/merkle-lp/blocklist`, {
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
      await fetch(`${apiBase}/api/admin/merkle-lp/blocklist/${addr}`, { method: 'DELETE', headers: adminHeaders() });
      await fetchBlocklist();
    } catch { /* non-critical */ } finally {
      setBlocklistBusy(false);
    }
  };

  const handleSeedFromAllDeployments = async () => {
    if (!address) return;
    setSeedFromAllDeploymentsBusy(true);
    setError('');
    try {
      const existingSet = new Set(blocklist.map((e) => e.address.toLowerCase()));
      const toAdd = SNAPSHOT_EXCLUSION_CONTRACTS.filter((addr) => addr && !existingSet.has(addr.toLowerCase()));
      for (let i = 0; i < toAdd.length; i++) {
        const addr = toAdd[i].startsWith('0x') ? toAdd[i] : `0x${toAdd[i]}`;
        const res = await fetch(`${apiBase}/api/admin/merkle-lp/blocklist`, {
          method: 'POST',
          headers: adminHeaders(),
          body: JSON.stringify({ address: addr, reason: 'ALL_DEPLOYMENTS.MD / game or LP contract' }),
        });
        if (!res.ok) throw new Error(`Failed to add ${addr}`);
        existingSet.add(addr.toLowerCase());
      }
      await fetchBlocklist();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to seed from ALL_DEPLOYMENTS');
    } finally {
      setSeedFromAllDeploymentsBusy(false);
    }
  };

  // ── Operator management ───────────────────────────────────────────────────

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
      setOperatorMsg('Invalid address'); return;
    }
    setOperatorBusy(true); setOperatorMsg('');
    try {
      const hash = await writeContractAsync({
        address: MERKLE_ADDR,
        abi: merkleClaimLpAbi,
        functionName: 'addOperator',
        args: [newOperatorAddr.trim() as `0x${string}`],
        maxPriorityFeePerGas: 200_000n, // PulseChain tip
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
    setOperatorBusy(true); setOperatorMsg('');
    try {
      const hash = await writeContractAsync({
        address: MERKLE_ADDR,
        abi: merkleClaimLpAbi,
        functionName: 'removeOperator',
        args: [addr as `0x${string}`],
        maxPriorityFeePerGas: 200_000n, // PulseChain tip
      });
      setOperatorMsg(`✓ Operator removed — tx: ${hash.slice(0, 14)}…`);
      setTimeout(fetchCurrentOperators, 3000);
    } catch (e: any) {
      setOperatorMsg(e?.shortMessage || e?.message || 'Failed to remove operator');
    } finally {
      setOperatorBusy(false);
    }
  };

  // ── Derived values ────────────────────────────────────────────────────────

  const activePairsCount = pairs.filter((p) => p.active).length;
  const nextEpoch = nextEpochDate(settingsDraft);
  const defaultRewardMorbius = settings.default_reward_wei !== '0' && BigInt(settings.default_reward_wei || '0') > 0n
    ? formatEther(BigInt(settings.default_reward_wei))
    : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Drop Settings Card ── */}
      <Card className="bg-slate-900/80 border-slate-700/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-400" />
            LP Drop Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">

          {/* Snapshot explainer */}
          <div className="flex gap-2 rounded border border-slate-700/40 bg-slate-800/30 px-3 py-2.5 text-[11px] text-slate-400">
            <Info className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
            <span>
              <span className="text-slate-300 font-medium">How LP snapshots work: </span>
              At epoch creation time, every wallet holding LP tokens from supported MORBIUS pairs on PulseChain is captured.
              Rewards are split <span className="text-white">proportionally</span> to each wallet's MORBIUS-equivalent LP value.
              Blocked addresses, burn addresses, and contract addresses are excluded automatically.
            </span>
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">Auto-Schedule</p>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={settingsDraft.schedule_type}
                onChange={(e) => setSettingsDraft((p) => ({ ...p, schedule_type: e.target.value as LPSettings['schedule_type'] }))}
                className="h-8 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 focus:outline-none focus:border-emerald-500"
              >
                <option value="manual">Manual only</option>
                <option value="interval_minutes">Every N minutes</option>
                <option value="interval_hours">Every N hours</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
              </select>

              {(settingsDraft.schedule_type === 'interval_minutes' || settingsDraft.schedule_type === 'interval_hours') && (
                <>
                  <span className="text-xs text-slate-400">every</span>
                  <input
                    type="number" min="1"
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

              {(settingsDraft.schedule_type === 'weekly' || settingsDraft.schedule_type === 'biweekly' || settingsDraft.schedule_type === 'monthly') && (
                <>
                  {settingsDraft.schedule_type !== 'monthly' ? (
                    <select
                      value={settingsDraft.schedule_day}
                      onChange={(e) => setSettingsDraft((p) => ({ ...p, schedule_day: e.target.value }))}
                      className="h-8 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 focus:outline-none focus:border-emerald-500"
                    >
                      {DAY_NAMES.map((d, i) => (<option key={d} value={String(i)}>{d}</option>))}
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
              When <span className="text-slate-400">0</span> (default): each epoch automatically distributes whatever MORBIUS has accumulated in the contract.
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
            </p>
            {settingsDraft.auto_publish_onchain === 'true' && settingsDraft.schedule_type === 'manual' && (
              <p className="text-[10px] text-amber-400">Note: Auto-publish only triggers from scheduled cron epochs. Set a schedule above for fully automated drops.</p>
            )}
          </div>

          {/* Countdown timer */}
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
              LP Merkle Drops — Epoch Management
            </span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 font-mono">{activePairsCount} active pair{activePairsCount !== 1 ? 's' : ''}</span>
              <span className="text-[10px] text-blue-400 font-mono">{fmtMorbius(merkleDropBal.toString())} MORB in contract</span>
              <button onClick={() => { fetchEpochs(); fetchPairs(); refetchBalance(); }} className="p-1.5 rounded border border-slate-600 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {/* Flow diagram */}
          <div className="flex items-center gap-1 flex-wrap text-[10px]">
            {[
              { label: '1. Snapshot',  color: 'text-blue-400   border-blue-400/30',   desc: 'Fetch LP holder balances from chain' },
              { label: '2. Calculate', color: 'text-purple-400 border-purple-400/30', desc: 'Assign proportional rewards' },
              { label: '3. Finalize',  color: 'text-orange-400 border-orange-400/30', desc: 'Build Merkle tree + store proofs' },
              { label: '4. On-Chain',  color: 'text-cyan-400   border-cyan-400/30',   desc: 'Approve → Transfer → setEpochRoot' },
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
            <Button size="sm" onClick={handleCreate} disabled={creating || quickCreating}
              className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs">
              {creating
                ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Creating…</>
                : <><Plus className="w-3 h-3 mr-1" /> Create Epoch + Snapshot</>
              }
            </Button>
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
                const { label, color } = STATUS_LABELS[epoch.status] ?? { label: epoch.status, color: 'text-slate-400 bg-slate-400/10 border-slate-400/20' };
                const isExpanded = expandedId === epoch.id;
                const isEpochBusy = busy[epoch.id] ?? false;

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
                        <span className="text-slate-500 hidden sm:block">
                          {epoch.published_at ? fmtDate(epoch.published_at) : epoch.snapshot_at ? fmtDate(epoch.snapshot_at) : fmtDate(epoch.created_at)}
                        </span>
                        <span>{epoch.total_holders.toLocaleString()} holders</span>
                        {Number(epoch.total_reward_amount) > 0 && (
                          <span className="text-emerald-400 font-mono flex items-center gap-1">
                            {fmtMorbius(epoch.total_reward_amount)} MORBIUS
                            {Number(epoch.rollup_amount) > 0 && (
                              <span className="text-[9px] text-amber-400 border border-amber-400/30 bg-amber-400/5 rounded px-1 py-0.5 ml-1" title={`Includes ${fmtMorbius(epoch.rollup_amount)} MORBIUS rolled up from prior epochs`}>+rollup</span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Expanded */}
                    {isExpanded && (
                      <div className="border-t border-slate-700/40 px-4 py-4 space-y-4">

                        {/* Details */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          {[
                            ['Snapshot Block', epoch.snapshot_block ? Number(epoch.snapshot_block).toLocaleString() : '—'],
                            ['Total Balance',  Number(epoch.total_balance) > 0 ? `${fmtMorbius(epoch.total_balance)} MORBIUS` : '—'],
                            ['Holders',        epoch.total_holders.toLocaleString()],
                            ['Created',        fmtDate(epoch.created_at)],
                          ].map(([lbl, val]) => (
                            <div key={lbl}>
                              <p className="text-[10px] text-slate-500 uppercase tracking-wider">{lbl}</p>
                              <p className="text-slate-200 font-mono mt-0.5">{val}</p>
                            </div>
                          ))}
                        </div>

                        {/* Reward breakdown */}
                        {Number(epoch.total_reward_amount) > 0 && (
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
                        )}

                        {epoch.merkle_root && (
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Merkle Root</p>
                            <p className="text-[10px] text-orange-300 font-mono break-all">{epoch.merkle_root}</p>
                          </div>
                        )}

                        {/* ── Snapshot Holder Viewer ── */}
                        {epoch.status !== 'pending' && (
                          <div className="rounded-lg border border-slate-700/40 bg-slate-800/20 overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/30">
                              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-slate-500" />
                                Eligible Holders ({epoch.total_holders})
                              </p>
                              <Button
                                size="sm" variant="ghost"
                                onClick={() => {
                                  if (snapshotData[epoch.id]?.rows?.length && !snapshotData[epoch.id]?.loading) {
                                    // Toggle off
                                    setSnapshotData((prev) => {
                                      const next = { ...prev };
                                      delete next[epoch.id];
                                      return next;
                                    });
                                  } else {
                                    fetchSnapshotPage(epoch.id, 1);
                                  }
                                }}
                                disabled={snapshotData[epoch.id]?.loading}
                                className="h-6 px-2 text-[10px] text-slate-400 hover:text-white"
                              >
                                {snapshotData[epoch.id]?.loading
                                  ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                  : snapshotData[epoch.id]?.rows?.length
                                    ? <XCircle className="w-3 h-3 mr-1" />
                                    : <Users className="w-3 h-3 mr-1" />
                                }
                                {snapshotData[epoch.id]?.rows?.length ? 'Hide' : 'View Holders'}
                              </Button>
                            </div>

                            {snapshotData[epoch.id]?.rows?.length > 0 && (
                              <div className="overflow-x-auto max-h-80 overflow-y-auto">
                                <table className="w-full text-[11px]">
                                  <thead className="sticky top-0 bg-slate-800">
                                    <tr className="border-b border-slate-700/50">
                                      <th className="text-left text-slate-500 font-medium py-1.5 px-3">#</th>
                                      <th className="text-left text-slate-500 font-medium py-1.5 px-3">Wallet</th>
                                      <th className="text-right text-slate-500 font-medium py-1.5 px-3">MORB Equivalent</th>
                                      <th className="text-right text-slate-500 font-medium py-1.5 px-3">Reward</th>
                                      <th className="text-center text-slate-500 font-medium py-1.5 px-3">Proof</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {snapshotData[epoch.id].rows.map((row, idx) => {
                                      const pageOffset = ((snapshotData[epoch.id].page - 1) * 50);
                                      const morbEquiv = Number(row.morbius_equivalent) / 1e18;
                                      const reward = Number(row.reward_amount) / 1e18;
                                      const isBurnish = row.wallet_address.startsWith('0x000000000000000000000000000000000000');
                                      return (
                                        <tr key={row.wallet_address} className={`border-b border-slate-800/50 hover:bg-slate-700/20 ${isBurnish ? 'bg-red-950/10' : ''}`}>
                                          <td className="py-1.5 px-3 text-slate-600 font-mono">{pageOffset + idx + 1}</td>
                                          <td className="py-1.5 px-3">
                                            <a
                                              href={`https://scan.pulsechain.com/address/${row.wallet_address}`}
                                              target="_blank" rel="noopener noreferrer"
                                              className={`font-mono hover:text-white transition-colors ${isBurnish ? 'text-red-400' : 'text-slate-300'}`}
                                            >
                                              {row.wallet_address}
                                            </a>
                                            {isBurnish && <span className="text-[9px] text-red-400 ml-1.5 border border-red-500/30 rounded px-1 py-0.5">burn/system</span>}
                                            {row.superseded_by_epoch_id && <span className="text-[9px] text-amber-400 ml-1.5 border border-amber-500/30 rounded px-1 py-0.5">superseded</span>}
                                          </td>
                                          <td className="py-1.5 px-3 text-right font-mono text-slate-400">
                                            {morbEquiv >= 1000 ? `${(morbEquiv / 1000).toFixed(2)}K` : morbEquiv.toFixed(2)}
                                          </td>
                                          <td className="py-1.5 px-3 text-right font-mono text-emerald-400">
                                            {reward > 0 ? (reward >= 1000 ? `${(reward / 1000).toFixed(2)}K` : reward.toFixed(4)) : '—'}
                                          </td>
                                          <td className="py-1.5 px-3 text-center">
                                            {row.merkle_proof
                                              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
                                              : <span className="text-slate-600">—</span>
                                            }
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>

                                {/* Pagination */}
                                {snapshotData[epoch.id].total > 50 && (
                                  <div className="flex items-center justify-between px-3 py-2 border-t border-slate-700/30 bg-slate-800/40">
                                    <span className="text-[10px] text-slate-500">
                                      Showing {((snapshotData[epoch.id].page - 1) * 50) + 1}–{Math.min(snapshotData[epoch.id].page * 50, snapshotData[epoch.id].total)} of {snapshotData[epoch.id].total}
                                    </span>
                                    <div className="flex gap-1">
                                      <Button size="sm" variant="ghost" disabled={snapshotData[epoch.id].page <= 1 || snapshotData[epoch.id].loading}
                                        onClick={() => fetchSnapshotPage(epoch.id, snapshotData[epoch.id].page - 1)}
                                        className="h-6 px-2 text-[10px] text-slate-400 hover:text-white">
                                        Prev
                                      </Button>
                                      <Button size="sm" variant="ghost" disabled={snapshotData[epoch.id].page * 50 >= snapshotData[epoch.id].total || snapshotData[epoch.id].loading}
                                        onClick={() => fetchSnapshotPage(epoch.id, snapshotData[epoch.id].page + 1)}
                                        className="h-6 px-2 text-[10px] text-slate-400 hover:text-white">
                                        Next
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {actionMsg[epoch.id] && (
                          <p className={`text-xs px-3 py-2 rounded border ${
                            actionMsg[epoch.id].startsWith('✓')
                              ? 'text-emerald-400 bg-emerald-950/30 border-emerald-500/20'
                              : 'text-red-400 bg-red-950/30 border-red-500/20'
                          }`}>{actionMsg[epoch.id]}</p>
                        )}

                        {/* ── Off-chain steps ── */}
                        <div className="flex flex-wrap gap-2">
                          {(epoch.status === 'pending' || epoch.status === 'snapshot') && (
                            <Button size="sm" variant="outline"
                              onClick={() => handleSnapshot(epoch.id)} disabled={isEpochBusy}
                              className="h-7 text-[11px] border-blue-500/30 text-blue-400 hover:bg-blue-950/30">
                              {isEpochBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              <span className="ml-1">Re-Snapshot</span>
                            </Button>
                          )}

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

                          {epoch.status === 'calculated' && (
                            <Button size="sm"
                              onClick={() => handleFinalize(epoch.id)} disabled={isEpochBusy}
                              className="h-7 text-[11px] bg-orange-600 hover:bg-orange-500">
                              {isEpochBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <TreePine className="w-3 h-3 mr-1" />}
                              Finalize (Build Merkle Tree)
                            </Button>
                          )}
                        </div>

                        {/* ── On-chain steps (finalized only) ── */}
                        {epoch.status === 'finalized' && address && (
                          <div className="space-y-2">
                            <div className="rounded-lg border border-cyan-500/20 bg-cyan-950/10 p-3 space-y-2">
                              <p className="text-[10px] uppercase tracking-wider text-cyan-400/60 font-semibold">
                                On-Chain — wallet required
                              </p>
                              <OnchainActions
                                epoch={epoch}
                                adminAddr={address}
                                apiBase={apiBase}
                                onPublished={handlePublished}
                              />
                            </div>
                            <div className="flex items-center gap-3 flex-wrap">
                              <Button size="sm" onClick={() => handleManualPublish(epoch.id)} disabled={isEpochBusy}
                                className="h-7 text-[11px] bg-emerald-700 hover:bg-emerald-600">
                                {isEpochBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                                Root already set on-chain? Mark as Published
                              </Button>
                              <Button size="sm" onClick={() => handleRevokeEpoch(epoch)} disabled={isEpochBusy}
                                className="h-7 text-[11px] bg-red-800 hover:bg-red-700 text-red-200">
                                {isEpochBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                                Revoke Epoch On-Chain
                              </Button>
                            </div>
                          </div>
                        )}

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
                            {Number(epoch.rollup_amount) > 0 && (
                              <div className="flex items-center gap-4 text-[11px] text-slate-400 border-t border-emerald-500/10 pt-2">
                                <span>New rewards: <span className="text-blue-300 font-mono">{fmtMorbius(epoch.new_reward_amount)} MORBIUS</span></span>
                                <span className="text-slate-600">+</span>
                                <span>Rolled up: <span className="text-amber-300 font-mono">{fmtMorbius(epoch.rollup_amount)} MORBIUS</span></span>
                              </div>
                            )}
                            <div className="border-t border-emerald-500/10 pt-2">
                              <Button size="sm" onClick={() => handleRevokeEpoch(epoch)} disabled={isEpochBusy}
                                className="h-7 text-[11px] bg-red-800 hover:bg-red-700 text-red-200">
                                {isEpochBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                                Revoke Epoch On-Chain
                              </Button>
                              <p className="text-[10px] text-slate-600 mt-1">Clears the root on-chain. Only works if nobody has claimed yet. Owner only.</p>
                            </div>
                          </div>
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

      {/* ── LP Pairs ── */}
      <Card className="bg-slate-900/80 border-slate-700/50">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-slate-200 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-blue-400" />
              LP Pairs
              <span className="text-[10px] text-slate-500 font-normal">(snapshotted each epoch)</span>
            </span>
            <button
              onClick={searchForNewPairs}
              disabled={searching}
              className="text-[10px] px-2.5 py-1 rounded bg-violet-800 hover:bg-violet-700 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              Search for New Pairs
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">

          {/* Search results */}
          {searchError && (
            <div className="rounded bg-red-950/40 border border-red-500/20 px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <p className="text-red-400 text-[11px]">{searchError}</p>
            </div>
          )}

          {discoveredPairs !== null && (
            <div className="rounded border border-violet-700/30 bg-violet-950/10 p-2 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[9px] uppercase tracking-wider text-violet-400 font-semibold">
                  DexScreener Results — {discoveredPairs.length === 0 ? 'No new pairs found' : `${discoveredPairs.length} new pair${discoveredPairs.length !== 1 ? 's' : ''} discovered`}
                </p>
                <button onClick={() => setDiscoveredPairs(null)} className="text-[9px] text-slate-500 hover:text-slate-300 transition-colors">dismiss</button>
              </div>
              {discoveredPairs.length > 0 && (
                <div className="overflow-x-auto max-h-32 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-violet-700/30 hover:bg-transparent">
                        <TableHead className="text-[9px] uppercase tracking-wider text-slate-400 h-5 px-2">Pair</TableHead>
                        <TableHead className="text-[9px] uppercase tracking-wider text-slate-400 h-5 px-2">DEX</TableHead>
                        <TableHead className="text-[9px] uppercase tracking-wider text-slate-400 h-5 px-2">Address</TableHead>
                        <TableHead className="text-[9px] uppercase tracking-wider text-slate-400 h-5 px-2 text-right">Add</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {discoveredPairs.map((dp) => (
                        <TableRow key={dp.pairAddress} className="border-violet-700/20 hover:bg-violet-900/10">
                          <TableCell className="py-0.5 px-2 text-[9px] text-white/80 font-medium">{dp.label}</TableCell>
                          <TableCell className="py-0.5 px-2 text-[9px] text-slate-400">{dp.dexName}</TableCell>
                          <TableCell className="py-0.5 px-2">
                            <a href={`https://scan.pulsechain.com/address/${dp.pairAddress}`} target="_blank" rel="noopener noreferrer"
                              className="text-[9px] font-mono text-blue-400/70 hover:text-blue-300 flex items-center gap-0.5">
                              {shortAddr(dp.pairAddress)}
                              <ExternalLink className="w-2 h-2" />
                            </a>
                          </TableCell>
                          <TableCell className="py-0.5 px-2 text-right">
                            <button
                              onClick={async () => { setAddingDiscovered(dp.pairAddress); await addPair(dp.pairAddress, dp.label, dp.dexName); }}
                              disabled={addingDiscovered === dp.pairAddress || addingPair}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-800 hover:bg-emerald-700 text-emerald-200 font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-0.5 ml-auto"
                            >
                              {addingDiscovered === dp.pairAddress ? <Loader2 className="w-2 h-2 animate-spin" /> : <Plus className="w-2 h-2" />}
                              Add
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* Add pair form */}
          <div className="rounded-lg border border-slate-700/40 bg-slate-800/30 p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Add LP Pair Manually</p>
            <div className="flex flex-wrap gap-2">
              <input type="text" placeholder="Pair address (0x…)" value={newPairAddr} onChange={(e) => setNewPairAddr(e.target.value)}
                className="flex-1 min-w-[180px] text-[11px] font-mono bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500" />
              <input type="text" placeholder="Label (e.g. MORBIUS/HEX)" value={newPairLabel} onChange={(e) => setNewPairLabel(e.target.value)}
                className="flex-1 min-w-[140px] text-[11px] bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500" />
              <select value={newPairDex} onChange={(e) => setNewPairDex(e.target.value)}
                className="text-[9px] bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-white focus:outline-none focus:border-blue-500 min-h-0">
                <option>PulseX V1</option>
                <option>PulseX V2</option>
                <option>9mm</option>
                <option>Other</option>
              </select>
              <button onClick={() => addPair()} disabled={addingPair || !newPairAddr.trim()}
                className="text-[11px] px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">
                {addingPair ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                Add
              </button>
            </div>
            {pairError && <p className="text-[11px] text-red-400">{pairError}</p>}
          </div>

          {/* Pairs table */}
          {loadingPairs ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-slate-500" /></div>
          ) : pairs.length === 0 ? (
            <p className="text-center text-[11px] text-slate-500 py-4">No pairs configured.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/50 hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider text-slate-400 h-7 px-3">Label</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-slate-400 h-7 px-3">DEX</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-slate-400 h-7 px-3">Address</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-slate-400 h-7 px-3 text-center">Active</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider text-slate-400 h-7 px-3 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pairs.map((pair) => (
                    <TableRow key={pair.id} className="border-slate-700/30 hover:bg-slate-800/30">
                      <TableCell className="py-1.5 px-3 text-[11px] text-white/80 font-medium">{pair.label}</TableCell>
                      <TableCell className="py-1.5 px-3 text-[11px] text-slate-400">{pair.dex_name}</TableCell>
                      <TableCell className="py-1.5 px-3">
                        <a href={`https://scan.pulsechain.com/address/${pair.pair_address}`} target="_blank" rel="noopener noreferrer"
                          className="text-[11px] font-mono text-blue-400/70 hover:text-blue-300 transition-colors" title={pair.pair_address}>
                          {shortAddr(pair.pair_address)}
                        </a>
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-center">
                        {pair.active ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" /> : <XCircle className="w-4 h-4 text-slate-600 mx-auto" />}
                      </TableCell>
                      <TableCell className="py-1.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => togglePair(pair.pair_address, !pair.active)}
                            className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                              pair.active ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-emerald-800 hover:bg-emerald-700 text-emerald-200'
                            }`}>
                            {pair.active ? 'Disable' : 'Enable'}
                          </button>
                          <button onClick={() => deletePair(pair.pair_address)}
                            className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-950/20 transition-colors" title="Remove pair">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
          <p className="text-xs text-slate-400">
            Excluded from all LP snapshots. Burn addresses, game contracts, and staking contracts are pre-populated.
          </p>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Button
              size="sm"
              onClick={handleSeedFromAllDeployments}
              disabled={seedFromAllDeploymentsBusy || blocklistLoading}
              className="h-8 bg-slate-700 hover:bg-slate-600 text-white text-xs"
            >
              {seedFromAllDeploymentsBusy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ShieldX className="w-3 h-3 mr-1" />}
              Add all ALL_DEPLOYMENTS contracts to this blocklist
            </Button>
            <span className="text-[10px] text-slate-500">({SNAPSHOT_EXCLUSION_CONTRACTS.length} addresses)</span>
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
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left text-slate-500 font-medium pb-2 pr-4">Address</th>
                    <th className="text-left text-slate-500 font-medium pb-2 pr-4">Reason</th>
                    <th className="text-left text-slate-500 font-medium pb-2">Added</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {blocklist.map((entry) => (
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
          )}
        </CardContent>
      </Card>

      {/* ── Operator Management ── */}
      <Card className="bg-slate-900/80 border-slate-700/50">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-slate-200 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-cyan-400" />
              Contract Operator Management
            </span>
            <button onClick={fetchCurrentOperators} className="p-1.5 rounded border border-slate-600 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="Refresh operators">
              {operatorsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <p className="text-xs text-slate-400">
            Operators can set epoch roots on-chain without being the contract owner.
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
            <input type="text" value={newOperatorAddr} onChange={(e) => setNewOperatorAddr(e.target.value)}
              placeholder="0x… operator wallet address"
              className="h-8 flex-1 min-w-52 rounded bg-slate-800 border border-slate-600 text-white text-xs px-2 font-mono focus:outline-none focus:border-cyan-500" />
            <Button size="sm" onClick={handleAddOperator} disabled={operatorBusy || !newOperatorAddr}
              className="h-8 bg-cyan-700 hover:bg-cyan-600 text-white text-xs">
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

          {/* Contract addresses */}
          <div className="border-t border-slate-700/30 pt-3 space-y-1.5 text-[11px] font-mono">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 w-36 shrink-0">MerkleClaimLP</span>
              <a href={`https://scan.pulsechain.com/address/${MERKLE_ADDR}`} target="_blank" rel="noopener noreferrer"
                className="text-blue-400/80 hover:text-blue-300 break-all">{MERKLE_ADDR}</a>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 w-36 shrink-0">MORBIUS Token</span>
              <a href={`https://scan.pulsechain.com/address/${TOKEN_ADDR}`} target="_blank" rel="noopener noreferrer"
                className="text-blue-400/80 hover:text-blue-300 break-all">{TOKEN_ADDR}</a>
            </div>
            <p className="text-[10px] text-slate-600 pt-1">
              Fund MerkleClaimLP by transferring MORBIUS directly to the contract address above, or use the on-chain Transfer step during epoch publishing.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
