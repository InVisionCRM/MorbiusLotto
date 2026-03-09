'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Loader2, ArrowDownCircle, ArrowUpCircle, RefreshCw, Copy, Check, Flag } from 'lucide-react';
import { useAccount, usePublicClient } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { useBlackjackContract } from '@/hooks/use-blackjack-contract';
import { useTokenApproval } from '@/hooks/use-token-approval';
import { useTokenBalance } from '@/hooks/use-token';
import { useNativeBalance } from '@/hooks/use-native-balance';
import { usePlsQuote } from '@/hooks/use-pls-quote';
import { BLACKJACK_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { getBlackjackServerUrl } from '@/lib/api-urls';
import { CustomApprovalModal } from '@/components/BLACKJACK/CustomApprovalModal';
import { ReportModal } from '@/components/shared/ReportModal';
import { toast } from 'sonner';
import type { BlackjackWebSocketClient, PokerTableState } from '@/lib/websocket-client';

interface PokerDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** WebSocket client — required for Re-up tab */
  wsClient?: BlackjackWebSocketClient | null;
  /** Current table ID — required for Re-up tab */
  tableId?: string;
  /** Current seat stack in wei — for display on Re-up tab */
  currentStack?: string;
  /** Called with new state after a successful re-up */
  onReupSuccess?: (state: PokerTableState) => void;
}

type Tab = 'deposit' | 'withdraw' | 'reup' | 'history';
type DepositMethod = 'pls' | 'morbius';

function fmt(wei: string | bigint | undefined | null): string {
  if (wei == null || wei === '') return '0';
  try {
    const n = Number(formatEther(BigInt(wei.toString())));
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  } catch {
    return '0';
  }
}

interface TxHistoryItem {
  type: 'deposit' | 'withdrawal';
  amount: string;
  status: string;
  tx_hash: string | null;
  created_at: string;
}

