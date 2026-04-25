'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  POKER_TOURNAMENT_DEFAULT_CONFIG,
  type CreatePokerTournamentParams,
  type CustomTokenEscrowFunding,
  type PokerBlindIncreaseMode,
} from '@/hooks/use-poker-tournament';
import { isAdminWallet } from '@/lib/admin';
import {
  buildPrizePercents,
  findPokerPrizePresetMeta,
  POKER_PRIZE_PRESET_LIST,
  type PokerPrizePresetId,
} from '@/lib/poker-tournament-prize-presets';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmActionCard } from '@/components/shared/ConfirmActionCard';
import { Confetti, type ConfettiRef } from '@/components/ui/confetti';
import { Prc20TokenPicker, type SelectedPrc20Token } from '@/components/shared/Prc20TokenPicker';
import { useTokenPriceUsd } from '@/hooks/use-token-price-usd';
import { parseUnits } from 'viem';
import { useWriteContract, usePublicClient } from 'wagmi';
import { ERC20_ABI } from '@/abi/erc20';
import { tournamentPrizeEscrowV2Abi } from '@/abi/tournament-prize-escrow-v2';
import { TOURNAMENT_PRIZE_ESCROW_ADDRESS } from '@/lib/contracts';
import { tournamentIdToBytes32 } from '@/lib/tournament-id-bytes32';

/** Where the freeroll guarantee comes from. Mirrors server `GuaranteedPrizePoolSource`. */
type PrizeSource = 'chips' | 'platform_promo' | 'custom_token';

function defaultScheduledFields(): { date: string; time: string } {
  const from = new Date(Date.now() + 120_000);
  from.setSeconds(0, 0);
  while (from.getTime() < Date.now() + 60_000) {
    from.setMinutes(from.getMinutes() + 1);
  }
  return {
    date: localYyyyMmDd(from),
    time: `${String(from.getHours()).padStart(2, '0')}:${String(from.getMinutes()).padStart(2, '0')}`,
  };
}

function localYyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

/** Whole off-chain poker chips (integer string). */
function parsePositiveWholeChips(val: string): bigint {
  const cleaned = val.replace(/[,\s]/g, '').split('.')[0] ?? '';
  if (!cleaned || !/^\d+$/.test(cleaned)) return 0n;
  try {
    return BigInt(cleaned);
  } catch {
    return 0n;
  }
}

const STARTING_STACK_PRESETS = [
  { value: '1000', label: '1,000' },
  { value: '2500', label: '2,500' },
  { value: '5555', label: '5,555' },
  { value: '10000', label: '10,000' },
] as const;

function finishOrdinal(rank: number): string {
  const j = rank % 10;
  const k = rank % 100;
  if (j === 1 && k !== 11) return `${rank}st`;
  if (j === 2 && k !== 12) return `${rank}nd`;
  if (j === 3 && k !== 13) return `${rank}rd`;
  return `${rank}th`;
}

/** Clears seconds/ms and ensures the instant is strictly at least 1 minute in the future. */
function ensureScheduleAtLeastOneMinuteAhead(d: Date): Date {
  const out = new Date(d);
  out.setSeconds(0, 0);
  out.setMilliseconds(0);
  while (out.getTime() < Date.now() + 60_000) {
    out.setMinutes(out.getMinutes() + 1);
  }
  return out;
}

function parseLocalDateTime(dateStr: string, timeStr: string): Date | null {
  const parts = dateStr.split('-').map(Number);
  const timeOnly = timeStr.slice(0, 5);
  const timeParts = timeOnly.split(':').map(Number);
  if (parts.length !== 3 || timeParts.length !== 2) return null;
  const [y, mo, d] = parts;
  const [hh, mm] = timeParts;
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d) || !Number.isFinite(hh) || !Number.isFinite(mm)) {
    return null;
  }
  return new Date(y, mo - 1, d, hh, mm, 0, 0);
}

