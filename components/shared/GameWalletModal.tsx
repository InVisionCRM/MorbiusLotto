'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, ArrowDownCircle, ArrowUpCircle, RefreshCw, Check, Flag } from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';
import { useAccount, usePublicClient } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import {
  useBlackjackContract,
  useLegacyPlayerReserveAt,
  useLegacyEmergencyPausedAt,
  isLegacyAddress,
} from '@/hooks/use-blackjack-contract';
import { useTokenApproval } from '@/hooks/use-token-approval';
import { useTokenBalance } from '@/hooks/use-token';
import { useNativeBalance } from '@/hooks/use-native-balance';
import { usePlsQuote } from '@/hooks/use-pls-quote';
import {
  BLACKJACK_ADDRESS,
  BLACKJACK_LEGACY_ADDRESS,
  BLACKJACK_LEGACY_ADDRESS_2,
  BLACKJACK_LEGACY_ADDRESS_3,
  BLACKJACK_LEGACY_ADDRESS_4,
  BLACKJACK_LEGACY_ADDRESS_5,
  MORBIUS_TOKEN_ADDRESS,
} from '@/lib/contracts';
import { getBlackjackServerUrl } from '@/lib/api-urls';
import { CustomApprovalModal } from '@/components/BLACKJACK/CustomApprovalModal';
import { ReportModal } from '@/components/shared/ReportModal';
import { toast } from 'sonner';
import type { BlackjackWebSocketClient, PokerTableState } from '@/lib/websocket-client';

// ── Logos ──────────────────────────────────────────────────────────────────

const MORBIUS_LOGO = '/morbius/MorbiusLogo-2.svg';
const PLS_LOGO = '/Pulse Branding/Logo/ball.png';

