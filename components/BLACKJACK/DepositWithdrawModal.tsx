'use client'

import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Minus, Loader2, ArrowDownCircle, ArrowUpCircle, History, RefreshCw, Copy, Check, Flag } from 'lucide-react'
import { useAccount, usePublicClient } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { useTokenBalance } from '@/hooks/use-token'
import { useNativeBalance } from '@/hooks/use-native-balance'
import { usePlsQuote } from '@/hooks/use-pls-quote'
import { useBlackjackContract, useLegacyPlayerReserveAt, useLegacyEmergencyPausedAt, isLegacyAddress } from '@/hooks/use-blackjack-contract'
import { useTokenApproval } from '@/hooks/use-token-approval'
import { getBlackjackServerUrl } from '@/lib/api-urls'
import { BLACKJACK_ADDRESS, BLACKJACK_LEGACY_ADDRESS, BLACKJACK_LEGACY_ADDRESS_2, BLACKJACK_LEGACY_ADDRESS_3, BLACKJACK_LEGACY_ADDRESS_4, BLACKJACK_LEGACY_ADDRESS_5, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'
import { blackjackAbi } from '@/abi/blackjack'
import { CustomApprovalModal } from '@/components/BLACKJACK/CustomApprovalModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Theme, getPanelStyles } from '@/lib/theme'
import { toast } from 'sonner'
import { ReportModal } from '@/components/shared/ReportModal'

interface DepositWithdrawModalProps {
  isOpen: boolean
  onClose: () => void
  onBalanceSync?: () => Promise<void>
  onRefreshBalance?: () => Promise<void>
  onWithdrawSuccess?: () => void | Promise<void>
  contractReserve?: bigint
  offChainBalance?: bigint
}

export function DepositWithdrawModal({ isOpen, onClose, onBalanceSync, onRefreshBalance, onWithdrawSuccess, contractReserve, offChainBalance }: DepositWithdrawModalProps) {
  const displayBalance = (offChainBalance !== undefined && offChainBalance !== null)
    ? offChainBalance
    : (contractReserve !== undefined && contractReserve !== null ? contractReserve : BigInt(0));
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const latestAddressRef = useRef<string | undefined>(address)
  useEffect(() => {
    latestAddressRef.current = address
  }, [address])
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit')
  const [depositMethod, setDepositMethod] = useState<'pls' | 'morbius'>('pls')
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [isPreparingWithdraw, setIsPreparingWithdraw] = useState(false)
  const [legacyWithdrawAmounts, setLegacyWithdrawAmounts] = useState<Record<string, string>>({})
  const [dismissedLegacy, setDismissedLegacy] = useState<Set<string>>(new Set())

  interface TxHistoryItem {
    type: 'deposit' | 'withdrawal'
    amount: string
    status: string
    tx_hash: string | null
    created_at: string
  }
  const [txHistory, setTxHistory] = useState<TxHistoryItem[]>([])
  const [txLoading, setTxLoading] = useState(false)
  const [txError, setTxError] = useState<string | null>(null)
  const [txLoaded, setTxLoaded] = useState(false)
  const [copiedHash, setCopiedHash] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash).catch(() => {})
    setCopiedHash(hash)
    setTimeout(() => setCopiedHash(null), 2000)
  }

  const fetchTxHistory = async () => {
    if (!address) return
    setTxLoading(true)
    setTxError(null)
    try {
      const serverUrl = getBlackjackServerUrl()
      const res = await fetch(`${serverUrl}/api/players/${address}/transactions?limit=50`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setTxHistory(data)
      setTxLoaded(true)
    } catch (err) {
      setTxError('Failed to load history')
    } finally {
      setTxLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'history' && !txLoaded && !txLoading) {
      fetchTxHistory()
    }
  }, [activeTab])

  const notifyDeposit = async (txHash: string, amountWei: bigint) => {
    if (!address) return
    try {
      const serverUrl = getBlackjackServerUrl()
      await fetch(`${serverUrl}/api/deposit/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address, txHash, amount: amountWei.toString() }),
      })
      setTxLoaded(false)
    } catch {
    }
  }

  const LEGACY_MAX_WITHDRAW_WEI = BigInt(1_000_000) * BigInt(1e18)

  const {
    depositTx,
    depositMORBIISTx,
    deposit,
    depositMORBIUS,
    withdrawLegacy,
    withdrawTx,
  } = useBlackjackContract()

  const legacy1Reserve = useLegacyPlayerReserveAt(BLACKJACK_LEGACY_ADDRESS)
  const legacy1Paused = useLegacyEmergencyPausedAt(BLACKJACK_LEGACY_ADDRESS)
  const legacy2Reserve = useLegacyPlayerReserveAt(BLACKJACK_LEGACY_ADDRESS_2)
  const legacy2Paused = useLegacyEmergencyPausedAt(BLACKJACK_LEGACY_ADDRESS_2)
  const legacy3Reserve = useLegacyPlayerReserveAt(BLACKJACK_LEGACY_ADDRESS_3)
  const legacy3Paused = useLegacyEmergencyPausedAt(BLACKJACK_LEGACY_ADDRESS_3)
  const legacy4Reserve = useLegacyPlayerReserveAt(BLACKJACK_LEGACY_ADDRESS_4)
  const legacy4Paused = useLegacyEmergencyPausedAt(BLACKJACK_LEGACY_ADDRESS_4)
  const legacy5Reserve = useLegacyPlayerReserveAt(BLACKJACK_LEGACY_ADDRESS_5)
  const legacy5Paused = useLegacyEmergencyPausedAt(BLACKJACK_LEGACY_ADDRESS_5)
  const legacyItems: { address: `0x${string}`; reserve: bigint; paused: boolean; refetch: () => void; label: string }[] = []
  if (isLegacyAddress(BLACKJACK_LEGACY_ADDRESS)) {
    legacyItems.push({
      address: BLACKJACK_LEGACY_ADDRESS,
      reserve: (legacy1Reserve.data ?? BigInt(0)) as bigint,
      paused: legacy1Paused.data === true,
      refetch: legacy1Reserve.refetch ?? (() => {}),
      label: (BLACKJACK_LEGACY_ADDRESS_2 || BLACKJACK_LEGACY_ADDRESS_3) ? 'Previous contract (1)' : 'Previous contract',
    })
  }
  if (isLegacyAddress(BLACKJACK_LEGACY_ADDRESS_2)) {
    legacyItems.push({
      address: BLACKJACK_LEGACY_ADDRESS_2,
      reserve: (legacy2Reserve.data ?? BigInt(0)) as bigint,
      paused: legacy2Paused.data === true,
      refetch: legacy2Reserve.refetch ?? (() => {}),
      label: (BLACKJACK_LEGACY_ADDRESS || BLACKJACK_LEGACY_ADDRESS_3) ? 'Previous contract (2)' : 'Previous contract',
    })
  }
  if (isLegacyAddress(BLACKJACK_LEGACY_ADDRESS_3)) {
    legacyItems.push({
      address: BLACKJACK_LEGACY_ADDRESS_3,
      reserve: (legacy3Reserve.data ?? BigInt(0)) as bigint,
      paused: legacy3Paused.data === true,
      refetch: legacy3Reserve.refetch ?? (() => {}),
      label: 'Previous contract (3)',
    })
  }
  if (isLegacyAddress(BLACKJACK_LEGACY_ADDRESS_4)) {
    legacyItems.push({
      address: BLACKJACK_LEGACY_ADDRESS_4,
      reserve: (legacy4Reserve.data ?? BigInt(0)) as bigint,
      paused: legacy4Paused.data === true,
      refetch: legacy4Reserve.refetch ?? (() => {}),
      label: 'Previous contract (4)',
    })
  }
  if (isLegacyAddress(BLACKJACK_LEGACY_ADDRESS_5)) {
    legacyItems.push({
      address: BLACKJACK_LEGACY_ADDRESS_5,
      reserve: (legacy5Reserve.data ?? BigInt(0)) as bigint,
      paused: legacy5Paused.data === true,
      refetch: legacy5Reserve.refetch ?? (() => {}),
      label: 'Previous contract (5)',
    })
  }
  const hasAnyLegacyBalance = legacyItems.some((item) => item.reserve > BigInt(0))

  const { balance: morbiusBalance } = useTokenBalance(address)
  const { balance: plsBalance } = useNativeBalance(address ?? undefined)

  const { plsValue: plsEquivalent, isLoading: plsQuoteLoading } = usePlsQuote({
    morbiusCost: depositAmount ? parseEther(depositAmount) : BigInt(0),
    enabled: activeTab === 'deposit' && depositMethod === 'pls' && depositAmount !== ''
  })

  const requiredMorbiusAmount = depositAmount && depositMethod === 'morbius' 
    ? parseEther(depositAmount) 
    : BigInt(0)

  const {
    needsApproval,
    approve,
    isApproving,
    isLoadingAllowance,
    isApprovalSuccess,
  } = useTokenApproval({
    tokenAddress: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
    spenderAddress: BLACKJACK_ADDRESS as `0x${string}`,
    requiredAmount: requiredMorbiusAmount,
    userAddress: address,
    enabled: activeTab === 'deposit' && depositMethod === 'morbius' && !!depositAmount && !!address,
    defaultToUnlimited: true,
  })

  useEffect(() => {
    if (isApprovalSuccess) {
      toast.success('Approval successful', {
        description: 'You can now deposit MORBIUS',
        duration: 5000,
      })
      setShowApprovalModal(false)
    }
  }, [isApprovalSuccess])

  useEffect(() => {
    if (!isOpen) {
      setTxLoaded(false)
      setTxHistory([])
      setTxError(null)
      setDismissedLegacy(new Set())
    }
  }, [isOpen])

  const handleDepositPLS = async () => {
    if (!depositAmount || !plsEquivalent || !publicClient) return
    const toastId = toast.loading('Confirm in wallet...', {
      description: `Depositing ${depositAmount} MORBIUS worth of PLS`,
    })
    try {
      const txHash = await deposit(plsEquivalent)
      toast.loading('Transaction processing...', {
        id: toastId,
        description: 'Waiting for blockchain confirmation...',
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      if (receipt.status === 'reverted') {
        throw new Error('Transaction reverted on-chain. The deposit failed.')
      }
      toast.success('Deposit successful', {
        id: toastId,
        description: `Deposited ${depositAmount} MORBIUS worth of PLS. Refresh the page after deposit confirmation to see funds in the UI.`,
        duration: 5000,
      })
      await new Promise(resolve => setTimeout(resolve, 2000))
      if (plsEquivalent) notifyDeposit(txHash, plsEquivalent)
      if (onBalanceSync) {
        try {
          await onBalanceSync()
        } catch (syncErr) {
          console.error('Balance sync failed after deposit:', syncErr)
          if (onRefreshBalance) {
            onRefreshBalance().catch(() => {})
          } else {
            toast.info('Refresh the page to update your balance', { duration: 4000 })
          }
        }
      }
      setDepositAmount('')
    } catch (error: any) {
      console.error('Deposit failed:', error)
      const isUserRejection = error?.message?.includes('rejected') || error?.message?.includes('denied')
      toast.error(isUserRejection ? 'Transaction cancelled' : 'Deposit failed', {
        id: toastId,
        description: isUserRejection ? 'You cancelled the transaction' : 'There was an error processing your deposit',
      })
    }
  }

  const handleDepositMORBIUS = async () => {
    if (!depositAmount || !publicClient) return
    if (needsApproval) {
      setShowApprovalModal(true)
      return
    }
    const amountWei = parseEther(depositAmount)
    const toastId = toast.loading('Confirm in wallet...', {
      description: `Depositing ${depositAmount} MORBIUS`,
    })
    try {
      const txHash = await depositMORBIUS(amountWei)
      toast.loading('Transaction processing...', {
        id: toastId,
        description: 'Waiting for blockchain confirmation...',
      })
      const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      if (depositReceipt.status === 'reverted') {
        throw new Error('Transaction reverted on-chain. The deposit failed.')
      }
      toast.success('Deposit successful', {
        id: toastId,
        description: `Deposited ${depositAmount} MORBIUS. Refresh the page after deposit confirmation to see funds in the UI.`,
        duration: 5000,
      })
      notifyDeposit(txHash, amountWei)
      await new Promise(resolve => setTimeout(resolve, 2000))
      if (onBalanceSync) {
        try {
          await onBalanceSync()
        } catch (syncErr) {
          console.error('Balance sync failed after deposit:', syncErr)
          if (onRefreshBalance) {
            onRefreshBalance().catch(() => {})
          } else {
            toast.info('Refresh the page to update your balance', { duration: 4000 })
          }
        }
      }
      setDepositAmount('')
    } catch (error: any) {
      console.error('Deposit failed:', error)
      if (error?.message?.includes('allowance') || error?.message?.includes('ERC20')) {
        toast.error('Approval required', {
          id: toastId,
          description: 'Please approve MORBIUS spending first',
        })
        setShowApprovalModal(true)
      } else {
        const isUserRejection = error?.message?.includes('rejected') || error?.message?.includes('denied')
        toast.error(isUserRejection ? 'Transaction cancelled' : 'Deposit failed', {
          id: toastId,
          description: isUserRejection ? 'You cancelled the transaction' : (error?.message || 'There was an error processing your deposit'),
        })
      }
    }
  }

  const handleApprove = (amount: bigint) => {
    approve(amount)
  }

  const handleWithdraw = async () => {
    if (!withdrawAmount || !address) return
    let amountWei: bigint
    try {
      amountWei = parseEther(withdrawAmount)
    } catch {
      toast.error('Invalid amount', { description: 'Please enter a valid number' })
      return
    }
    if (offChainBalance !== undefined && amountWei > offChainBalance) {
      toast.error('Insufficient balance')
      return
    }
    setIsPreparingWithdraw(true)
    const toastId = toast.loading('Withdrawal queued...')
    try {
      const serverUrl = getBlackjackServerUrl()
      const response = await fetch(`${serverUrl}/api/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          amount: amountWei.toString(),
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Withdrawal failed')
      }
      const jobId = data.jobId
      if (!jobId) {
        throw new Error('Server did not return jobId')
      }
      const pollIntervalMs = 2000
      const maxPolls = 120
      for (let i = 0; i < maxPolls; i++) {
        const statusRes = await fetch(`${serverUrl}/api/withdraw/status/${jobId}`)
        const statusData = await statusRes.json()
        if (!statusRes.ok) {
          throw new Error(statusData.error || 'Failed to get status')
        }
        const status = statusData.status as string
        const txHash = statusData.txHash as string | undefined
        if (status === 'completed') {
          toast.success('Withdrawal successful!', {
            id: toastId,
            description: txHash ? `Sent to your wallet. Tx: ${txHash.slice(0, 10)}...` : 'Sent to your wallet.',
          })
          if (onRefreshBalance) await onRefreshBalance()
          if (onWithdrawSuccess) await Promise.resolve(onWithdrawSuccess())
          setWithdrawAmount('')
          setTxLoaded(false)
          return
        }
        if (status === 'failed') {
          toast.error('Withdrawal failed', {
            id: toastId,
            description: (statusData.error as string) || 'Transaction failed or was dropped.',
          })
          if (onRefreshBalance) await onRefreshBalance()
          return
        }
        if (status === 'pending_confirmation' && txHash) {
          toast.loading('Confirming on chain...', {
            id: toastId,
            description: `Tx: ${txHash.slice(0, 10)}...`,
          })
        } else if (status === 'queued' || status === 'broadcasting') {
          toast.loading('Processing withdrawal...', { id: toastId })
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs))
      }
      toast.error('Withdrawal timed out', {
        id: toastId,
        description: 'Check your balance or transaction history. If funds were deducted, contact support.',
      })
      if (onRefreshBalance) await onRefreshBalance()
    } catch (error: any) {
      toast.error('Withdrawal failed', {
        id: toastId,
        description: error?.message ?? 'Something went wrong',
      })
      if (onRefreshBalance) await onRefreshBalance()
    } finally {
      setIsPreparingWithdraw(false)
    }
  }

  const maxDepositPLS = plsBalance ? Math.floor(Number(formatEther(plsBalance))) : 0
  const maxDepositMORBIUS = morbiusBalance ? Math.floor(Number(formatEther(morbiusBalance))) : 0
  const maxWithdraw =
    offChainBalance !== undefined && offChainBalance !== null
      ? Math.floor(Number(formatEther(offChainBalance)))
      : contractReserve !== undefined && contractReserve !== null
        ? Math.floor(Number(formatEther(contractReserve)))
        : 0

  const isDepositLoading = depositTx.isPending || depositMORBIISTx.isPending
  const isWithdrawLoading = isPreparingWithdraw
  const isLegacyWithdrawLoading = withdrawTx.isPending
  const controlsDisabled = isDepositLoading || isWithdrawLoading || isLegacyWithdrawLoading

  const handleWithdrawLegacy = async (legacyAddress: `0x${string}`, amount: bigint, refetch: () => void) => {
    if (amount <= 0n) return
    const toastId = toast.loading('Confirm in wallet...', {
      description: `Withdrawing ${Math.floor(Number(formatEther(amount))).toLocaleString()} MORBIUS from previous contract`,
    })
    try {
      const txHash = await withdrawLegacy(legacyAddress, amount)
      toast.loading('Transaction processing...', { id: toastId, description: 'Waiting for confirmation...' })
      if (publicClient) {
        const legacyReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
        if (legacyReceipt.status === 'reverted') {
          throw new Error('Transaction reverted on-chain. The withdrawal failed.')
        }
      }
      toast.success('Withdrawal successful', {
        id: toastId,
        description: `Withdrew ${Math.floor(Number(formatEther(amount))).toLocaleString()} MORBIUS from previous contract`,
        duration: 5000,
      })
      refetch()
      if (onRefreshBalance) await onRefreshBalance()
    } catch (e: any) {
      const msg =
        e?.shortMessage ??
        (typeof e?.message === 'string' ? e.message : null) ??
        (e?.cause?.message ?? null) ??
        'Withdrawal failed'
      const reason = String(msg).slice(0, 120)
      const isStuckOrAwaiting =
        /internal transaction awaiting|awaiting|stuck|pending.*nonce|nonce.*low|replacement fee/i.test(reason)
      toast.error(
        isStuckOrAwaiting ? 'Transaction stuck or pending' : reason,
        {
          id: toastId,
          description: isStuckOrAwaiting
            ? 'Clear the pending transaction in your wallet (cancel/speed up), or wait for it to confirm, then try again.'
            : reason,
          duration: 8000,
        }
      )
    }
  }

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
              <div className="bg-white p-6 sm:p-10 rounded-[2.5rem] shadow-2xl w-full max-w-md relative border border-gray-100 pointer-events-auto overflow-y-auto max-h-[90vh]">
                <button onClick={onClose} className="absolute top-6 right-6 text-gray-400 hover:text-black bg-gray-100 p-2 rounded-full transition-colors">
                  <X size={20}/>
                </button>
                <button
                  type="button"
                  onClick={() => setReportOpen(true)}
                  className="absolute bottom-4 right-4 flex items-center gap-1.5 text-xs text-red-500 hover:text-gray-700"
                >
                  <Flag size={12} />
                  Report
                </button>
                
                <div className="text-center mt-4 mb-10">
                  <p className="text-sm text-gray-500 uppercase tracking-widest font-semibold mb-2">Reserve Balance</p>
                  <h4 className="text-5xl font-light tracking-tight text-gray-900 mb-2">
                    {displayBalance ? Math.floor(Number(formatEther(displayBalance))).toLocaleString() : 0}
                  </h4>
                  <p className="text-gray-400 font-medium">MORBIUS</p>
                  <p className="text-xs text-gray-400 mt-1">Refresh the page after deposit confirmation to see funds in the UI.</p>
                </div>

                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
                  <TabsList className="flex gap-2 mb-8 bg-cyan-500/20 p-1 rounded-2xl h-auto border-0 w-full">
                    <TabsTrigger value="deposit" className="flex-1 py-3 text-sm font-medium text-gray-600 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-sm rounded-xl transition-all">Deposit</TabsTrigger>
                    <TabsTrigger value="withdraw" className="flex-1 py-3 text-sm font-medium text-gray-600 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-sm rounded-xl transition-all">Withdraw</TabsTrigger>
                    <TabsTrigger value="history" className="flex-1 py-3 text-sm font-medium text-gray-600 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:shadow-sm rounded-xl transition-all">History</TabsTrigger>
                  </TabsList>

                  <div className="space-y-4">
                    <TabsContent value="deposit" className="space-y-4 mt-0">
                      <div className="flex gap-2 bg-gray-50 p-1 rounded-xl">
                        <button
                          onClick={() => setDepositMethod('pls')}
                          disabled={controlsDisabled}
                          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${depositMethod === 'pls' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-black'}`}
                        >
                          PLS
                        </button>
                        <button
                          onClick={() => setDepositMethod('morbius')}
                          disabled={controlsDisabled}
                          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${depositMethod === 'morbius' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-black'}`}
                        >
                          MORBIUS
                        </button>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-sm font-medium text-gray-700">Amount</label>
                          <span className="text-xs text-gray-500">
                            {depositMethod === 'pls' ? (
                              <>Avail: {maxDepositPLS} PLS{plsEquivalent && depositAmount && <> · ≈{Math.floor(Number(formatEther(plsEquivalent)))} PLS</>}</>
                            ) : (
                              <>Avail: {maxDepositMORBIUS} MORBIUS</>
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
                            max={depositMethod === 'pls' ? maxDepositPLS : maxDepositMORBIUS}
                            disabled={controlsDisabled}
                            className="flex-1 w-full bg-white text-black/90 placeholder:text-black/50 border border-gray-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
                          />
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
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
                        ) : depositMethod === 'morbius' && isApproving ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Approving...</>
                        ) : depositMethod === 'morbius' && needsApproval ? (
                          'Approve'
                        ) : (
                          `Deposit ${depositMethod === 'pls' ? 'PLS' : 'MORBIUS'}`
                        )}
                      </button>
                    </TabsContent>

                    <TabsContent value="withdraw" className="space-y-4 mt-0">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-sm font-medium text-gray-700">Amount (MORBIUS)</label>
                          <span className="text-xs text-gray-500">Avail: {maxWithdraw} MORBIUS</span>
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
                            className="flex-1 w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-black/5 transition-all"
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
                        {isWithdrawLoading ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
                        ) : (
                          'Withdraw MORBIUS'
                        )}
                      </button>
                    </TabsContent>

                    <TabsContent value="history" className="mt-0">
                      <div className="border border-gray-100 rounded-2xl p-5">
                        <div className="flex justify-between items-center mb-4">
                          <h5 className="font-medium text-sm">Last 50 transactions</h5>
                          <button
                            onClick={() => { setTxLoaded(false); setTxHistory([]); fetchTxHistory() }}
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
                              const isDeposit = tx.type === 'deposit'
                              const morbius = Math.floor(Number(formatEther(BigInt(tx.amount)))).toLocaleString()
                              const date = new Date(tx.created_at)
                              const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                              const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                              const isCopied = copiedHash === tx.tx_hash
                              return (
                                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                                  <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDeposit ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-600'}`}>
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
                                            className="hover:text-black transition-colors flex items-center gap-1"
                                          >
                                            {isCopied ? <Check size={10} className="text-green-500" /> : <Copy size={10} />}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <span className="text-xs font-medium text-gray-400 capitalize">
                                    {tx.type}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">                        </p>
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>

                {legacyItems.filter((item) => item.reserve > BigInt(0) && !dismissedLegacy.has(item.address)).length > 0 && (
                  <div className="mt-4 space-y-4">
                    {legacyItems
                      .filter((item) => item.reserve > BigInt(0) && !dismissedLegacy.has(item.address))
                      .map((item) => {
                        const maxAllowedWei = item.reserve > LEGACY_MAX_WITHDRAW_WEI ? LEGACY_MAX_WITHDRAW_WEI : item.reserve
                        const rawInput = legacyWithdrawAmounts[item.address] ?? ''
                        let amountWei: bigint
                        try {
                          amountWei = rawInput.trim() === '' ? maxAllowedWei : parseEther(rawInput)
                        } catch {
                          amountWei = 0n
                        }
                        const validAmount = amountWei > 0n && amountWei <= item.reserve && amountWei <= LEGACY_MAX_WITHDRAW_WEI
                        const setMax = () => setLegacyWithdrawAmounts((prev) => ({ ...prev, [item.address]: formatEther(maxAllowedWei) }))
                        
                        return (
                          <div key={item.address} className="border border-gray-100 rounded-2xl p-5 bg-gray-50">
                            <div className="flex justify-between items-center mb-4">
                              <h5 className="font-medium text-sm text-gray-900">{item.label}</h5>
                              <button onClick={() => setDismissedLegacy((prev) => new Set(prev).add(item.address))}>
                                <X size={14} className="text-gray-400 hover:text-black transition-colors"/>
                              </button>
                            </div>
                            
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs text-gray-500 font-medium">
                                Balance: {Math.floor(Number(formatEther(item.reserve))).toLocaleString()} MORBIUS
                              </span>
                              {item.paused && <span className="text-[10px] font-medium text-red-500">Paused</span>}
                            </div>

                            <div className="flex gap-2 mb-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder={formatEther(maxAllowedWei)}
                                value={rawInput}
                                onChange={(e) => setLegacyWithdrawAmounts((prev) => ({ ...prev, [item.address]: e.target.value }))}
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
                                {isLegacyWithdrawLoading ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing...</> : 'Withdraw'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                  </div>
                )}

                <p className="text-[10px] text-gray-400 text-center mt-8 px-4">
                  Withdrawals capped at 1,000,000 MORBIUS/day.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <CustomApprovalModal
        open={showApprovalModal}
        onOpenChange={setShowApprovalModal}
        onApprove={handleApprove}
        isApproving={isApproving}
        tokenSymbol="MORBIUS"
        spenderName="Blackjack Contract"
      />
      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        balance={offChainBalance ?? contractReserve}
      />
    </>
  )
}