export function PokerDepositModal({
  isOpen,
  onClose,
  wsClient,
  tableId,
  currentStack,
  onReupSuccess,
}: PokerDepositModalProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();

  const [tab, setTab] = useState<Tab>('deposit');
  const [depositMethod, setDepositMethod] = useState<DepositMethod>('pls');

  // Input values (in MORBIUS, human-readable)
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [reupAmount, setReupAmount] = useState('');

  // Loading states
  const [isPreparingWithdraw, setIsPreparingWithdraw] = useState(false);
  const [isReupPending, setIsReupPending] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);

  // Off-chain balance (fetched from server, in wei)
  const [offChainBalance, setOffChainBalance] = useState<bigint | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Tx history
  const [txHistory, setTxHistory] = useState<TxHistoryItem[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState<string | null>(null);
  const [txLoaded, setTxLoaded] = useState(false);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const [reportOpen, setReportOpen] = useState(false);

  const serverUrl = getBlackjackServerUrl();

  // ── Wallet balances ─────────────────────────────────────────────────────────
  const { balance: morbiusBalance } = useTokenBalance(address);
  const { balance: plsBalance } = useNativeBalance(address ?? undefined);

  const { plsValue: plsEquivalent, isLoading: plsQuoteLoading } = usePlsQuote({
    morbiusCost: depositAmount ? parseEther(depositAmount) : 0n,
    enabled: tab === 'deposit' && depositMethod === 'pls' && depositAmount !== '',
  });

  const requiredMorbiusAmount = depositAmount && depositMethod === 'morbius'
    ? parseEther(depositAmount)
    : 0n;

  const { needsApproval, approve, isApproving, isLoadingAllowance, isApprovalSuccess } =
    useTokenApproval({
      tokenAddress: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
      spenderAddress: BLACKJACK_ADDRESS as `0x${string}`,
      requiredAmount: requiredMorbiusAmount,
      userAddress: address,
      enabled: tab === 'deposit' && depositMethod === 'morbius' && !!depositAmount && !!address,
      defaultToUnlimited: true,
    });

  useEffect(() => {
    if (isApprovalSuccess) {
      toast.success('Approval successful — you can now deposit MORBIUS');
      setShowApprovalModal(false);
    }
  }, [isApprovalSuccess]);

  const { depositTx, depositMORBIISTx, deposit, depositMORBIUS } = useBlackjackContract();

  // ── Fetch off-chain balance ──────────────────────────────────────────────────
  const fetchBalance = useCallback(async () => {
    if (!address) return;
    setBalanceLoading(true);
    try {
      const res = await fetch(`${serverUrl}/api/player/${address}/balance`);
      if (!res.ok) throw new Error('Failed to fetch balance');
      const data = await res.json();
      setOffChainBalance(BigInt(data.balance ?? '0'));
    } catch {
      // leave balance as null — display will show 0
    } finally {
      setBalanceLoading(false);
    }
  }, [address, serverUrl]);

  useEffect(() => {
    if (isOpen) {
      fetchBalance();
      setTxLoaded(false);
      setTxHistory([]);
      setTxError(null);
    }
  }, [isOpen, fetchBalance]);

  // ── Tx history ───────────────────────────────────────────────────────────────
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

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash).catch(() => {});
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  // ── Notify deposit ───────────────────────────────────────────────────────────
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

  // ── Deposit PLS ──────────────────────────────────────────────────────────────
  const handleDepositPLS = async () => {
    if (!depositAmount || !plsEquivalent || !publicClient) return;
    const toastId = toast.loading('Confirm in wallet…', {
      description: `Depositing ${depositAmount} MORBIUS worth of PLS`,
    });
    try {
      const txHash = await deposit(plsEquivalent);
      toast.loading('Waiting for confirmation…', { id: toastId });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === 'reverted') throw new Error('Transaction reverted on-chain');
      toast.success('Deposit successful!', {
        id: toastId,
        description: `Deposited ${depositAmount} MORBIUS worth of PLS`,
        duration: 5000,
      });
      notifyDeposit(txHash, plsEquivalent);
      setDepositAmount('');
      setTimeout(fetchBalance, 3000);
    } catch (err: any) {
      const isCancel = err?.message?.includes('rejected') || err?.message?.includes('denied');
      toast.error(isCancel ? 'Transaction cancelled' : 'Deposit failed', {
        id: toastId,
        description: isCancel ? undefined : (err?.message || 'Unknown error'),
      });
    }
  };

  // ── Deposit MORBIUS ──────────────────────────────────────────────────────────
  const handleDepositMORBIUS = async () => {
    if (!depositAmount || !publicClient) return;
    if (needsApproval) { setShowApprovalModal(true); return; }
    const amountWei = parseEther(depositAmount);
    const toastId = toast.loading('Confirm in wallet…', {
      description: `Depositing ${depositAmount} MORBIUS`,
    });
    try {
      const txHash = await depositMORBIUS(amountWei);
      toast.loading('Waiting for confirmation…', { id: toastId });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      if (receipt.status === 'reverted') throw new Error('Transaction reverted on-chain');
      toast.success('Deposit successful!', {
        id: toastId,
        description: `Deposited ${depositAmount} MORBIUS`,
        duration: 5000,
      });
      notifyDeposit(txHash, amountWei);
      setDepositAmount('');
      setTimeout(fetchBalance, 3000);
    } catch (err: any) {
      const isCancel = err?.message?.includes('rejected') || err?.message?.includes('denied');
      toast.error(isCancel ? 'Transaction cancelled' : 'Deposit failed', {
        id: toastId,
        description: isCancel ? undefined : (err?.message || 'Unknown error'),
      });
    }
  };

  // ── Withdraw ─────────────────────────────────────────────────────────────────
  const handleWithdraw = async () => {
    if (!withdrawAmount || !address) return;
    let amountWei: bigint;
    try {
      amountWei = parseEther(withdrawAmount);
    } catch {
      toast.error('Invalid amount');
      return;
    }
    if (offChainBalance != null && amountWei > offChainBalance) {
      toast.error('Insufficient balance');
      return;
    }
    setIsPreparingWithdraw(true);
    const toastId = toast.loading('Withdrawal queued…');
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

      for (let i = 0; i < 120; i++) {
        const statusRes = await fetch(`${serverUrl}/api/withdraw/status/${jobId}`);
        const statusData = await statusRes.json();
        if (!statusRes.ok) throw new Error(statusData.error || 'Failed to get status');
        const { status, txHash } = statusData;
        if (status === 'completed') {
          toast.success('Withdrawal sent!', {
            id: toastId,
            description: txHash ? `Tx: ${txHash.slice(0, 10)}…` : 'Sent to your wallet.',
          });
          setWithdrawAmount('');
          setTxLoaded(false);
          await fetchBalance();
          return;
        }
        if (status === 'failed') {
          toast.error('Withdrawal failed', {
            id: toastId,
            description: statusData.error || 'Transaction failed.',
          });
          await fetchBalance();
          return;
        }
        if (status === 'pending_confirmation' && txHash) {
          toast.loading('Confirming on chain…', { id: toastId, description: `Tx: ${txHash.slice(0, 10)}…` });
        } else {
          toast.loading('Processing withdrawal…', { id: toastId });
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      toast.error('Withdrawal timed out', { id: toastId });
      await fetchBalance();
    } catch (err: any) {
      toast.error('Withdrawal failed', { id: toastId, description: err?.message });
      await fetchBalance();
    } finally {
      setIsPreparingWithdraw(false);
    }
  };

  // ── Re-up ─────────────────────────────────────────────────────────────────────
  const handleReup = async () => {
    if (!wsClient || !tableId || !reupAmount) return;
    let amountWei: bigint;
    try {
      amountWei = parseEther(reupAmount);
    } catch {
      toast.error('Invalid amount');
      return;
    }
    if (offChainBalance != null && amountWei > offChainBalance) {
      toast.error('Insufficient poker balance — deposit first');
      return;
    }
    setIsReupPending(true);
    try {
      const newState = await wsClient.pokerAddChips(tableId, amountWei.toString());
      if (newState && onReupSuccess) onReupSuccess(newState);
      toast.success(`Added ${reupAmount} MORBIUS to your stack`);
      setReupAmount('');
      await fetchBalance();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add chips');
    } finally {
      setIsReupPending(false);
    }
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const maxDepositPLS = plsBalance ? Math.floor(Number(formatEther(plsBalance))) : 0;
  const maxDepositMORBIUS = morbiusBalance ? Math.floor(Number(formatEther(morbiusBalance))) : 0;
  const maxWithdraw = offChainBalance != null ? Math.floor(Number(formatEther(offChainBalance))) : 0;
  const maxReup = offChainBalance != null ? Math.floor(Number(formatEther(offChainBalance))) : 0;

  const isDepositLoading = depositTx.isPending || depositMORBIISTx.isPending;
  const controlsDisabled = isDepositLoading || isPreparingWithdraw;

  const atTable = !!wsClient && !!tableId;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'deposit', label: 'Deposit' },
    { id: 'withdraw', label: 'Withdraw' },
    ...(atTable ? [{ id: 'reup' as Tab, label: 'Re-up' }] : []),
    { id: 'history', label: 'History' },
  ];

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
                  className="absolute top-6 right-6 text-gray-400 hover:text-black bg-gray-100 p-2 rounded-full transition-colors"
                >
                  <X size={20} />
                </button>

                {/* Report */}
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="absolute bottom-4 right-4 flex items-center gap-1.5 text-xs text-red-500 hover:text-gray-700"
                >
                  <Flag size={12} />
                  Report
                </button>

                {/* Balance hero */}
                <div className="text-center mt-4 mb-8">
                  <p className="text-sm text-gray-500 uppercase tracking-widest font-semibold mb-2">
                    Poker Balance
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <h4 className="text-5xl font-light tracking-tight text-gray-900">
                      {balanceLoading ? (
                        <Loader2 className="w-8 h-8 animate-spin text-gray-300 inline" />
                      ) : (
                        (offChainBalance != null
                          ? Math.floor(Number(formatEther(offChainBalance))).toLocaleString()
                          : '0')
                      )}
                    </h4>
                    <button
                      onClick={fetchBalance}
                      disabled={balanceLoading}
                      className="text-gray-300 hover:text-gray-600 transition-colors mt-1"
                    >
                      <RefreshCw size={14} className={balanceLoading ? 'animate-spin' : ''} />
                    </button>
                  </div>
                  <p className="text-gray-400 font-medium mt-1">MORBIUS</p>
                  {atTable && currentStack != null && (
                    <p className="text-xs text-gray-400 mt-2">
                      Table stack: <span className="font-semibold text-gray-600">{fmt(currentStack)} MORBIUS</span>
                    </p>
                  )}
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-6 bg-cyan-500/20 p-1 rounded-2xl">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`flex-1 py-3 text-sm font-medium rounded-xl transition-all ${
                        tab === t.id
                          ? 'bg-white text-black shadow-sm'
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
                          depositMethod === 'pls' ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-black'
                        }`}
                      >
                        PLS
                      </button>
                      <button
                        onClick={() => setDepositMethod('morbius')}
                        disabled={controlsDisabled}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                          depositMethod === 'morbius' ? 'bg-white shadow-sm text-black' : 'text-gray-500 hover:text-black'
                        }`}
                      >
                        MORBIUS
                      </button>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-sm font-medium text-gray-700">
                          Amount (MORBIUS)
                        </label>
                        <span className="text-xs text-gray-500">
                          {depositMethod === 'pls'
                            ? `Wallet: ${maxDepositPLS.toLocaleString()} PLS`
                            : `Wallet: ${maxDepositMORBIUS.toLocaleString()} MORBIUS`}
                        </span>
                      </div>
                      {depositMethod === 'pls' && plsEquivalent && depositAmount && (
                        <p className="text-xs text-gray-400 px-1">
                          ≈ {Math.floor(Number(formatEther(plsEquivalent))).toLocaleString()} PLS will be sent
                        </p>
                      )}
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

                    <button
                      onClick={depositMethod === 'pls' ? handleDepositPLS : handleDepositMORBIUS}
                      disabled={
                        controlsDisabled ||
                        !depositAmount ||
                        plsQuoteLoading ||
                        (depositMethod === 'morbius' && isLoadingAllowance) ||
                        (depositMethod === 'morbius' && isApproving)
                      }
                      className="w-full py-4 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {isDepositLoading ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing…</>
                      ) : depositMethod === 'morbius' && isApproving ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Approving…</>
                      ) : depositMethod === 'morbius' && needsApproval ? (
                        'Approve MORBIUS'
                      ) : (
                        `Deposit ${depositMethod === 'pls' ? 'via PLS' : 'MORBIUS'}`
                      )}
                    </button>
                    <p className="text-[11px] text-gray-400 text-center">
                      Deposited MORBIUS becomes available as your poker balance.
                    </p>
                  </div>
                )}

                {/* ── Withdraw ── */}
                {tab === 'withdraw' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center px-1">
                        <label className="text-sm font-medium text-gray-700">Amount (MORBIUS)</label>
                        <span className="text-xs text-gray-500">
                          Available: {maxWithdraw.toLocaleString()} MORBIUS
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
                          disabled={isPreparingWithdraw}
                          className="flex-1 w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                        />
                        <button
                          onClick={() => setWithdrawAmount(maxWithdraw.toString())}
                          disabled={isPreparingWithdraw}
                          className="px-4 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors"
                        >
                          MAX
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handleWithdraw}
                      disabled={isPreparingWithdraw || !withdrawAmount}
                      className="w-full py-4 bg-black text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                      {isPreparingWithdraw ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing…</>
                      ) : (
                        'Withdraw MORBIUS'
                      )}
                    </button>
                    <p className="text-[11px] text-gray-400 text-center">
                      Withdrawals capped at 1,000,000 MORBIUS/day.
                    </p>
                  </div>
                )}

                {/* ── Re-up ── */}
                {tab === 'reup' && (
                  <div className="space-y-4">
                    <div className="bg-gray-50 rounded-2xl p-4 space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Your poker balance</span>
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
                        <label className="text-sm font-medium text-gray-700">
                          Add to stack (MORBIUS)
                        </label>
                        <span className="text-xs text-gray-500">
                          Max: {maxReup.toLocaleString()}
                        </span>
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
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Adding chips…</>
                      ) : (
                        'Add to Stack'
                      )}
                    </button>
                    <p className="text-[11px] text-gray-400 text-center">
                      Chips are added instantly from your poker balance. Takes effect next hand if
                      one is in progress.
                    </p>
                  </div>
                )}

                {/* ── History ── */}
                {tab === 'history' && (
                  <div className="border border-gray-100 rounded-2xl p-5">
                    <div className="flex justify-between items-center mb-4">
                      <h5 className="font-medium text-sm">Last 50 transactions</h5>
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
                        <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading…
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
                          const isCopied = copiedHash === tx.tx_hash;
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
                                    {isDeposit ? '+' : '−'}{morbius} MORBIUS
                                  </p>
                                  <div className="flex items-center gap-2 text-xs text-gray-500">
                                    <span>{dateStr} · {timeStr}</span>
                                    {tx.tx_hash && (
                                      <button
                                        onClick={() => copyHash(tx.tx_hash!)}
                                        className="hover:text-black transition-colors"
                                      >
                                        {isCopied
                                          ? <Check size={10} className="text-green-500" />
                                          : <Copy size={10} />}
                                      </button>
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
        balance={offChainBalance ?? undefined}
      />
    </>
  );
}