function TokenLabel({ symbol, size = 'md' }: { symbol: 'MORBIUS' | 'PLS'; size?: 'sm' | 'md' }) {
  const src = symbol === 'MORBIUS' ? MORBIUS_LOGO : PLS_LOGO;
  const dim = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <img src={src} alt="" className={`${dim} object-contain`} />
      <span>{symbol}</span>
    </span>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = 'deposit' | 'withdraw' | 'reup' | 'history';
type DepositMethod = 'pls' | 'morbius';
type DepositPhase = 'idle' | 'confirming' | 'confirming_on_chain' | 'success' | 'error';
type WithdrawPhase = 'idle' | 'queued' | 'confirming' | 'success' | 'error';

interface TxHistoryItem {
  type: 'deposit' | 'withdrawal';
  amount: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
}

// ── Format helpers ─────────────────────────────────────────────────────────

function fmt(wei: string | bigint | undefined | null): string {
  if (wei == null || wei === '') return '0';
  try {
    const n = Number(formatEther(BigInt(wei.toString())));
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } catch {
    return '0';
  }
}

// ── Props ──────────────────────────────────────────────────────────────────

export interface GameWalletModalProps {
  isOpen: boolean;
  onClose: () => void;

  /** Label shown above the balance hero. Defaults to "Balance". */
  balanceLabel?: string;

  // ── Externally-managed balance (blackjack mode) ──
  /** If provided, this balance is displayed instead of fetching from server. */
  externalBalance?: bigint;
  /** Fallback for max-withdraw when externalBalance is unset (non–Blackjack self-managed mode). Not on-chain player reserve. */
  contractReserve?: bigint;
  /** Called after deposit is confirmed on-chain (3 confirmations). */
  onBalanceSync?: () => Promise<void>;
  /** Called after a successful withdrawal. */
  onRefreshBalance?: () => Promise<void>;
  /** Called after withdrawal completes. */
  onWithdrawSuccess?: () => void | Promise<void>;
  /** When true, disables all deposit/withdraw controls (e.g. withdrawal already in flight after page refresh). */
  externalWithdrawLock?: boolean;

  // ── Poker Re-up mode (optional) ──
  /** WebSocket client — enables the Re-up tab when provided with tableId. */
  wsClient?: BlackjackWebSocketClient | null;
  /** Table ID — enables the Re-up tab when provided with wsClient. */
  tableId?: string;
  /** Current seat stack in wei, displayed on the Re-up tab. */
  currentStack?: string;
  /** Called with new table state after a successful re-up. */
  onReupSuccess?: (state: PokerTableState) => void;
  /** When false (default), hide the Re-up tab — e.g. cash poker MVP: leave table to change buy-in. */
  enablePokerReup?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

const DEPOSIT_CONFIRMATIONS_REQUIRED = 3;
const LEGACY_MAX_WITHDRAW_WEI = BigInt(1_000_000) * BigInt(1e18);
const MIN_LEGACY_MORBIUS_WEI = BigInt(500) * BigInt(1e18);

export function GameWalletModal({
  isOpen,
  onClose,
  balanceLabel = 'Balance',
  externalBalance,
  contractReserve,
  onBalanceSync,
  onRefreshBalance,
  onWithdrawSuccess,
  wsClient,
  tableId,
  currentStack,
  onReupSuccess,
  enablePokerReup = false,
  externalWithdrawLock = false,
}: GameWalletModalProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const serverUrl = getBlackjackServerUrl();

  // ── Self-managed balance (used when externalBalance is not provided) ─────
  const [internalBalance, setInternalBalance] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const isSelfManaged = externalBalance === undefined;

  const fetchBalance = useCallback(async () => {
    if (!address || !isSelfManaged) return;
    setBalanceLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/player/${address}/balance`);
      if (!res.ok) throw new Error('Failed to fetch balance');
      const data = await res.json();
      setInternalBalance(BigInt(data.balance ?? '0'));
    } catch {
      // leave as null — display will show 0
    } finally {
      setBalanceLoading(false);
    }
  }, [address, serverUrl, isSelfManaged]);

  const displayBalance: bigint | null =
    externalBalance !== undefined
      ? externalBalance
      : internalBalance;

  // ── Tab state ──────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('deposit');
  const [depositMethod, setDepositMethod] = useState<DepositMethod>('pls');

  // ── Input values ───────────────────────────────────────────────────────
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [reupAmount, setReupAmount] = useState('');

  // ── Phase states ───────────────────────────────────────────────────────
  const [depositPhase, setDepositPhase] = useState<DepositPhase>('idle');
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositBlockNumber, setDepositBlockNumber] = useState<bigint | null>(null);
  const [depositConfirmations, setDepositConfirmations] = useState(0);
  const [depositTxHash, setDepositTxHash] = useState<string | null>(null);
  const [depositNotifyAmountWei, setDepositNotifyAmountWei] = useState<bigint | null>(null);
  const depositToastIdRef = useRef<string | number | null>(null);

  const [withdrawPhase, setWithdrawPhase] = useState<WithdrawPhase>('idle');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [isPreparingWithdraw, setIsPreparingWithdraw] = useState(false);

  const [isReupPending, setIsReupPending] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);

  // ── Legacy withdrawals ─────────────────────────────────────────────────
  const [legacyWithdrawAmounts, setLegacyWithdrawAmounts] = useState<Record<string, string>>({});
  const [dismissedLegacy, setDismissedLegacy] = useState<Set<string>>(new Set());
  const [showLegacyPanel, setShowLegacyPanel] = useState(false);

  // ── Tx history ─────────────────────────────────────────────────────────
  const [txHistory, setTxHistory] = useState<TxHistoryItem[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txLoaded, setTxLoaded] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // ── Wallet balances ────────────────────────────────────────────────────
  const { balance: morbiusBalance } = useTokenBalance(address);
  const { balance: plsBalance } = useNativeBalance(address ?? undefined);

  const { plsValue: plsEquivalent, isLoading: plsQuoteLoading } = usePlsQuote({
    morbiusCost: depositAmount ? parseEther(depositAmount) : 0n,
    enabled: tab === 'deposit' && depositMethod === 'pls' && depositAmount !== '',
  });

  const requiredMorbiusAmount =
    depositAmount && depositMethod === 'morbius' ? parseEther(depositAmount) : 0n;

  const { needsApproval, approve, isApproving, isLoadingAllowance, isApprovalSuccess } =
    useTokenApproval({
      tokenAddress: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
      spenderAddress: BLACKJACK_ADDRESS as `0x${string}`,
      requiredAmount: requiredMorbiusAmount,
      userAddress: address,
      enabled: tab === 'deposit' && depositMethod === 'morbius' && !!depositAmount && !!address,
      defaultToUnlimited: true,
    });

  const { depositTx, depositMORBIISTx, deposit, depositMORBIUS, withdrawLegacy, withdrawTx } =
    useBlackjackContract();

  // ── Legacy contract items ───────────────────────────────────────────────
  const legacy1Reserve = useLegacyPlayerReserveAt(BLACKJACK_LEGACY_ADDRESS);
  const legacy1Paused = useLegacyEmergencyPausedAt(BLACKJACK_LEGACY_ADDRESS);
  const legacy2Reserve = useLegacyPlayerReserveAt(BLACKJACK_LEGACY_ADDRESS_2);
  const legacy2Paused = useLegacyEmergencyPausedAt(BLACKJACK_LEGACY_ADDRESS_2);
  const legacy3Reserve = useLegacyPlayerReserveAt(BLACKJACK_LEGACY_ADDRESS_3);
  const legacy3Paused = useLegacyEmergencyPausedAt(BLACKJACK_LEGACY_ADDRESS_3);
  const legacy4Reserve = useLegacyPlayerReserveAt(BLACKJACK_LEGACY_ADDRESS_4);
  const legacy4Paused = useLegacyEmergencyPausedAt(BLACKJACK_LEGACY_ADDRESS_4);
  const legacy5Reserve = useLegacyPlayerReserveAt(BLACKJACK_LEGACY_ADDRESS_5);
  const legacy5Paused = useLegacyEmergencyPausedAt(BLACKJACK_LEGACY_ADDRESS_5);

  const legacyItems: {
    address: `0x${string}`;
    reserve: bigint;
    paused: boolean;
    refetch: () => void;
    label: string;
  }[] = [];
  if (isLegacyAddress(BLACKJACK_LEGACY_ADDRESS)) {
    legacyItems.push({
      address: BLACKJACK_LEGACY_ADDRESS,
      reserve: (legacy1Reserve.data ?? 0n) as bigint,
      paused: legacy1Paused.data === true,
      refetch: legacy1Reserve.refetch ?? (() => {}),
      label: BLACKJACK_LEGACY_ADDRESS_2 || BLACKJACK_LEGACY_ADDRESS_3 ? 'Previous contract (1)' : 'Previous contract',
    });
  }
  if (isLegacyAddress(BLACKJACK_LEGACY_ADDRESS_2)) {
    legacyItems.push({
      address: BLACKJACK_LEGACY_ADDRESS_2,
      reserve: (legacy2Reserve.data ?? 0n) as bigint,
      paused: legacy2Paused.data === true,
      refetch: legacy2Reserve.refetch ?? (() => {}),
      label: BLACKJACK_LEGACY_ADDRESS || BLACKJACK_LEGACY_ADDRESS_3 ? 'Previous contract (2)' : 'Previous contract',
    });
  }
  if (isLegacyAddress(BLACKJACK_LEGACY_ADDRESS_3)) {
    legacyItems.push({
      address: BLACKJACK_LEGACY_ADDRESS_3,
      reserve: (legacy3Reserve.data ?? 0n) as bigint,
      paused: legacy3Paused.data === true,
      refetch: legacy3Reserve.refetch ?? (() => {}),
      label: 'Previous contract (3)',
    });
  }
  if (isLegacyAddress(BLACKJACK_LEGACY_ADDRESS_4)) {
    legacyItems.push({
      address: BLACKJACK_LEGACY_ADDRESS_4,
      reserve: (legacy4Reserve.data ?? 0n) as bigint,
      paused: legacy4Paused.data === true,
      refetch: legacy4Reserve.refetch ?? (() => {}),
      label: 'Previous contract (4)',
    });
  }
  if (isLegacyAddress(BLACKJACK_LEGACY_ADDRESS_5)) {
    legacyItems.push({
      address: BLACKJACK_LEGACY_ADDRESS_5,
      reserve: (legacy5Reserve.data ?? 0n) as bigint,
      paused: legacy5Paused.data === true,
      refetch: legacy5Reserve.refetch ?? (() => {}),
      label: 'Previous contract (5)',
    });
  }

  // ── Reset on close ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setTxLoaded(false);
      setTxHistory([]);
      setTxError(null);
      setDismissedLegacy(new Set());
      setShowLegacyPanel(false);
      setDepositPhase('idle');
      setDepositError(null);
      setWithdrawPhase('idle');
      setWithdrawError(null);
      setDepositBlockNumber(null);
      setDepositConfirmations(0);
      setDepositTxHash(null);
      setDepositNotifyAmountWei(null);
    } else {
      if (isSelfManaged) fetchBalance();
      setTxLoaded(false);
      setTxHistory([]);
      setTxError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Approval success ───────────────────────────────────────────────────
  useEffect(() => {
    if (isApprovalSuccess) {
      toast.success('Approval successful — you can now deposit MORBIUS');
      setShowApprovalModal(false);
    }
  }, [isApprovalSuccess]);

  // ── Deposit confirmation polling ───────────────────────────────────────
  useEffect(() => {
    if (
      depositBlockNumber == null ||
      depositPhase !== 'confirming_on_chain' ||
      !publicClient ||
      !depositTxHash ||
      depositNotifyAmountWei == null
    ) return;

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const currentBlock = await publicClient.getBlockNumber();
        const confirmations = Number(currentBlock - depositBlockNumber);
        const capped = Math.min(Math.max(confirmations, 0), DEPOSIT_CONFIRMATIONS_REQUIRED);
        setDepositConfirmations(capped);
        if (depositToastIdRef.current != null) {
          toast.loading('Confirming...', {
            id: depositToastIdRef.current,
            description: `${capped}/${DEPOSIT_CONFIRMATIONS_REQUIRED} confirmations`,
          });
        }
        if (confirmations >= DEPOSIT_CONFIRMATIONS_REQUIRED) {
          if (depositToastIdRef.current != null) {
            toast.success('Deposit successful', {
              id: depositToastIdRef.current,
              description: 'Funds are now available in your balance.',
              duration: 5000,
            });
          }
          await notifyDeposit(depositTxHash, depositNotifyAmountWei);
          if (onBalanceSync) {
            try { await onBalanceSync(); } catch {
              if (onRefreshBalance) onRefreshBalance().catch(() => {});
            }
          } else if (isSelfManaged) {
            setTimeout(fetchBalance, 1000);
          }
          setDepositAmount('');
          setDepositPhase('success');
          setDepositBlockNumber(null);
          setDepositTxHash(null);
          setDepositNotifyAmountWei(null);
          setTimeout(() => setDepositPhase('idle'), 2000);
          return;
        }
      } catch {
        // ignore RPC errors, retry next tick
      }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depositBlockNumber, depositPhase, publicClient, depositTxHash, depositNotifyAmountWei]);

  // ── Tx history ─────────────────────────────────────────────────────────
  const fetchTxHistory = useCallback(async () => {
    if (!address) return;
    setTxLoading(true);
    setTxError(null);
    try {
      const res = await fetch(`${serverUrl}/api/players/${address}/transactions?limit=50`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTxHistory(data);
      setTxLoaded(true);
    } catch {
      setTxError('Failed to load history');
    } finally {
      setTxLoading(false);
    }
  }, [address, serverUrl]);

  useEffect(() => {
    if (tab === 'history' && !txLoaded && !txLoading) {
      fetchTxHistory();
    }
  }, [tab, txLoaded, txLoading, fetchTxHistory]);

  // ── Notify deposit ─────────────────────────────────────────────────────
  const notifyDeposit = async (txHash: string, amountWei: bigint) => {
    if (!address) return;
    try {
      await fetch(`${serverUrl}/api/deposit/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, txHash, amount: amountWei.toString() }),
      });
      setTxLoaded(false);
    } catch {
      // silent
    }
  };

  // ── Deposit PLS ────────────────────────────────────────────────────────
  const handleDepositPLS = async () => {
    if (!depositAmount || !plsEquivalent || !publicClient) return;
    setDepositError(null);
    setDepositPhase('confirming');
    const toastId = toast.loading('Confirm in wallet...', {
      description: `Depositing ${depositAmount} MORBIUS worth of PLS`,
    });
    depositToastIdRef.current = toastId;
    try {
      const txHash = await deposit(plsEquivalent);
      setDepositPhase('confirming_on_chain');
      toast.loading('Confirming...', { id: toastId, description: '0/3 confirmations' });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === 'reverted') throw new Error('Transaction reverted on-chain.');
      setDepositTxHash(txHash);
      setDepositNotifyAmountWei(plsEquivalent);
      setDepositBlockNumber(receipt.blockNumber);
      setDepositConfirmations(0);
    } catch (err: any) {
      const isCancel = err?.message?.includes('rejected') || err?.message?.includes('denied');
      setDepositPhase('error');
      setDepositError(isCancel ? 'Cancelled' : 'Deposit failed');
      toast.error(isCancel ? 'Transaction cancelled' : 'Deposit failed', {
        id: toastId,
        description: isCancel ? undefined : err?.message,
      });
      setTimeout(() => { setDepositPhase('idle'); setDepositError(null); }, 4000);
    }
  };

  // ── Deposit MORBIUS ────────────────────────────────────────────────────
  const handleDepositMORBIUS = async () => {
    if (!depositAmount || !publicClient) return;
    if (needsApproval) { setShowApprovalModal(true); return; }
    const amountWei = parseEther(depositAmount);
    setDepositError(null);
    setDepositPhase('confirming');
    const toastId = toast.loading('Confirm in wallet...', {
      description: `Depositing ${depositAmount} MORBIUS`,
    });
    depositToastIdRef.current = toastId;
    try {
      const txHash = await depositMORBIUS(amountWei);
      setDepositPhase('confirming_on_chain');
      toast.loading('Confirming...', { id: toastId, description: '0/3 confirmations' });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === 'reverted') throw new Error('Transaction reverted on-chain.');
      setDepositTxHash(txHash);
      setDepositNotifyAmountWei(amountWei);
      setDepositBlockNumber(receipt.blockNumber);
      setDepositConfirmations(0);
    } catch (err: any) {
      if (err?.message?.includes('allowance') || err?.message?.includes('ERC20')) {
        setDepositPhase('idle');
        toast.error('Approval required', { id: toastId, description: 'Please approve MORBIUS spending first' });
        setShowApprovalModal(true);
      } else {
        const isCancel = err?.message?.includes('rejected') || err?.message?.includes('denied');
        setDepositPhase('error');
        setDepositError(isCancel ? 'Cancelled' : 'Deposit failed');
        toast.error(isCancel ? 'Transaction cancelled' : 'Deposit failed', {
          id: toastId,
          description: isCancel ? undefined : err?.message,
        });
        setTimeout(() => { setDepositPhase('idle'); setDepositError(null); }, 4000);
      }
    }
  };

  // ── Withdraw polling (shared between new withdrawals and resume-on-refresh) ──
  const pollWithdrawJob = useCallback(async (jobId: string, toastId: string | number) => {
    for (let i = 0; i < 120; i++) {
      const statusRes = await fetch(`${serverUrl}/api/withdraw/status/${jobId}`);
      const statusData = await statusRes.json();
      if (!statusRes.ok) throw new Error(statusData.error || 'Failed to get status');
      const { status, txHash } = statusData;
      if (status === 'completed') {
        setWithdrawPhase('success');
        toast.success('Withdrawal successful!', {
          id: toastId,
          description: txHash ? `Tx: ${txHash.slice(0, 10)}…` : 'Sent to your wallet.',
        });
        if (onRefreshBalance) await onRefreshBalance();
        else if (isSelfManaged) await fetchBalance();
        if (onWithdrawSuccess) await Promise.resolve(onWithdrawSuccess());
        setWithdrawAmount('');
        setTxLoaded(false);
        await new Promise((r) => setTimeout(r, 2000));
        setWithdrawPhase('idle');
        return;
      }
      if (status === 'failed') {
        setWithdrawPhase('error');
        setWithdrawError(statusData.error || 'Withdrawal failed. Contact support.');
        toast.error('Withdrawal failed', {
          id: toastId,
          description: statusData.error || 'Contact support.',
        });
        if (onRefreshBalance) await onRefreshBalance();
        else if (isSelfManaged) await fetchBalance();
        setTimeout(() => { setWithdrawPhase('idle'); setWithdrawError(null); }, 4000);
        return;
      }
      if (status === 'pending_confirmation' && txHash) {
        setWithdrawPhase('confirming');
        toast.loading('Confirming on chain...', { id: toastId, description: `Tx: ${txHash.slice(0, 10)}…` });
      } else {
        toast.loading('Processing withdrawal...', { id: toastId });
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    setWithdrawPhase('error');
    setWithdrawError('Withdrawal timed out. Contact support.');
    toast.error('Withdrawal timed out', { id: toastId });
    if (onRefreshBalance) await onRefreshBalance();
    else if (isSelfManaged) await fetchBalance();
    setTimeout(() => { setWithdrawPhase('idle'); setWithdrawError(null); }, 4000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl, onRefreshBalance, isSelfManaged, onWithdrawSuccess]);

  // ── Resume in-progress withdrawal after page refresh ───────────────────
  useEffect(() => {
    if (!isOpen || !address) return;
    let cancelled = false;
    const checkPending = async () => {
      try {
        const res = await fetch(`${serverUrl}/api/withdraw/pending?address=${address}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!data.job || cancelled) return;
        const { jobId, status } = data.job;
        if (status === 'completed' || status === 'failed') return;
        // Resume polling for this in-progress job
        setWithdrawPhase(status === 'pending_confirmation' ? 'confirming' : 'queued');
        setIsPreparingWithdraw(true);
        const toastId = toast.loading('Resuming withdrawal...');
        try {
          await pollWithdrawJob(jobId, toastId);
        } finally {
          if (!cancelled) setIsPreparingWithdraw(false);
        }
      } catch {
        // silently ignore — if we can't check, just don't resume
      }
    };
    checkPending();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, address]);

  // ── Withdraw ───────────────────────────────────────────────────────────
  const handleWithdraw = async () => {
    if (!withdrawAmount || !address) return;
    let amountWei: bigint;
    try {
      amountWei = parseEther(withdrawAmount);
    } catch {
      toast.error('Invalid amount');
      return;
    }
    const effectiveBalance = displayBalance;
    if (effectiveBalance != null && amountWei > effectiveBalance) {
      toast.error('Insufficient balance');
      return;
    }
    setWithdrawError(null);
    setWithdrawPhase('queued');
    setIsPreparingWithdraw(true);
    const toastId = toast.loading('Withdrawal queued...');
    try {
      const res = await fetch(`${serverUrl}/api/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, amount: amountWei.toString() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Withdrawal failed');
      const jobId = data.jobId;
      if (!jobId) throw new Error('Server did not return jobId');
      await pollWithdrawJob(jobId, toastId);
    } catch (err: any) {
      setWithdrawPhase('error');
      setWithdrawError(err?.message ?? 'Withdrawal failed');
      toast.error('Withdrawal failed', { id: toastId, description: err?.message });
      if (onRefreshBalance) await onRefreshBalance();
      else if (isSelfManaged) await fetchBalance();
      setTimeout(() => { setWithdrawPhase('idle'); setWithdrawError(null); }, 4000);
    } finally {
      setIsPreparingWithdraw(false);
    }
  };

  // ── Legacy withdraw ────────────────────────────────────────────────────
  const handleWithdrawLegacy = async (
    legacyAddress: `0x${string}`,
    amount: bigint,
    refetch: () => void
  ) => {
    if (amount <= 0n) return;
    const toastId = toast.loading('Confirm in wallet...', {
      description: `Withdrawing ${Math.floor(Number(formatEther(amount))).toLocaleString()} MORBIUS from previous contract`,
    });
    try {
      const txHash = await withdrawLegacy(legacyAddress, amount);
      toast.loading('Transaction processing...', { id: toastId, description: 'Waiting for confirmation...' });
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
        if (receipt.status === 'reverted') throw new Error('Transaction reverted on-chain.');
      }
      toast.success('Withdrawal successful', {
        id: toastId,
        description: `Withdrew ${Math.floor(Number(formatEther(amount))).toLocaleString()} MORBIUS from previous contract`,
        duration: 5000,
      });
      refetch();
      if (onRefreshBalance) await onRefreshBalance();
    } catch (e: any) {
      const msg =
        e?.shortMessage ??
        (typeof e?.message === 'string' ? e.message : null) ??
        (e?.cause?.message ?? null) ??
        'Withdrawal failed';
      const reason = String(msg).slice(0, 120);
      const isStuck = /internal transaction awaiting|awaiting|stuck|pending.*nonce|nonce.*low|replacement fee/i.test(reason);
      toast.error(isStuck ? 'Transaction stuck or pending' : reason, {
        id: toastId,
        description: isStuck
          ? 'Clear the pending transaction in your wallet, then try again.'
          : undefined,
        duration: 8000,
      });
    }
  };

  // ── Re-up ──────────────────────────────────────────────────────────────
  const handleReup = async () => {
    if (!wsClient || !tableId || !reupAmount) return;
    let amountWei: bigint;
    try {
      amountWei = parseEther(reupAmount);
    } catch {
      toast.error('Invalid amount');
      return;
    }
    if (displayBalance != null && amountWei > displayBalance) {
      toast.error('Insufficient balance — deposit first');
      return;
    }
    setIsReupPending(true);
    try {
      const newState = await wsClient.pokerAddChips(tableId, amountWei.toString());
      if (newState && onReupSuccess) onReupSuccess(newState);
      toast.success(`Added ${reupAmount} MORBIUS to your stack`);
      setReupAmount('');
      if (isSelfManaged) fetchBalance();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add chips');
    } finally {
      setIsReupPending(false);
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────
  const maxDepositPLS = plsBalance ? Math.floor(Number(formatEther(plsBalance))) : 0;
  const maxDepositMORBIUS = morbiusBalance ? Math.floor(Number(formatEther(morbiusBalance))) : 0;
  const maxWithdraw =
    displayBalance != null
      ? Math.floor(Number(formatEther(displayBalance)))
      : contractReserve != null
        ? Math.floor(Number(formatEther(contractReserve)))
        : 0;
  const maxReup = displayBalance != null ? Math.floor(Number(formatEther(displayBalance))) : 0;

  const isDepositLoading = depositTx.isPending || depositMORBIISTx.isPending;
  const isLegacyWithdrawLoading = withdrawTx.isPending;
  const controlsDisabled = isDepositLoading || isPreparingWithdraw || isLegacyWithdrawLoading || externalWithdrawLock;

  const atTable = !!wsClient && !!tableId;
  const showReupTab = atTable && enablePokerReup;

  useEffect(() => {
    if (isOpen && tab === 'reup' && !showReupTab) setTab('deposit');
  }, [isOpen, tab, showReupTab]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'deposit', label: 'Deposit' },
    { id: 'withdraw', label: 'Withdraw' },
    ...(showReupTab ? [{ id: 'reup' as Tab, label: 'Re-up' }] : []),
    { id: 'history', label: 'History' },
  ];

  const hasLegacy = legacyItems.some((item) => item.reserve >= MIN_LEGACY_MORBIUS_WEI);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/20 backdrop-blur-md"
              onClick={onClose}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4"
            >
              <div className="bg-white text-gray-900 p-6 sm:p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md relative border border-gray-100 pointer-events-auto overflow-y-auto max-h-[90vh]">

                {/* Close */}
                <button
                  onClick={onClose}
                  className="absolute top-6 right-6 z-20 text-gray-400 hover:text-black bg-gray-100 p-2 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>

                <div className="relative min-h-[280px]">
                  {/* External lock overlay (withdrawal in flight from before page refresh) */}
                  {externalWithdrawLock && withdrawPhase === 'idle' && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[2.5rem] bg-white/90 backdrop-blur-sm">
                      <div className="text-center px-4">
                        <Loader2 className="w-10 h-10 animate-spin text-cyan-500 mx-auto mb-3" />
                        <p className="text-sm font-medium text-gray-900">Withdrawal in progress…</p>
                        <p className="text-xs text-gray-500 mt-1">Deposit and withdraw are disabled until it completes.</p>
                      </div>
                    </div>
                  )}

                  {/* Withdraw overlay */}
                  {(withdrawPhase !== 'idle' || isLegacyWithdrawLoading) && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[2.5rem] bg-white/90 backdrop-blur-sm">
                      <div className="text-center px-4">
                        {isLegacyWithdrawLoading && withdrawPhase === 'idle' ? (
                          <>
                            <Loader2 className="w-10 h-10 animate-spin text-cyan-500 mx-auto mb-3" />
                            <p className="text-sm font-medium text-gray-900">Withdrawing from previous contract...</p>
                          </>
                        ) : withdrawPhase === 'queued' ? (
                          <>
                            <Loader2 className="w-10 h-10 animate-spin text-cyan-500 mx-auto mb-3" />
                            <p className="text-sm font-medium text-gray-900">Processing withdrawal...</p>
                            <p className="text-xs text-gray-500 mt-1">Queued with server</p>
                          </>
                        ) : withdrawPhase === 'confirming' ? (
                          <>
                            <Loader2 className="w-10 h-10 animate-spin text-cyan-500 mx-auto mb-3" />
                            <p className="text-sm font-medium text-gray-900">Confirming on chain...</p>
                          </>
                        ) : withdrawPhase === 'success' ? (
                          <>
                            <Check className="w-10 h-10 text-green-500 mx-auto mb-3" />
                            <p className="text-sm font-medium text-gray-900">Withdrawal successful</p>
                          </>
                        ) : withdrawPhase === 'error' ? (
                          <>
                            <X className="w-10 h-10 text-red-500 mx-auto mb-3" />
                            <p className="text-sm font-medium text-gray-900">Withdrawal failed</p>
                            {withdrawError && <p className="text-xs text-gray-500 mt-1">{withdrawError}</p>}
                          </>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {/* Legacy panel toggle */}
                  {hasLegacy && (
                    <button
                      type="button"
                      onClick={() => setShowLegacyPanel((v) => !v)}
                      className="absolute bottom-4 left-4 text-xs text-gray-500 hover:text-cyan-500 transition-colors"
                    >
                      {showLegacyPanel ? 'Hide' : 'Previous contract'} withdrawals
                    </button>
                  )}

                  {/* Balance hero */}
                  <div className="text-center mt-4 mb-8">
                    <p className="text-sm text-gray-500 uppercase tracking-widest font-semibold mb-2">
                      {balanceLabel}
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <h4 className="text-5xl font-light tracking-tight text-gray-900">
                        {balanceLoading ? (
                          <Loader2 className="w-8 h-8 animate-spin text-gray-300 inline" />
                        ) : (
                          (displayBalance != null
                            ? Math.floor(Number(formatEther(displayBalance))).toLocaleString()
                            : '0')
                        )}
                      </h4>
                      {isSelfManaged && (
                        <button
                          onClick={fetchBalance}
                          disabled={balanceLoading}
                          className="text-gray-300 hover:text-gray-600 transition-colors mt-1"
                        >
                          <RefreshCw size={14} className={balanceLoading ? 'animate-spin' : ''} />
                        </button>
                      )}
                    </div>
                    <p className="text-gray-400 font-medium mt-1 inline-flex items-center gap-1">
                      <img src={MORBIUS_LOGO} alt="" className="w-4 h-4 object-contain" />
                      MORBIUS
                    </p>
                    {atTable && currentStack != null && (
                      <p className="text-xs text-gray-400 mt-2">
                        Table stack:{' '}
                        <span className="font-semibold text-gray-600">{fmt(currentStack)} MORBIUS</span>
                      </p>
                    )}
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-2 mb-6 bg-gray-50 p-1 rounded-2xl">
                    {tabs.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex-1 py-3 text-sm font-medium rounded-xl transition-all ${
                          tab === t.id
                            ? 'bg-white text-cyan-500 shadow-sm'
                            : 'text-gray-600 hover:text-black'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* ── Deposit ── */}
                  {tab === 'deposit' && (
                    <div className="space-y-4">
                      <div className="flex gap-2 bg-gray-50 p-1 rounded-xl">
                        <button
                          onClick={() => setDepositMethod('pls')}
                          disabled={controlsDisabled}
                          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                            depositMethod === 'pls' ? 'bg-white text-cyan-500 shadow-sm' : 'text-gray-500 hover:text-black'
                          }`}
                        >
                          <TokenLabel symbol="PLS" />
                        </button>
                        <button
                          onClick={() => setDepositMethod('morbius')}
                          disabled={controlsDisabled}
                          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                            depositMethod === 'morbius' ? 'bg-white text-cyan-500 shadow-sm' : 'text-gray-500 hover:text-black'
                          }`}
                        >
                          <TokenLabel symbol="MORBIUS" />
                        </button>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-sm font-medium text-gray-700">Amount</label>
                          <span className="text-xs text-gray-500">
                            {depositMethod === 'pls' ? (
                              <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5">
                                Avail: {maxDepositPLS.toLocaleString()} <TokenLabel symbol="PLS" size="sm" />
                                {depositAmount && plsEquivalent != null && plsEquivalent > 0n
                                  ? <> · ≈{Math.floor(Number(formatEther(plsEquivalent))).toLocaleString()} <TokenLabel symbol="PLS" size="sm" /></>
                                  : null}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                Avail: {maxDepositMORBIUS.toLocaleString()} <TokenLabel symbol="MORBIUS" size="sm" />
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder="0"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            min="0"
                            step="1"
                            disabled={controlsDisabled}
                            className="flex-1 w-full bg-white text-black/90 placeholder:text-black/30 border border-gray-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                          />
                          <button
                            onClick={() =>
                              setDepositAmount(
                                depositMethod === 'pls'
                                  ? maxDepositPLS.toString()
                                  : maxDepositMORBIUS.toString()
                              )
                            }
                            disabled={controlsDisabled}
                            className="px-4 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
                          >
                            MAX
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <button
                          onClick={depositMethod === 'pls' ? handleDepositPLS : handleDepositMORBIUS}
                          disabled={
                            controlsDisabled ||
                            !depositAmount ||
                            plsQuoteLoading ||
                            (depositMethod === 'morbius' && isLoadingAllowance) ||
                            (depositMethod === 'morbius' && isApproving) ||
                            depositPhase === 'confirming' ||
                            depositPhase === 'confirming_on_chain' ||
                            depositPhase === 'success'
                          }
                          className={`w-full py-4 text-sm font-medium rounded-xl flex items-center justify-center transition-colors disabled:cursor-not-allowed ${
                            depositPhase === 'error'
                              ? 'bg-red-100 text-red-700 hover:bg-red-200'
                              : depositPhase === 'success'
                                ? 'bg-green-600 text-white cursor-default'
                                : 'bg-black text-white hover:bg-gray-800 disabled:opacity-50'
                          }`}
                        >
                          {depositPhase === 'confirming' && (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Confirm in wallet...</>
                          )}
                          {depositPhase === 'confirming_on_chain' && (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Confirming...</>
                          )}
                          {depositPhase === 'success' && (
                            <><Check className="w-4 h-4 mr-2" />Deposit successful</>
                          )}
                          {depositPhase === 'error' && (
                            <><X className="w-4 h-4 mr-2" />{depositError ?? 'Error'}</>
                          )}
                          {depositPhase === 'idle' && (
                            <>
                              {isDepositLoading ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
                              ) : depositMethod === 'morbius' && isApproving ? (
                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Approving...</>
                              ) : depositMethod === 'morbius' && needsApproval ? (
                                'Approve MORBIUS'
                              ) : (
                                <>Deposit <span className="ml-1"><TokenLabel symbol={depositMethod === 'pls' ? 'PLS' : 'MORBIUS'} /></span></>
                              )}
                            </>
                          )}
                        </button>
                        {depositPhase !== 'idle' && depositPhase !== 'error' && (
                          <p className="text-xs text-center text-gray-500">
                            {depositPhase === 'confirming' && 'Approve the transaction in your wallet'}
                            {depositPhase === 'confirming_on_chain' &&
                              (depositBlockNumber != null
                                ? `${depositConfirmations}/${DEPOSIT_CONFIRMATIONS_REQUIRED} confirmations`
                                : 'Waiting for blockchain confirmation')}
                            {depositPhase === 'success' && 'Funds are now in your balance'}
                          </p>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 text-center mt-3">
                        Withdrawals capped at 1,000,000 <TokenLabel symbol="MORBIUS" size="sm" />/day.
                      </p>
                    </div>
                  )}

                  {/* ── Withdraw ── */}
                  {tab === 'withdraw' && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-sm font-medium text-gray-700">
                            Amount (<TokenLabel symbol="MORBIUS" size="sm" />)
                          </label>
                          <span className="text-xs text-gray-500">
                            Avail: {maxWithdraw.toLocaleString()} <TokenLabel symbol="MORBIUS" size="sm" />
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder="0"
                            value={withdrawAmount}
                            onChange={(e) => setWithdrawAmount(e.target.value)}
                            min="0"
                            step="1"
                            max={maxWithdraw}
                            disabled={controlsDisabled}
                            className="flex-1 w-full bg-white text-black/90 placeholder:text-black/50 border border-gray-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                          />
                          <button
                            onClick={() => setWithdrawAmount(maxWithdraw.toString())}
                            disabled={controlsDisabled}
                            className="px-4 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
                          >
                            MAX
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={handleWithdraw}
                        disabled={controlsDisabled || !withdrawAmount}
                        className="w-full py-4 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        {isPreparingWithdraw ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
                        ) : (
                          <>Withdraw <span className="ml-1"><TokenLabel symbol="MORBIUS" /></span></>
                        )}
                      </button>
                      <p className="text-[10px] text-gray-400 text-center mt-3">
                        Withdrawals capped at 1,000,000 <TokenLabel symbol="MORBIUS" size="sm" />/day.
                      </p>
                    </div>
                  )}

                  {/* ── Re-up (optional; disabled for cash poker MVP — leave table to change buy-in) ── */}
                  {tab === 'reup' && showReupTab && (
                    <div className="space-y-4">
                      <div className="bg-gray-50 rounded-2xl p-4 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Your balance</span>
                          <span className="font-semibold text-gray-900">
                            {maxReup.toLocaleString()} MORBIUS
                          </span>
                        </div>
                        {currentStack != null && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Current table stack</span>
                            <span className="font-semibold text-gray-900">{fmt(currentStack)} MORBIUS</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-sm font-medium text-gray-700">Add to stack (MORBIUS)</label>
                          <span className="text-xs text-gray-500">Max: {maxReup.toLocaleString()}</span>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder="0"
                            value={reupAmount}
                            onChange={(e) => setReupAmount(e.target.value)}
                            min="0"
                            step="1"
                            max={maxReup}
                            disabled={isReupPending}
                            className="flex-1 w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                          />
                          <button
                            onClick={() => setReupAmount(maxReup.toString())}
                            disabled={isReupPending}
                            className="px-4 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
                          >
                            MAX
                          </button>
                        </div>
                      </div>

                      <button
                        onClick={handleReup}
                        disabled={isReupPending || !reupAmount}
                        className="w-full py-4 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        {isReupPending ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding chips...</>
                        ) : (
                          'Add to Stack'
                        )}
                      </button>
                      <p className="text-[11px] text-gray-400 text-center">
                        Chips are added instantly. Takes effect next hand if one is in progress.
                      </p>
                    </div>
                  )}

                  {/* ── History ── */}
                  {tab === 'history' && (
                    <div className="border border-gray-100 rounded-2xl p-5">
                      <div className="flex justify-between items-center mb-4">
                        <h5 className="font-medium text-sm text-cyan-500">Last 50 transactions</h5>
                        <button
                          onClick={() => { setTxLoaded(false); setTxHistory([]); fetchTxHistory(); }}
                          disabled={txLoading}
                          className="text-gray-400 hover:text-black transition-colors"
                        >
                          <RefreshCw size={14} className={txLoading ? 'animate-spin' : ''} />
                        </button>
                      </div>
                      {txLoading && (
                        <div className="flex items-center justify-center py-8 text-sm text-gray-400 bg-gray-50 rounded-xl">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
                        </div>
                      )}
                      {txError && !txLoading && (
                        <p className="text-sm text-red-500 text-center py-4">{txError}</p>
                      )}
                      {!txLoading && !txError && txHistory.length === 0 && (
                        <div className="text-center py-8 text-sm text-gray-400 bg-gray-50 rounded-xl">
                          No transactions yet.
                        </div>
                      )}
                      {!txLoading && !txError && txHistory.length > 0 && (
                        <div className="space-y-3 max-h-[250px] overflow-y-auto pr-2">
                          {txHistory.map((tx, i) => {
                            const isDeposit = tx.type === 'deposit';
                            const morbius = Math.floor(
                              Number(formatEther(BigInt(tx.amount)))
                            ).toLocaleString();
                            const date = new Date(tx.created_at);
                            const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                            const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                            return (
                              <div
                                key={i}
                                className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                              >
                                <div className="flex items-center gap-3">
                                  <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                      isDeposit ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-600'
                                    }`}
                                  >
                                    {isDeposit ? <ArrowDownCircle size={16} /> : <ArrowUpCircle size={16} />}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-900">
                                      {isDeposit ? '+' : '−'}{morbius}{' '}
                                      <TokenLabel symbol="MORBIUS" size="sm" />
                                    </p>
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                      <span>{dateStr} · {timeStr}</span>
                                      {tx.tx_hash && (
                                        <CopyButton
                                          content={tx.tx_hash}
                                          copyToast="Copied to clipboard"
                                          variant="ghost"
                                          size="xs"
                                          className="h-5 w-5 p-0 text-gray-500 hover:text-gray-900"
                                          title="Copy transaction hash"
                                          aria-label="Copy transaction hash"
                                        />
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <span className="text-xs font-medium text-gray-400 capitalize">
                                  {tx.type}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Legacy panel ── */}
                  {showLegacyPanel &&
                    legacyItems
                      .filter((item) => item.reserve >= MIN_LEGACY_MORBIUS_WEI && !dismissedLegacy.has(item.address))
                      .length > 0 && (
                    <div className="mt-4 space-y-4">
                      {legacyItems
                        .filter((item) => item.reserve >= MIN_LEGACY_MORBIUS_WEI && !dismissedLegacy.has(item.address))
                        .map((item) => {
                          const maxAllowedWei = item.reserve > LEGACY_MAX_WITHDRAW_WEI ? LEGACY_MAX_WITHDRAW_WEI : item.reserve;
                          const rawInput = legacyWithdrawAmounts[item.address] ?? '';
                          let amountWei: bigint;
                          try {
                            amountWei = rawInput.trim() === '' ? maxAllowedWei : parseEther(rawInput);
                          } catch {
                            amountWei = 0n;
                          }
                          const validAmount = amountWei > 0n && amountWei <= item.reserve && amountWei <= LEGACY_MAX_WITHDRAW_WEI;
                          const setMax = () =>
                            setLegacyWithdrawAmounts((prev) => ({ ...prev, [item.address]: formatEther(maxAllowedWei) }));

                          return (
                            <div key={item.address} className="border border-gray-100 rounded-2xl p-5 bg-gray-50">
                              <div className="flex justify-between items-center mb-4">
                                <h5 className="font-medium text-sm text-gray-900">{item.label}</h5>
                                <button
                                  onClick={() => setDismissedLegacy((prev) => new Set(prev).add(item.address))}
                                >
                                  <X size={14} className="text-gray-400 hover:text-black transition-colors" />
                                </button>
                              </div>
                              <div className="flex justify-between items-center mb-2">
                                <span className="text-xs text-gray-500 font-medium">
                                  Balance: {Math.floor(Number(formatEther(item.reserve))).toLocaleString()}{' '}
                                  <TokenLabel symbol="MORBIUS" size="sm" />
                                </span>
                                {item.paused && <span className="text-[10px] font-medium text-red-500">Paused</span>}
                              </div>
                              <div className="flex gap-2 mb-3">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder={formatEther(maxAllowedWei)}
                                  value={rawInput}
                                  onChange={(e) =>
                                    setLegacyWithdrawAmounts((prev) => ({ ...prev, [item.address]: e.target.value }))
                                  }
                                  disabled={controlsDisabled}
                                  className="flex-1 w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                                />
                                <button
                                  type="button"
                                  onClick={setMax}
                                  disabled={controlsDisabled}
                                  className="px-4 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50"
                                >
                                  MAX
                                </button>
                              </div>
                              <div className="flex justify-between items-center">
                                <p className="text-xs text-gray-500">Max 1M / tx</p>
                                <button
                                  onClick={() => validAmount && handleWithdrawLegacy(item.address, amountWei, item.refetch)}
                                  disabled={item.paused || controlsDisabled || !validAmount}
                                  className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                                >
                                  {isLegacyWithdrawLoading
                                    ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing...</>
                                    : 'Withdraw'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}

                  {/* Report */}
                  <div className="mt-6 pt-3 pb-3 flex justify-center">
                    <button
                      type="button"
                      onClick={() => setReportOpen(true)}
                      className="flex items-center gap-1.5 text-xs text-red-500 hover:text-gray-700"
                    >
                      <Flag size={12} />
                      Report
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <CustomApprovalModal
        open={showApprovalModal}
        onOpenChange={setShowApprovalModal}
        onApprove={(amount) => approve(amount)}
        isApproving={isApproving}
        tokenSymbol="MORBIUS"
        spenderName="Blackjack Contract"
      />

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        balance={displayBalance ?? undefined}
      />
    </>
  );
}