/** Inline USD-value preview for the custom-token amount input. Hidden until the picker resolves a token. */
function CustomTokenUsdHint({ token, amount }: { token: SelectedPrc20Token | null; amount: string }) {
  const priceUsd = useTokenPriceUsd(token?.address ?? null);
  if (!token || !amount.trim() || priceUsd == null) return null;
  let parsed: number;
  try {
    parsed = Number(amount.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
  } catch {
    return null;
  }
  const usd = parsed * priceUsd;
  const fmt =
    usd >= 1
      ? `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : usd >= 0.01
        ? `$${usd.toFixed(2)}`
        : `$${usd.toFixed(4)}`;
  return <p className="text-[11px] text-emerald-200/80 mt-1">≈ {fmt} USD</p>;
}

export interface PokerTournamentCreatorProps {
  creatorAddress?: string;
  onClose: () => void;
  onCreate: (
    params: CreatePokerTournamentParams,
    opts: { addBots: number },
  ) => Promise<{ tournamentId: string; pinCode?: string | null } | null>;
}

const TAB_BAR =
  'flex flex-wrap gap-1 p-1 rounded-xl border border-cyan-500/25 bg-black/30 shadow-[inset_0_2px_6px_rgba(0,0,0,0.65)]';
const TAB_TRIGGER =
  'rounded-lg px-3 py-2 text-xs font-medium text-white/65 data-[state=active]:text-white data-[state=active]:bg-gradient-to-br data-[state=active]:from-cyan-600/35 data-[state=active]:to-blue-600/25 data-[state=active]:border data-[state=active]:border-cyan-500/35 data-[state=active]:shadow-sm';

export function PokerTournamentCreator({ creatorAddress, onClose, onCreate }: PokerTournamentCreatorProps) {
  const isAdmin = isAdminWallet(creatorAddress);
  const [name, setName] = useState('My SNG');
  const [isFreeroll, setIsFreeroll] = useState(false);
  /**
   * Where the freeroll prize comes from. Only meaningful when `isFreeroll === true`.
   *  - `chips`: creator's poker chip wallet is debited (default)
   *  - `platform_promo`: admin-only, debits the promo wallet
   *  - `custom_token`: any PRC-20 deposited into the on-chain escrow contract
   */
  const [prizeSource, setPrizeSource] = useState<PrizeSource>('chips');
  const [selectedToken, setSelectedToken] = useState<SelectedPrc20Token | null>(null);
  const [customTokenAmount, setCustomTokenAmount] = useState('');
  const [buyIn, setBuyIn] = useState('1000');
  const [guaranteedPool, setGuaranteedPool] = useState('5000');
  const [startingStack, setStartingStack] = useState<string>('10000');
  const [minPlayers, setMinPlayers] = useState('2');
  const [maxPlayers, setMaxPlayers] = useState('10');
  const [isPrivate, setIsPrivate] = useState(false);
  const [privatePin, setPrivatePin] = useState('');
  const [botsToAdd, setBotsToAdd] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Two-step on-chain funding for custom-token freerolls.
  // 'idle' is the pre-funding state; 'approving'/'depositing' are mid-tx; 'approved' allows step 2;
  // 'creating' calls the server; 'failed' shows the reclaim button.
  const [fundingStep, setFundingStep] = useState<'idle' | 'approving' | 'approved' | 'depositing' | 'deposited' | 'creating' | 'failed'>('idle');
  const [fundingError, setFundingError] = useState<string | null>(null);
  /**
   * Stable across the entire funding flow: we generate the UUID once when the user
   * starts approve/deposit so that the bytes32 escrow key matches what we later send
   * to the server. Re-rolling on each click would orphan funded escrows.
   */
  const [fundingTournamentId, setFundingTournamentId] = useState<string | null>(null);
  const [depositTxHash, setDepositTxHash] = useState<string | null>(null);
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [activeTab, setActiveTab] = useState('basics');
  const initialSchedule = useMemo(() => defaultScheduledFields(), []);
  const [scheduledDate, setScheduledDate] = useState(initialSchedule.date);
  const [scheduledTime, setScheduledTime] = useState(initialSchedule.time);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [blindIncreaseMode, setBlindIncreaseMode] = useState<PokerBlindIncreaseMode>('knockout');
  const [prizePresetId, setPrizePresetId] = useState<PokerPrizePresetId>('podium_classic');
  const [created, setCreated] = useState<{ tournamentId: string; pinCode?: string | null } | null>(null);

  const confettiRef = useRef<ConfettiRef>(null);

  const minScheduleDate = useMemo(() => localYyyyMmDd(new Date()), []);

  useEffect(() => {
    if (!isFreeroll) setPrizeSource('chips');
  }, [isFreeroll]);

  useEffect(() => {
    // Non-admins cannot select platform_promo; reset if they somehow ended up there.
    if (prizeSource === 'platform_promo' && !isAdmin) setPrizeSource('chips');
  }, [prizeSource, isAdmin]);

  useEffect(() => {
    if (!isAdmin) setBotsToAdd(0);
  }, [isAdmin]);

  /** Custom-token amount in smallest unit (wei). 0n if invalid / not yet entered. */
  const customTokenAmountWei = useMemo<bigint>(() => {
    if (prizeSource !== 'custom_token' || !selectedToken || !customTokenAmount.trim()) return 0n;
    try {
      const dec = Math.min(18, Math.max(1, selectedToken.decimals));
      return parseUnits(customTokenAmount.trim(), dec);
    } catch {
      return 0n;
    }
  }, [prizeSource, selectedToken, customTokenAmount]);

  const prizeSlotCount = useMemo(() => {
    const minP = Math.max(2, Math.min(10, parseInt(minPlayers, 10) || 2));
    const rawMax = parseInt(maxPlayers, 10);
    const maxP = Math.max(
      minP,
      Math.max(2, Math.min(10, Number.isFinite(rawMax) ? rawMax : 10)),
    );
    return maxP;
  }, [minPlayers, maxPlayers]);

  const prizePercents = useMemo(
    () => buildPrizePercents(prizePresetId, prizeSlotCount),
    [prizePresetId, prizeSlotCount],
  );

  const prizeSum = prizePercents.reduce((a, b) => a + b, 0);

  const level1Blinds = POKER_TOURNAMENT_DEFAULT_CONFIG.blindSchedule[0];
  const handsL1 = level1Blinds.handsPerLevel ?? 10;
  const startingStackPreview = Math.max(
    100,
    parseInt(startingStack, 10) || Number(STARTING_STACK_PRESETS[STARTING_STACK_PRESETS.length - 1].value),
  );
  const bigBlindStart = level1Blinds.bigBlind > 0 ? level1Blinds.bigBlind : 1;
  const startingBigBlindDepth = Math.round((startingStackPreview / bigBlindStart) * 10) / 10;

  const schedulePreview = useMemo(() => {
    const local = parseLocalDateTime(scheduledDate, scheduledTime);
    if (!local) return null;
    return {
      weekday: format(local, 'EEEE'),
      dayLine: format(local, 'MMMM d, yyyy'),
      timeLine: format(local, 'h:mm a'),
    };
  }, [scheduledDate, scheduledTime]);

  useEffect(() => {
    if (!created) return;
    const id = window.setTimeout(() => {
      confettiRef.current?.fire({
        particleCount: 110,
        spread: 78,
        origin: { y: 0.55, x: 0.5 },
        ticks: 220,
        scalar: 1.05,
      });
      window.setTimeout(() => {
        confettiRef.current?.fire({
          particleCount: 60,
          spread: 100,
          origin: { x: 0.25, y: 0.65 },
          ticks: 180,
        });
        confettiRef.current?.fire({
          particleCount: 60,
          spread: 100,
          origin: { x: 0.75, y: 0.65 },
          ticks: 180,
        });
      }, 180);
    }, 80);
    return () => window.clearTimeout(id);
  }, [created]);

  const bumpSchedule = (kind: 'today' | 'tomorrow' | 'hours', hours?: number) => {
    let base: Date;
    if (kind === 'today') {
      base = ensureScheduleAtLeastOneMinuteAhead(new Date(Date.now() + 45 * 60_000));
    } else if (kind === 'tomorrow') {
      base = new Date();
      base.setDate(base.getDate() + 1);
      base.setHours(18, 0, 0, 0);
      base = ensureScheduleAtLeastOneMinuteAhead(base);
    } else if (kind === 'hours' && hours != null) {
      base = ensureScheduleAtLeastOneMinuteAhead(new Date(Date.now() + hours * 3_600_000));
    } else {
      base = ensureScheduleAtLeastOneMinuteAhead(new Date());
    }
    setScheduledDate(localYyyyMmDd(base));
    setScheduledTime(`${String(base.getHours()).padStart(2, '0')}:${String(base.getMinutes()).padStart(2, '0')}`);
    setScheduleError(null);
  };

  const validateSchedule = (): string | null => {
    if (!scheduledDate.trim()) return 'Pick a start date.';
    const local = parseLocalDateTime(scheduledDate, scheduledTime);
    if (!local) return 'Pick a valid date and time.';
    if (local.getTime() < Date.now() + 60_000) return 'Start must be at least 1 minute from now.';
    return null;
  };

  /** Builds the params object for the server. Returns null if a precondition fails (e.g. invalid schedule). */
  const buildCreateParams = (
    extras: { customTokenEscrow?: CustomTokenEscrowFunding } = {},
  ): { params: CreatePokerTournamentParams; addBots: number } | null => {
    if (!name.trim()) return null;
    const buyChips = isFreeroll ? 0n : parsePositiveWholeChips(buyIn);
    const guaranteeChips = isFreeroll && prizeSource !== 'custom_token' ? parsePositiveWholeChips(guaranteedPool) : 0n;
    if (!isFreeroll && buyChips <= 0n) return null;
    if (isFreeroll && prizeSource !== 'custom_token' && guaranteeChips <= 0n) return null;
    const pinDigits = privatePin.replace(/\D/g, '').slice(0, 12);
    const pinForCreate = isPrivate && pinDigits.length >= 4 ? pinDigits : undefined;

    const err = validateSchedule();
    setScheduleError(err);
    if (err) return null;

    const local = parseLocalDateTime(scheduledDate, scheduledTime)!;
    const scheduledStartAt = local.toISOString();

    let sourceField: { guaranteedPrizePoolSource?: 'platform_promo' | 'custom_token' } = {};
    if (isFreeroll) {
      if (prizeSource === 'platform_promo') sourceField = { guaranteedPrizePoolSource: 'platform_promo' };
      else if (prizeSource === 'custom_token') sourceField = { guaranteedPrizePoolSource: 'custom_token' };
    }

    return {
      params: {
        name: name.trim(),
        buyInAmount: buyChips.toString(),
        ...(isFreeroll && prizeSource !== 'custom_token'
          ? { guaranteedPrizePool: guaranteeChips.toString() }
          : {}),
        ...sourceField,
        ...(extras.customTokenEscrow ? { customTokenEscrow: extras.customTokenEscrow } : {}),
        prizeDistributionType: 'custom',
        prizePercentages: [...prizePercents],
        config: {
          ...POKER_TOURNAMENT_DEFAULT_CONFIG,
          startingStack: Math.max(
            100,
            parseInt(startingStack, 10) || Number(STARTING_STACK_PRESETS[STARTING_STACK_PRESETS.length - 1].value),
          ),
          minPlayers: Math.max(2, Math.min(10, parseInt(minPlayers, 10) || 2)),
          maxPlayers: prizeSlotCount,
          blindIncreaseMode,
        },
        isPrivate,
        ...(pinForCreate ? { pinCode: pinForCreate } : {}),
        scheduledStartAt,
      },
      addBots: isAdmin ? Math.max(0, Math.min(10, Math.floor(botsToAdd))) : 0,
    };
  };

  /** Chip / platform-promo path (no on-chain interaction). Identical to legacy behavior. */
  const handleCreate = async () => {
    const built = buildCreateParams();
    if (!built) return;
    setIsSubmitting(true);
    try {
      const result = await onCreate(built.params, { addBots: built.addBots });
      if (result?.tournamentId) {
        setCreated(result);
        setShowConfirm(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ---- Custom-token funding flow (two wallet popups, then server create) ----

  /**
   * Step 1: ERC20 approve. Must be triggered by a fresh user gesture so the wallet
   * popup actually appears (browser user-activation requirement).
   */
  const handleApproveCustomToken = async () => {
    if (!selectedToken || customTokenAmountWei <= 0n) return;
    setFundingError(null);
    // Fresh UUID per funding session — kept stable across approve/deposit/server-create/reclaim.
    if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
      setFundingError('Your browser is missing crypto.randomUUID; please update to a modern browser.');
      return;
    }
    const uuid = crypto.randomUUID();
    setFundingTournamentId(uuid);
    setFundingStep('approving');
    try {
      const hash = await writeContractAsync({
        address: selectedToken.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [TOURNAMENT_PRIZE_ESCROW_ADDRESS, customTokenAmountWei],
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      setFundingStep('approved');
    } catch (err) {
      setFundingError((err as Error).message ?? 'Approval failed');
      setFundingStep('idle');
      setFundingTournamentId(null);
    }
  };

  /**
   * Step 2: deposit to escrow. Separate click so wallet popup is permitted again
   * (user gesture is consumed by the prior await).
   */
  const handleDepositCustomToken = async () => {
    if (!selectedToken || !fundingTournamentId || customTokenAmountWei <= 0n) return;
    setFundingError(null);
    setFundingStep('depositing');
    try {
      const bytes32Id = tournamentIdToBytes32(fundingTournamentId);
      const hash = await writeContractAsync({
        address: TOURNAMENT_PRIZE_ESCROW_ADDRESS,
        abi: tournamentPrizeEscrowV2Abi,
        functionName: 'depositPrizePool',
        args: [bytes32Id, selectedToken.address as `0x${string}`, customTokenAmountWei],
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      setDepositTxHash(hash);
      setFundingStep('deposited');
      // Fire the server create immediately — no wallet popup needed.
      await runServerCreateAfterDeposit(fundingTournamentId, hash);
    } catch (err) {
      setFundingError((err as Error).message ?? 'Deposit failed');
      setFundingStep('approved'); // allow retry of the deposit
    }
  };

  const runServerCreateAfterDeposit = async (uuid: string, txHash: string) => {
    if (!selectedToken) return;
    setFundingStep('creating');
    // TEMP DEBUG: surface the exact values being sent so we can inspect on-chain state if create rejects.
    console.log('[CUSTOM-TOKEN-CREATE]', {
      uuid,
      bytes32: tournamentIdToBytes32(uuid),
      txHash,
      tokenAddress: selectedToken.address,
      amountWei: customTokenAmountWei.toString(),
      decimals: selectedToken.decimals,
      symbol: selectedToken.symbol,
    });
    const built = buildCreateParams({
      customTokenEscrow: {
        tournamentId: uuid,
        txHash,
        tokenAddress: selectedToken.address,
        amount: customTokenAmountWei.toString(),
        decimals: selectedToken.decimals,
        symbol: selectedToken.symbol,
      },
    });
    if (!built) {
      setFundingError('Could not assemble tournament params (form changed?)');
      setFundingStep('failed');
      return;
    }
    try {
      const result = await onCreate(built.params, { addBots: built.addBots });
      if (result?.tournamentId) {
        setCreated(result);
        setShowConfirm(false);
        setFundingStep('idle');
      } else {
        setFundingError('Server did not return a tournament id');
        setFundingStep('failed');
      }
    } catch (err) {
      setFundingError((err as Error).message ?? 'Server create failed');
      setFundingStep('failed');
    }
  };

  /**
   * The user's funds are stuck in the escrow because the server rejected the create.
   * `creatorReclaim` returns the deposit; the contract enforces that only the depositor can call it.
   */
  const handleReclaimDeposit = async () => {
    if (!fundingTournamentId) return;
    setFundingError(null);
    try {
      const bytes32Id = tournamentIdToBytes32(fundingTournamentId);
      const hash = await writeContractAsync({
        address: TOURNAMENT_PRIZE_ESCROW_ADDRESS,
        abi: tournamentPrizeEscrowV2Abi,
        functionName: 'creatorReclaim',
        args: [bytes32Id],
      });
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });
      // Reset funding state — user can start over.
      setFundingStep('idle');
      setFundingTournamentId(null);
      setDepositTxHash(null);
      setShowConfirm(false);
    } catch (err) {
      setFundingError((err as Error).message ?? 'Reclaim failed');
    }
  };

  const fieldClass =
    'w-full rounded-xl bg-gray-950/60 border border-cyan-500/20 px-3 py-2.5 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20';
  const labelClass = 'text-xs font-medium text-white/60 mb-1.5 block';

  const prizePresetLabel = findPokerPrizePresetMeta(prizePresetId)?.label ?? prizePresetId;

  if (created) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <Confetti
          ref={confettiRef}
          manualstart
          className="pointer-events-none fixed inset-0 z-[51] h-full w-full"
        />
        <div
          className="relative z-[52] w-full max-w-md rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 p-6 shadow-2xl overflow-hidden"
          style={{
            boxShadow: '0 8px 32px rgba(0,0,0,0.55), inset 0 3px 6px rgba(0,0,0,0.8), inset 0 -3px 6px rgba(255,255,255,0.08)',
          }}
        >
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.18),transparent_55%)]" />
          <div className="relative text-center space-y-4">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/15 text-2xl">
              ✓
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">Tournament created</h2>
            <p className="text-sm text-white/70 leading-relaxed">
              Your Sit &amp; Go is scheduled. You can track it anytime from your creator dashboard.
            </p>
            {created.pinCode && (
              <p className="text-xs text-amber-200/90 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2">
                Private PIN: <span className="font-mono font-semibold tracking-wider">{created.pinCode}</span>
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Link
                href="/creators"
                className="flex-1 text-center rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3 text-sm font-semibold text-white hover:opacity-95 transition-opacity"
              >
                Open creator dashboard
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-white/85 hover:bg-white/5 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const createDisabled =
    isSubmitting
    || !name.trim()
    || prizeSum !== 100
    || prizePercents.length !== prizeSlotCount
    || (!isFreeroll && parsePositiveWholeChips(buyIn) <= 0n)
    || (isFreeroll && prizeSource === 'chips' && parsePositiveWholeChips(guaranteedPool) <= 0n)
    || (isFreeroll && prizeSource === 'platform_promo' && parsePositiveWholeChips(guaranteedPool) <= 0n)
    || (isFreeroll && prizeSource === 'custom_token' && (!selectedToken || customTokenAmountWei <= 0n));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div
        className="relative w-full max-w-xl max-h-[92vh] flex flex-col rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl overflow-hidden"
        style={{
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 3px 6px rgba(0,0,0,0.8), inset 0 -3px 6px rgba(255,255,255,0.08)',
        }}
      >
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.12),transparent_55%)]" />
        <div className="relative shrink-0 flex items-center justify-between px-5 pt-5 pb-3 border-b border-cyan-500/20">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Create a poker SNG</h2>
            <p className="text-[11px] text-white/45 mt-0.5">Sit &amp; Go · scheduled start · you host the table size and prizes</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="relative flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={TAB_BAR}>
              <TabsTrigger value="basics" className={TAB_TRIGGER}>
                Basics
              </TabsTrigger>
              <TabsTrigger value="schedule" className={TAB_TRIGGER}>
                Start time
              </TabsTrigger>
              <TabsTrigger value="rules" className={TAB_TRIGGER}>
                Blinds &amp; access
              </TabsTrigger>
              <TabsTrigger value="prizes" className={TAB_TRIGGER}>
                Prizes
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="staff" className={TAB_TRIGGER}>
                  Staff
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="basics" className="mt-4 space-y-5 outline-none">
              <div>
                <label className={labelClass}>Tournament name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} maxLength={40} />
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isFreeroll}
                  onChange={(e) => {
                    setIsFreeroll(e.target.checked);
                    if (!e.target.checked) {
                      setPrizeSource('chips');
                      setSelectedToken(null);
                      setCustomTokenAmount('');
                    }
                  }}
                  className="rounded border-white/20 bg-gray-900"
                />
                <span className="text-sm text-white/90">Freeroll (you fund the prize pool)</span>
              </label>

              {isFreeroll && (
                <div className="space-y-3">
                  <label className={labelClass}>Prize source</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPrizeSource('chips')}
                      className={`rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${prizeSource === 'chips' ? 'bg-cyan-600/30 border-cyan-500/50 text-white' : 'bg-black/30 border-white/10 text-white/60 hover:text-white'}`}
                    >
                      Poker chips
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => setPrizeSource('platform_promo')}
                        className={`rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${prizeSource === 'platform_promo' ? 'bg-amber-600/30 border-amber-500/50 text-amber-100' : 'bg-black/30 border-white/10 text-white/60 hover:text-white'}`}
                      >
                        Platform promo
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPrizeSource('custom_token')}
                      className={`rounded-lg px-3 py-2 text-xs font-medium border transition-colors ${prizeSource === 'custom_token' ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-100' : 'bg-black/30 border-white/10 text-white/60 hover:text-white'} ${!isAdmin ? 'col-span-2' : ''}`}
                    >
                      Custom PRC-20 token
                    </button>
                  </div>
                  {prizeSource === 'custom_token' && (
                    <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
                      <p className="text-[11px] text-emerald-100/80">
                        Pick any PulseChain token. You&apos;ll approve and deposit the prize amount on-chain when you publish — two wallet popups, then the tournament is created.
                      </p>
                      <Prc20TokenPicker value={selectedToken} onChange={setSelectedToken} />
                      <div>
                        <label className={labelClass}>Prize amount (total pool)</label>
                        <input
                          type="text"
                          value={customTokenAmount}
                          onChange={(e) => setCustomTokenAmount(e.target.value)}
                          placeholder={selectedToken ? `Amount in ${selectedToken.symbol}` : 'Pick a token first'}
                          disabled={!selectedToken}
                          className={`${fieldClass} disabled:opacity-50`}
                        />
                        <CustomTokenUsdHint token={selectedToken} amount={customTokenAmount} />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(!isFreeroll || prizeSource !== 'custom_token') && (
                  <div>
                    <label className={labelClass}>{isFreeroll ? 'Guaranteed prize pool' : 'Buy-in per player'}</label>
                    <input
                      type="number"
                      min="1"
                      value={isFreeroll ? guaranteedPool : buyIn}
                      onChange={(e) => (isFreeroll ? setGuaranteedPool(e.target.value) : setBuyIn(e.target.value))}
                      className={fieldClass}
                    />
                    <p className="text-[11px] text-white/40 mt-1">Off-chain poker chips</p>
                  </div>
                )}
                <div>
                  <label className={labelClass}>Starting stack</label>
                  <Select value={startingStack} onValueChange={setStartingStack}>
                    <SelectTrigger className={`${fieldClass} h-auto min-h-[44px]`}>
                      <SelectValue placeholder="Chips" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border border-cyan-500/30 text-white shadow-xl z-[200]">
                      {STARTING_STACK_PRESETS.map((p) => (
                        <SelectItem key={p.value} value={p.value} className="focus:bg-cyan-500/15 focus:text-white cursor-pointer">
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-white/40 mt-1">Tournament chips at the table</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Min players</label>
                  <input
                    type="number"
                    min="2"
                    max="10"
                    value={minPlayers}
                    onChange={(e) => setMinPlayers(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Max players</label>
                  <input
                    type="number"
                    min="2"
                    max="10"
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>

              <div
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.85), rgba(40, 40, 40, 0.55))',
                  border: '1px inset rgba(60, 60, 60, 0.5)',
                  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                }}
              >
                <span className="text-white/50">Opening blinds · </span>
                <span className="tabular-nums font-medium text-cyan-200">
                  {level1Blinds.smallBlind} / {level1Blinds.bigBlind}
                </span>
                <p className="text-xs text-white/45 mt-1">
                  About {startingBigBlindDepth} big-blind deep with {startingStackPreview.toLocaleString()} chips
                </p>
              </div>
            </TabsContent>

            <TabsContent value="schedule" className="mt-4 space-y-4 outline-none">
              {schedulePreview && (
                <div
                  className="relative rounded-2xl px-5 py-5 text-center space-y-1"
                  style={{
                    background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
                    border: '1px inset rgba(60, 60, 60, 0.5)',
                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  <div className="absolute inset-0 rounded-2xl pointer-events-none bg-[radial-gradient(circle_at_50%_40%,rgba(34,211,238,0.22),transparent_65%)]" />
                  <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300/90">Starts</p>
                  <p className="text-lg font-semibold text-white">{schedulePreview.weekday}</p>
                  <p className="text-sm text-white/70">{schedulePreview.dayLine}</p>
                  <p className="text-3xl font-bold tabular-nums text-white tracking-tight pt-1">{schedulePreview.timeLine}</p>
                  <p className="text-[11px] text-white/40 pt-2">Your local time · any minute</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {(
                  [
                    { k: 'today' as const, label: 'Soon' },
                    { k: 'tomorrow' as const, label: 'Tomorrow 6pm' },
                    { k: 'hours' as const, label: '+1 hour', h: 1 },
                    { k: 'hours' as const, label: '+3 hours', h: 3 },
                  ] as const
                ).map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => bumpSchedule(chip.k, chip.k === 'hours' ? chip.h : undefined)}
                    className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20 transition-colors"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <div>
                <label className={labelClass}>Calendar date</label>
                <input
                  type="date"
                  value={scheduledDate}
                  min={minScheduleDate}
                  onChange={(e) => {
                    setScheduledDate(e.target.value);
                    setScheduleError(null);
                  }}
                  className={`${fieldClass} [color-scheme:dark]`}
                />
              </div>
              <div>
                <label className={labelClass}>Clock time</label>
                <input
                  type="time"
                  step={60}
                  value={scheduledTime.length >= 5 ? scheduledTime.slice(0, 5) : scheduledTime}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v) setScheduledTime(v.slice(0, 5));
                    setScheduleError(null);
                  }}
                  className={`${fieldClass} [color-scheme:dark]`}
                />
                <p className="text-[11px] text-white/40 mt-1.5">Pick any hour and minute (local).</p>
              </div>
              {scheduleError && <p className="text-xs text-red-400">{scheduleError}</p>}
            </TabsContent>

            <TabsContent value="rules" className="mt-4 space-y-5 outline-none">
              <div>
                <label className={labelClass}>How blinds increase</label>
                <Select value={blindIncreaseMode} onValueChange={(v) => setBlindIncreaseMode(v as PokerBlindIncreaseMode)}>
                  <SelectTrigger className={`${fieldClass} h-auto min-h-[44px]`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border border-cyan-500/30 text-white shadow-xl z-[200]">
                    <SelectItem value="knockout" className="focus:bg-cyan-500/15 focus:text-white cursor-pointer">
                      After each knockout (classic SNG)
                    </SelectItem>
                    <SelectItem value="by_hand" className="focus:bg-cyan-500/15 focus:text-white cursor-pointer">
                      On a timer — every N completed hands
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-white/45 mt-2 leading-relaxed">
                  {blindIncreaseMode === 'knockout'
                    ? 'Blinds rise when someone is eliminated, so the game stays comfortable until the field shrinks.'
                    : `Blinds follow the built-in ladder (level 1 uses ${handsL1} hands per level, then fewer hands on later levels) so the pace picks up even if no one has busted yet.`}
                </p>
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => {
                    setIsPrivate(e.target.checked);
                    if (!e.target.checked) setPrivatePin('');
                  }}
                  className="rounded border-white/20 bg-gray-900"
                />
                <span className="text-sm text-white/90">Private tournament (PIN required to join)</span>
              </label>

              {isPrivate && (
                <div>
                  <label className={labelClass}>Room PIN</label>
                  <input
                    type="text"
                    value={privatePin}
                    onChange={(e) => setPrivatePin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    placeholder="4–12 digits"
                    className={fieldClass}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="prizes" className="mt-4 space-y-4 outline-none">
              <div>
                <label className={labelClass}>Prize split preset</label>
                <Select value={prizePresetId} onValueChange={(v) => setPrizePresetId(v as PokerPrizePresetId)}>
                  <SelectTrigger className={`${fieldClass} h-auto min-h-[44px]`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64 bg-slate-900 border border-cyan-500/30 text-white shadow-xl z-[200]">
                    {POKER_PRIZE_PRESET_LIST.map((p) => (
                      <SelectItem
                        key={p.id}
                        value={p.id}
                        textValue={`${p.label} ${p.shortDescription}`}
                        className="focus:bg-cyan-500/15 focus:text-white cursor-pointer"
                      >
                        <span className="font-medium">{p.label}</span>
                        <span className="block text-[10px] text-white/45">{p.shortDescription}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-white/45 mt-1.5">
                  Percents apply to paid finishing positions for up to {prizeSlotCount} seats. Presets always total 100%.
                </p>
              </div>

              <div
                className="rounded-xl overflow-hidden max-h-48 overflow-y-auto"
                style={{
                  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.55))',
                  border: '1px inset rgba(60, 60, 60, 0.5)',
                  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.08)',
                }}
              >
                <div className="grid grid-cols-[1fr_3.5rem] gap-0 bg-white/5 text-[10px] font-medium uppercase tracking-wide text-white/45 px-3 py-2">
                  <span>Finish</span>
                  <span className="text-right">%</span>
                </div>
                {prizePercents.map((pct, i) => (
                  <div key={i} className="grid grid-cols-[1fr_3.5rem] gap-2 items-center border-t border-white/10 px-3 py-2">
                    <span className="text-sm text-white/85">{finishOrdinal(i + 1)}</span>
                    <span className="text-sm text-cyan-100/95 tabular-nums text-right font-medium">{pct}%</span>
                  </div>
                ))}
              </div>
            </TabsContent>

            {isAdmin && (
              <TabsContent value="staff" className="mt-4 space-y-5 outline-none">
                <div>
                  <label className={labelClass}>Auto-join bot count (after create)</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={botsToAdd}
                    onChange={(e) => setBotsToAdd(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
                    className={fieldClass}
                  />
                  <p className="text-[11px] text-white/40 mt-1.5 leading-relaxed">
                    Staff only: server bots fill empty seats once the tournament exists. Players never see this option.
                  </p>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>

        <div className="relative shrink-0 flex gap-3 px-5 py-4 border-t border-cyan-500/20 bg-black/20">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-white/15 text-white/80 text-sm font-medium py-2.5 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const e = validateSchedule();
              setScheduleError(e);
              if (e) setActiveTab('schedule');
              else setShowConfirm(true);
            }}
            disabled={createDisabled}
            className="flex-1 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-95 disabled:opacity-40 disabled:pointer-events-none text-white text-sm font-semibold py-2.5 transition-opacity"
          >
            {isSubmitting ? 'Creating…' : 'Review & create'}
          </button>
        </div>
      </div>

      {showConfirm && (() => {
        const local = parseLocalDateTime(scheduledDate, scheduledTime);
        const scheduleDisplay = local
          ? local.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
          : '—';
        const topSplit = prizePercents
          .map((p, i) => (p > 0 ? `${finishOrdinal(i + 1)} ${p}%` : null))
          .filter(Boolean)
          .slice(0, 5)
          .join(', ');

        // Custom-token path: dedicated two-step funder card. Wallet pops twice (approve, deposit),
        // then server is called automatically. On server failure, user can reclaim the deposit.
        if (isFreeroll && prizeSource === 'custom_token') {
          return (
            <CustomTokenFunderCard
              token={selectedToken}
              amount={customTokenAmount}
              amountWei={customTokenAmountWei}
              tournamentName={name || '—'}
              scheduleDisplay={scheduleDisplay}
              prizeSplitPreview={topSplit || '—'}
              fundingStep={fundingStep}
              fundingError={fundingError}
              onApprove={() => void handleApproveCustomToken()}
              onDeposit={() => void handleDepositCustomToken()}
              onReclaim={() => void handleReclaimDeposit()}
              onCancel={() => {
                if (fundingStep === 'idle') setShowConfirm(false);
              }}
              canCancel={fundingStep === 'idle'}
            />
          );
        }

        const prizeRow = isFreeroll
          ? { label: 'Guaranteed pool', value: `${guaranteedPool} chips${prizeSource === 'platform_promo' ? ' · platform-funded' : ''}`, accent: prizeSource === 'platform_promo' ? ('yellow' as const) : ('yellow' as const) }
          : { label: 'Buy-in', value: `${buyIn} chips`, accent: 'yellow' as const };

        return (
          <ConfirmActionCard
            title="Create poker SNG"
            subtitle="Double-check before you publish"
            rows={[
              { label: 'Name', value: name || '—', accent: 'white' },
              prizeRow,
              { label: 'Starting stack', value: `${startingStackPreview.toLocaleString()} chips`, accent: 'green' },
              { label: 'Opening blinds', value: `${level1Blinds.smallBlind} / ${level1Blinds.bigBlind}`, accent: 'cyan' },
              { label: 'Players', value: `${minPlayers}–${maxPlayers}`, accent: 'white' },
              { label: 'Prize preset', value: prizePresetLabel, accent: 'cyan' },
              { label: 'Split preview', value: topSplit || '—', accent: 'white' },
              { label: 'Starts', value: scheduleDisplay, accent: 'white' },
              { label: 'Private', value: isPrivate ? 'Yes (PIN required)' : 'No', accent: 'white' },
              ...(isAdmin && botsToAdd > 0
                ? [{ label: 'Staff bots', value: String(botsToAdd), accent: 'yellow' as const }]
                : []),
            ]}
            onBack={() => setShowConfirm(false)}
            onConfirm={() => {
              void handleCreate();
            }}
            confirmLabel="Publish tournament"
            isLoading={isSubmitting}
          />
        );
      })()}
    </div>
  );
}

/** Two-step funder for custom-token freerolls: approve → deposit → (server creates) → done/failed. */
function CustomTokenFunderCard({
  token,
  amount,
  amountWei,
  tournamentName,
  scheduleDisplay,
  prizeSplitPreview,
  fundingStep,
  fundingError,
  onApprove,
  onDeposit,
  onReclaim,
  onCancel,
  canCancel,
}: {
  token: SelectedPrc20Token | null;
  amount: string;
  amountWei: bigint;
  tournamentName: string;
  scheduleDisplay: string;
  prizeSplitPreview: string;
  fundingStep: 'idle' | 'approving' | 'approved' | 'depositing' | 'deposited' | 'creating' | 'failed';
  fundingError: string | null;
  onApprove: () => void;
  onDeposit: () => void;
  onReclaim: () => void;
  onCancel: () => void;
  canCancel: boolean;
}) {
  if (!token || amountWei <= 0n) return null;

  const stepBadge = (label: string, state: 'pending' | 'active' | 'done' | 'failed') => {
    const cls =
      state === 'done'
        ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-100'
        : state === 'active'
          ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-100 animate-pulse'
          : state === 'failed'
            ? 'bg-red-500/20 border-red-500/40 text-red-100'
            : 'bg-black/30 border-white/10 text-white/50';
    const icon = state === 'done' ? '✓' : state === 'failed' ? '×' : '·';
    return (
      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${cls}`}>
        <span className="font-mono text-sm">{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
    );
  };

  const approveState: 'pending' | 'active' | 'done' | 'failed' =
    fundingStep === 'idle' ? 'pending'
      : fundingStep === 'approving' ? 'active'
        : 'done';
  const depositState: 'pending' | 'active' | 'done' | 'failed' =
    fundingStep === 'idle' || fundingStep === 'approving' ? 'pending'
      : fundingStep === 'approved' ? 'pending'
        : fundingStep === 'depositing' ? 'active'
          : fundingStep === 'deposited' || fundingStep === 'creating' ? 'done'
            : fundingStep === 'failed' ? 'done'
              : 'pending';
  const createState: 'pending' | 'active' | 'done' | 'failed' =
    fundingStep === 'creating' ? 'active'
      : fundingStep === 'failed' ? 'failed'
        : fundingStep === 'idle' || fundingStep === 'approving' || fundingStep === 'approved' || fundingStep === 'depositing' ? 'pending'
          : 'done';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-slate-900 to-slate-800 p-5 shadow-2xl">
        <h3 className="text-lg font-bold text-white">Fund prize pool on-chain</h3>
        <p className="text-xs text-white/55 mt-1">Two wallet popups — approve, then deposit. Tournament is created automatically once the deposit confirms.</p>

        <div className="mt-4 space-y-2 text-xs">
          <div className="flex justify-between"><span className="text-white/50">Tournament</span><span className="text-white font-medium truncate ml-3">{tournamentName}</span></div>
          <div className="flex justify-between"><span className="text-white/50">Token</span><span className="text-white font-medium">{token.symbol}</span></div>
          <div className="flex justify-between"><span className="text-white/50">Prize amount</span><span className="text-emerald-200 font-mono">{amount}</span></div>
          <div className="flex justify-between"><span className="text-white/50">Starts</span><span className="text-white">{scheduleDisplay}</span></div>
          <div className="flex justify-between"><span className="text-white/50">Split</span><span className="text-white truncate ml-3">{prizeSplitPreview}</span></div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {stepBadge('Approve', approveState)}
          {stepBadge('Deposit', depositState)}
          {stepBadge('Create', createState)}
        </div>

        {fundingError && (
          <p className="mt-3 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2 break-words">{fundingError}</p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {fundingStep === 'idle' && (
            <button onClick={onApprove} className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-semibold py-2.5">
              1. Approve {token.symbol}
            </button>
          )}
          {fundingStep === 'approving' && (
            <button disabled className="w-full rounded-xl bg-cyan-600/40 text-white/80 text-sm font-semibold py-2.5">Waiting for approval…</button>
          )}
          {fundingStep === 'approved' && (
            <button onClick={onDeposit} className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-cyan-600 text-white text-sm font-semibold py-2.5">
              2. Deposit & create
            </button>
          )}
          {fundingStep === 'depositing' && (
            <button disabled className="w-full rounded-xl bg-emerald-600/40 text-white/80 text-sm font-semibold py-2.5">Depositing on-chain…</button>
          )}
          {(fundingStep === 'deposited' || fundingStep === 'creating') && (
            <button disabled className="w-full rounded-xl bg-emerald-600/40 text-white/80 text-sm font-semibold py-2.5">Creating tournament…</button>
          )}
          {fundingStep === 'failed' && (
            <button onClick={onReclaim} className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-red-600 text-white text-sm font-semibold py-2.5">
              Reclaim deposit
            </button>
          )}
          <button
            onClick={onCancel}
            disabled={!canCancel}
            className="w-full rounded-xl border border-white/15 text-white/70 text-sm font-medium py-2 hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none"
          >
            {canCancel ? 'Back' : 'Funding in progress…'}
          </button>
        </div>
      </div>
    </div>
  );
}
