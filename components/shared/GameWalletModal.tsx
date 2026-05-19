'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, ArrowDownCircle, ArrowUpCircle, RefreshCw, Check, Flag } from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';
import { useAccount, usePublicClient } from 'wagmi';
import { parseEther, formatEther, WaitForTransactionReceiptTimeoutError } from 'viem';
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
import { getBlackjackServerUrlOptional } from '@/lib/api-urls';
import { apiFetch } from '@/lib/api-auth';
import { CustomApprovalModal } from '@/components/BLACKJACK/CustomApprovalModal';
import { ReportModal } from '@/components/shared/ReportModal';
import { toast } from 'sonner';
import type { BlackjackWebSocketClient, PokerTableState } from '@/lib/websocket-client';
import { HOW_TO_DEPOSIT_VIDEO_URL, HOW_TO_WITHDRAW_VIDEO_URL } from '@/lib/how-to-video-urls';
import { formatChips, parseChipInput } from '@/lib/format-poker-chips';

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

/** Full-screen overlay + video — portaled above wallet modal; video only mounts when open. */
function WalletHowToVideoModal({
  kind,
  onClose,
}: {
  kind: 'deposit' | 'withdraw';
  onClose: () => void;
}) {
  const title = kind === 'deposit' ? 'How to deposit' : 'How to withdraw';
  const src = kind === 'deposit' ? HOW_TO_DEPOSIT_VIDEO_URL : HOW_TO_WITHDRAW_VIDEO_URL;

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wallet-how-to-video-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative z-[1] w-full max-w-lg rounded-2xl border-2 border-cyan-500/30 bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl overflow-hidden p-4 sm:p-5"
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 id="wallet-how-to-video-title" className="text-sm font-semibold text-white">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <video
          key={src}
          className="w-full max-h-[min(52vh,380px)] rounded-lg bg-black/50 object-contain"
          controls
          playsInline
          preload="metadata"
          src={src}
        />
      </div>
    </div>,
    document.body
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

type Tab = 'deposit' | 'withdraw' | 'reup' | 'history';
type DepositMethod = 'pls' | 'morbius';
type DepositPhase = 'idle' | 'confirming' | 'confirming_on_chain' | 'crediting' | 'success' | 'error';
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
  defaultTab?: Tab;

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
/** Default viem receipt wait is 3 minutes — too short for congested mempools; match long wallet pending windows. */
const DEPOSIT_RECEIPT_WAIT_MS = 48 * 60 * 60 * 1000; // 48h
const PENDING_BJ_DEPOSIT_KEY = 'morblotto_bj_pending_deposit_v1';

type PendingDepositStorage = {
  walletAddress: string;
  txHash: `0x${string}`;
  submittedAt: number;
};

function readPendingDepositFromStorage(): PendingDepositStorage | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_BJ_DEPOSIT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingDepositStorage;
    if (
      typeof p.walletAddress === 'string' &&
      typeof p.txHash === 'string' &&
      p.txHash.startsWith('0x') &&
      p.txHash.length === 66
    ) {
      return { ...p, txHash: p.txHash as `0x${string}` };
   }
    return null;
  } catch {
    return null;
  }
}

function savePendingDepositToStorage(walletAddress: string, txHash: `0x${string}`) {
  if (typeof sessionStorage === 'undefined') return;
  const payload: PendingDepositStorage = {
    walletAddress: walletAddress.toLowerCase(),
    txHash,
    submittedAt: Date.now(),
  };
  sessionStorage.setItem(PENDING_BJ_DEPOSIT_KEY, JSON.stringify(payload));
}

function clearPendingDepositStorage() {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(PENDING_BJ_DEPOSIT_KEY);
}

const LEGACY_MAX_WITHDRAW_WEI = BigInt(1_000_000) * BigInt(1e18);
const MIN_LEGACY_MORBIUS_WEI = BigInt(500) * BigInt(1e18);

export function GameWalletModal({
  isOpen,
  onClose,
  defaultTab = 'deposit',
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
  const serverUrl = getBlackjackServerUrlOptional();

  // ── Self-managed balance (used when externalBalance is not provided) ─────
  const [internalBalance, setInternalBalance] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const isSelfManaged = externalBalance === undefined;

  const fetchBalance = useCallback(async () => {
    if (!address || !isSelfManaged || !serverUrl) return;
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

  // Direct server balance fetch — used by the post-deposit credit poll to compare against
  // pre-deposit balance without depending on React rendering timing of `displayBalance`.
  const fetchServerBalanceDirect = useCallback(async (): Promise<bigint | null> => {
    if (!address || !serverUrl) return null;
    try {
      const res = await fetch(`${serverUrl}/api/player/${address}/balance`, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      return BigInt(data.balance ?? '0');
    } catch {
      return null;
    }
  }, [address, serverUrl]);

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
  const [pokerChipBalanceStr, setPokerChipBalanceStr] = useState('0');

  // ── Phase states ───────────────────────────────────────────────────────
  const [depositPhase, setDepositPhase] = useState<DepositPhase>('idle');
  const [depositError, setDepositError] = useState<string | null>(null);
  const [depositBlockNumber, setDepositBlockNumber] = useState<bigint | null>(null);
  const [depositConfirmations, setDepositConfirmations] = useState(0);
  const [depositTxHash, setDepositTxHash] = useState<string | null>(null);
  const [depositNotifyAmountWei, setDepositNotifyAmountWei] = useState<bigint | null>(null);
  const depositToastIdRef = useRef<string | number | null>(null);
  /** Bumps when deposit resume effect cleans up so in-flight async from Strict Mode / re-open does not apply stale state. */
  const resumeDepositGenRef = useRef(0);

  const [withdrawPhase, setWithdrawPhase] = useState<WithdrawPhase>('idle');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawTxHash, setWithdrawTxHash] = useState<string | null>(null);
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
  const [howToVideo, setHowToVideo] = useState<'deposit' | 'withdraw' | null>(null);

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
      setHowToVideo(null);
    } else {
      setTab(defaultTab);
      if (isSelfManaged) fetchBalance();
      setTxLoaded(false);
      setTxHistory([]);
      setTxError(null);
    }
  }, [isOpen, defaultTab]);

  // ── Approval success ───────────────────────────────────────────────────
  useEffect(() => {
    if (isApprovalSuccess) {
      toast.success('Approval successful — you can now deposit MORBIUS');
      setShowApprovalModal(false);
    }
  }, [isApprovalSuccess]);

  // Resume a submitted deposit after mempool delay / tab close (tx hash persisted in sessionStorage).
  useEffect(() => {
    if (!isOpen || !address || !publicClient) return;
    const pending = readPendingDepositFromStorage();
    if (!pending || pending.walletAddress.toLowerCase() !== address.toLowerCase()) return;

    const gen = ++resumeDepositGenRef.current;
    let cancelled = false;

    const run = async () => {
      try {
        const tid = toast.loading('Resuming deposit — waiting for blockchain…', {
          description: 'If your transaction was delayed, this can take a while.',
        });
        depositToastIdRef.current = tid;
        setDepositPhase('confirming_on_chain');
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: pending.txHash,
          timeout: DEPOSIT_RECEIPT_WAIT_MS,
        });
        if (cancelled || gen !== resumeDepositGenRef.current) return;
        if (receipt.status === 'reverted') {
          clearPendingDepositStorage();
          toast.error('Deposit transaction reverted', { id: tid });
          setDepositPhase('idle');
          return;
        }
        const finalHash = receipt.transactionHash;
        setDepositTxHash(finalHash);
        setDepositNotifyAmountWei(0n);
        setDepositBlockNumber(receipt.blockNumber);
        setDepositConfirmations(0);
        toast.loading('Confirming…', { id: tid, description: '0/3 confirmations' });
      } catch (e) {
        if (cancelled || gen !== resumeDepositGenRef.current) return;
        if (e instanceof WaitForTransactionReceiptTimeoutError) {
          toast.message('Deposit still pending', {
            description:
              'The network is slow or your wallet is still queuing the transaction. Reopen this dialog later — we will resume automatically when the tx is submitted from this browser.',
            duration: 12_000,
          });
        } else {
          toast.error('Could not resume deposit', {
            description: e instanceof Error ? e.message : undefined,
          });
          clearPendingDepositStorage();
        }
        setDepositPhase('idle');
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, address, publicClient]);

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
          const notifyResult = await notifyDeposit(depositTxHash, depositNotifyAmountWei);
          if (notifyResult.ok) {
            clearPendingDepositStorage();

            // The server's `/api/deposit/notify` only records a pending deposit — the actual
            // DB balance credit happens async after additional on-chain confirmations on the
            // backend. Showing "Deposit successful" here is premature: there's a ~15s window
            // where the user's balance hasn't updated yet and they have no idea why.
            //
            // Move to a `crediting` phase, then poll the server balance until it actually
            // increases (or we time out). This auto-refreshes the UI without the user having
            // to refresh manually.
            if (depositToastIdRef.current != null) {
              toast.loading('Crediting your balance…', {
                id: depositToastIdRef.current,
                description: 'This usually takes ~15 seconds',
              });
            }
            setDepositPhase('crediting');
            setDepositAmount('');
            setDepositBlockNumber(null);
            setDepositTxHash(null);

            const initialBalance = (await fetchServerBalanceDirect()) ?? 0n;
            const startedAt = Date.now();
            const CREDIT_TIMEOUT_MS = 60_000;
            const CREDIT_POLL_MS = 2_000;
            let credited = false;

            while (Date.now() - startedAt < CREDIT_TIMEOUT_MS) {
              await new Promise<void>((r) => setTimeout(r, CREDIT_POLL_MS));

              // Trigger parent UI refetch so its displayed balance updates too.
              try {
                if (onBalanceSync) await onBalanceSync();
                else if (onRefreshBalance) await onRefreshBalance();
                else if (isSelfManaged) await fetchBalance();
              } catch {
                // ignore — we'll still check via direct fetch
              }

              const latest = await fetchServerBalanceDirect();
              if (latest != null && latest > initialBalance) {
                credited = true;
                break;
              }
            }

            setDepositNotifyAmountWei(null);

            if (credited) {
              if (depositToastIdRef.current != null) {
                toast.success('Deposit successful', {
                  id: depositToastIdRef.current,
                  description: 'Funds are now in your balance.',
                  duration: 5000,
                });
              }
              setDepositPhase('success');
              setTimeout(() => setDepositPhase('idle'), 2000);
            } else {
              if (depositToastIdRef.current != null) {
                toast.message('Deposit recorded', {
                  id: depositToastIdRef.current,
                  description: 'Your balance is taking longer than usual to update. Refresh in a moment if it doesn’t appear.',
                  duration: 8000,
                });
              }
              setDepositPhase('idle');
            }
            return;
          } else if (notifyResult.ok === false) {
            const { status, message } = notifyResult;
            if (status >= 400 && status < 500) {
              if (depositToastIdRef.current != null) {
                toast.error('Could not record deposit', {
                  id: depositToastIdRef.current,
                  description: message,
                  duration: 8000,
                });
              }
              setDepositPhase('error');
              setDepositError(message);
              return;
            }
            return;
          }
        }
      } catch {
        // ignore RPC errors, retry next tick
      }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [depositBlockNumber, depositPhase, publicClient, depositTxHash, depositNotifyAmountWei, fetchServerBalanceDirect, onBalanceSync, onRefreshBalance, isSelfManaged, fetchBalance]);

  // ── Tx history ─────────────────────────────────────────────────────────
  const fetchTxHistory = useCallback(async () => {
    if (!address || !serverUrl) return;
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
  const notifyDeposit = async (
    txHash: string,
    amountWei: bigint,
  ): Promise<{ ok: true } | { ok: false; status: number; message: string }> => {
    if (!address) return { ok: false, status: 0, message: 'Wallet not connected' };
    if (!serverUrl) {
      return { ok: false, status: 0, message: 'Backend URL not configured (NEXT_PUBLIC_API_URL).' };
    }
    try {
      // apiFetch sends the SIWE session cookie and auto-prompts a sign-in
      // wallet popup on 401, then retries once. walletAddress is no longer
      // sent in the body — the server reads it from the session.
      await apiFetch('/api/deposit/notify', {
        method: 'POST',
        body: JSON.stringify({ txHash, amount: amountWei.toString() }),
      });
      setTxLoaded(false);
      return { ok: true };
    } catch (e) {
      const err = e as Error & { status?: number };
      return {
        ok: false,
        status: err.status ?? 0,
        message: err.message ?? 'Network error',
      };
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
      savePendingDepositToStorage(address, txHash);
      setDepositPhase('confirming_on_chain');
      toast.loading('Confirming...', {
        id: toastId,
        description: 'Waiting for block inclusion (can take a long time if the network is busy).',
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: DEPOSIT_RECEIPT_WAIT_MS,
      });
      if (receipt.status === 'reverted') throw new Error('Transaction reverted on-chain.');
      const finalHash = receipt.transactionHash;
      setDepositTxHash(finalHash);
      setDepositNotifyAmountWei(plsEquivalent);
      setDepositBlockNumber(receipt.blockNumber);
      setDepositConfirmations(0);
      toast.loading('Confirming...', { id: toastId, description: '0/3 confirmations' });
    } catch (err: any) {
      if (err instanceof WaitForTransactionReceiptTimeoutError) {
        toast.message('Deposit still pending', {
          id: toastId,
          description:
            'Your transaction is taking longer than usual. You can close this window; reopen Deposit to resume, or wait here.',
          duration: 12_000,
        });
        setDepositPhase('idle');
        setTimeout(() => { setDepositError(null); }, 4000);
        return;
      }
      clearPendingDepositStorage();
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
      savePendingDepositToStorage(address, txHash);
      setDepositPhase('confirming_on_chain');
      toast.loading('Confirming...', {
        id: toastId,
        description: 'Waiting for block inclusion (can take a long time if the network is busy).',
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: DEPOSIT_RECEIPT_WAIT_MS,
      });
      if (receipt.status === 'reverted') throw new Error('Transaction reverted on-chain.');
      const finalHash = receipt.transactionHash;
      setDepositTxHash(finalHash);
      setDepositNotifyAmountWei(amountWei);
      setDepositBlockNumber(receipt.blockNumber);
      setDepositConfirmations(0);
      toast.loading('Confirming...', { id: toastId, description: '0/3 confirmations' });
    } catch (err: any) {
      if (err instanceof WaitForTransactionReceiptTimeoutError) {
        toast.message('Deposit still pending', {
          id: toastId,
          description:
            'Your transaction is taking longer than usual. You can close this window; reopen Deposit to resume, or wait here.',
          duration: 12_000,
        });
        setDepositPhase('idle');
        setTimeout(() => { setDepositError(null); }, 4000);
        return;
      }
      if (err?.message?.includes('allowance') || err?.message?.includes('ERC20')) {
        clearPendingDepositStorage();
        setDepositPhase('idle');
        toast.error('Approval required', { id: toastId, description: 'Please approve MORBIUS spending first' });
        setShowApprovalModal(true);
      } else {
        clearPendingDepositStorage();
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
    if (!serverUrl) {
      toast.error('Backend not configured', { id: toastId, description: 'Set NEXT_PUBLIC_API_URL and redeploy.' });
      setWithdrawPhase('idle');
      setWithdrawError(null);
      return;
    }
    for (let i = 0; i < 120; i++) {
      const statusRes = await fetch(`${serverUrl}/api/withdraw/status/${jobId}`);
      const statusData = await statusRes.json();
      if (!statusRes.ok) throw new Error(statusData.error || 'Failed to get status');
      const { status, txHash } = statusData;
      if (status === 'completed') {
        setWithdrawPhase('success');
        if (typeof txHash === 'string' && txHash.length > 0) setWithdrawTxHash(txHash);
        toast.success('Withdrawal successful!', {
          id: toastId,
          description: txHash ? `Tx: ${txHash}` : 'Sent to your wallet.',
          descriptionClassName: txHash ? 'break-all font-mono text-[11px] leading-snug' : undefined,
        });
        if (onRefreshBalance) await onRefreshBalance();
        else if (isSelfManaged) await fetchBalance();
        if (onWithdrawSuccess) await Promise.resolve(onWithdrawSuccess());
        setWithdrawAmount('');
        setTxLoaded(false);
        await new Promise((r) => setTimeout(r, 2000));
        setWithdrawPhase('idle');
        setWithdrawTxHash(null);
        return;
      }
      if (status === 'failed') {
        setWithdrawPhase('error');
        setWithdrawTxHash(null);
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
        setWithdrawTxHash(txHash);
        toast.loading('Confirming on chain...', {
          id: toastId,
          description: `Tx: ${txHash}`,
          descriptionClassName: 'break-all font-mono text-[11px] leading-snug',
        });
      } else {
        toast.loading('Processing withdrawal...', { id: toastId });
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    setWithdrawPhase('error');
    setWithdrawTxHash(null);
    setWithdrawError('Withdrawal timed out. Contact support.');
    toast.error('Withdrawal timed out', { id: toastId });
    if (onRefreshBalance) await onRefreshBalance();
    else if (isSelfManaged) await fetchBalance();
    setTimeout(() => { setWithdrawPhase('idle'); setWithdrawError(null); }, 4000);
  }, [serverUrl, onRefreshBalance, isSelfManaged, onWithdrawSuccess, fetchBalance]);

  // ── Resume in-progress withdrawal after page refresh ───────────────────
  useEffect(() => {
    if (!isOpen || !address || !serverUrl) return;
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
  }, [isOpen, address, serverUrl, pollWithdrawJob]);

  // ── Withdraw ───────────────────────────────────────────────────────────
  const handleWithdraw = async () => {
    if (!withdrawAmount || !address) return;
    if (!serverUrl) {
      toast.error('Backend URL not configured', { description: 'Set NEXT_PUBLIC_API_URL in Vercel and redeploy.' });
      return;
    }
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
    setWithdrawTxHash(null);
    setWithdrawPhase('queued');
    setIsPreparingWithdraw(true);
    const toastId = toast.loading('Withdrawal queued...');
    try {
      // apiFetch sends the SIWE session cookie and auto-prompts a sign-in
      // wallet popup on 401, then retries once. address is no longer sent in
      // the body — the server reads it from the session.
      const res = await apiFetch('/api/withdraw', {
        method: 'POST',
        body: JSON.stringify({ amount: amountWei.toString() }),
      });
      const data = await res.json();
      const jobId = data.jobId;
      if (!jobId) throw new Error('Server did not return jobId');
      await pollWithdrawJob(jobId, toastId);
    } catch (err: any) {
      setWithdrawPhase('error');
      setWithdrawTxHash(null);
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

  // ── Re-up (poker chip wallet → table stack) ─────────────────────────────
  const atTable = !!wsClient && !!tableId;
  const showReupTab = atTable && enablePokerReup;

  useEffect(() => {
    if (!isOpen || !showReupTab || !address || !serverUrl) return;
    if (tab !== 'reup') return;
    fetch(`${serverUrl}/api/poker/chips/balance?address=${encodeURIComponent(address.toLowerCase())}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.balance != null) setPokerChipBalanceStr(String(data.balance));
      })
      .catch(() => {});
  }, [isOpen, showReupTab, tab, address, serverUrl]);

  const maxReupChipsNum = (() => {
    try {
      const b = BigInt(pokerChipBalanceStr || '0');
      if (b > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
      return Number(b);
    } catch {
      return 0;
    }
  })();

  const handleReup = async () => {
    if (!wsClient || !tableId || !reupAmount) return;
    const chipsStr = parseChipInput(reupAmount);
    if (chipsStr === '0') {
      toast.error('Enter a whole number of chips');
      return;
    }
    let amountChips: bigint;
    try {
      amountChips = BigInt(chipsStr);
    } catch {
      toast.error('Invalid amount');
      return;
    }
    const walletChips = BigInt(pokerChipBalanceStr || '0');
    if (amountChips > walletChips) {
      toast.error('Insufficient poker chips — buy chips from your MORBIUS balance first');
      return;
    }
    setIsReupPending(true);
    try {
      const newState = await wsClient.pokerAddChips(tableId, chipsStr);
      if (newState && onReupSuccess) onReupSuccess(newState);
      toast.success(`Added ${formatChips(chipsStr)} chips to your stack`);
      setReupAmount('');
      setPokerChipBalanceStr((prev) => {
        try {
          const next = walletChips - amountChips;
          return next < 0n ? '0' : next.toString();
        } catch {
          return prev;
        }
      });
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

  const isDepositLoading = depositTx.isPending || depositMORBIISTx.isPending;
  const isLegacyWithdrawLoading = withdrawTx.isPending;
  const controlsDisabled = isDepositLoading || isPreparingWithdraw || isLegacyWithdrawLoading || externalWithdrawLock;

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
                            {withdrawTxHash && (
                              <p className="text-xs text-gray-600 mt-3 font-mono break-all text-left max-w-full px-1">
                                Tx: {withdrawTxHash}
                              </p>
                            )}
                          </>
                        ) : withdrawPhase === 'success' ? (
                          <>
                            <Check className="w-10 h-10 text-green-500 mx-auto mb-3" />
                            <p className="text-sm font-medium text-gray-900">Withdrawal successful</p>
                            {withdrawTxHash && (
                              <p className="text-xs text-gray-600 mt-3 font-mono break-all text-left max-w-full px-1">
                                Tx: {withdrawTxHash}
                              </p>
                            )}
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
                            depositPhase === 'crediting' ||
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
                          {depositPhase === 'crediting' && (
                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Crediting balance...</>
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
                            {depositPhase === 'crediting' && 'Updating your balance — usually ~15s'}
                            {depositPhase === 'success' && 'Funds are now in your balance'}
                          </p>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 text-center mt-3">
                        Withdrawals capped at 1,000,000 <TokenLabel symbol="MORBIUS" size="sm" />/day.
                      </p>
                      <p className="text-[10px] text-center">
                        <button
                          type="button"
                          onClick={() => setHowToVideo('deposit')}
                          className="text-gray-500 hover:text-cyan-600 underline underline-offset-2 transition-colors"
                        >
                          How to deposit
                        </button>
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
                      <p className="text-[10px] text-center">
                        <button
                          type="button"
                          onClick={() => setHowToVideo('withdraw')}
                          className="text-gray-500 hover:text-cyan-600 underline underline-offset-2 transition-colors"
                        >
                          How to withdraw
                        </button>
                      </p>
                    </div>
                  )}

                  {/* ── Re-up (optional; disabled for cash poker MVP — leave table to change buy-in) ── */}
                  {tab === 'reup' && showReupTab && (
                    <div className="space-y-4">
                      <div className="bg-gray-50 rounded-2xl p-4 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Poker chip wallet</span>
                          <span className="font-semibold text-gray-900">
                            {formatChips(pokerChipBalanceStr)} chips
                          </span>
                        </div>
                        {currentStack != null && (
                          <div className="flex justify-between">
                            <span className="text-gray-500">Current table stack</span>
                            <span className="font-semibold text-gray-900">{formatChips(currentStack)} chips</span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-sm font-medium text-gray-700">Add to stack (whole chips)</label>
                          <span className="text-xs text-gray-500">Max: {formatChips(pokerChipBalanceStr)}</span>
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder="0"
                            value={reupAmount}
                            onChange={(e) => setReupAmount(e.target.value)}
                            min="0"
                            step="1"
                            max={maxReupChipsNum}
                            disabled={isReupPending}
                            className="flex-1 w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                          />
                          <button
                            onClick={() => setReupAmount(pokerChipBalanceStr || '0')}
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
                        Re-ups are available between hands and apply to your next deal immediately.
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

      {howToVideo ? (
        <WalletHowToVideoModal kind={howToVideo} onClose={() => setHowToVideo(null)} />
      ) : null}

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
