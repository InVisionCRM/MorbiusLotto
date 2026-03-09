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

const MORBIUS_LOGO = '/morbius/MorbiusLogo-2.svg'
const PLS_LOGO = '/Pulse Branding/Logo/ball.png'

function TokenLabel({ symbol, size = 'md' }: { symbol: 'MORBIUS' | 'PLS'; size?: 'sm' | 'md' }) {
  const src = symbol === 'MORBIUS' ? MORBIUS_LOGO : PLS_LOGO
  const dim = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <img src={src} alt="" className={`${dim} object-contain`} />
      <span>{symbol}</span>
    </span>
  )
}

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
  const [showLegacyPanel, setShowLegacyPanel] = useState(false)
  type DepositPhase = 'idle' | 'confirming' | 'confirming_on_chain' | 'success' | 'error'
  const [depositPhase, setDepositPhase] = useState<DepositPhase>('idle')
  const [depositError, setDepositError] = useState<string | null>(null)
  type WithdrawPhase = 'idle' | 'queued' | 'confirming' | 'success' | 'error'
  const [withdrawPhase, setWithdrawPhase] = useState<WithdrawPhase>('idle')
  const [withdrawError, setWithdrawError] = useState<string | null>(null)
  const DEPOSIT_CONFIRMATIONS_REQUIRED = 3
  const [depositBlockNumber, setDepositBlockNumber] = useState<bigint | null>(null)
  const [depositConfirmations, setDepositConfirmations] = useState(0)
  const [depositTxHash, setDepositTxHash] = useState<string | null>(null)
  const [depositNotifyAmountWei, setDepositNotifyAmountWei] = useState<bigint | null>(null)
  const depositToastIdRef = useRef<string | number | null>(null)

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
  const MIN_LEGACY_MORBIUS_WEI = BigInt(500) * BigInt(1e18)

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
      setShowLegacyPanel(false)
      setDepositPhase('idle')
      setDepositError(null)
      setWithdrawPhase('idle')
      setWithdrawError(null)
      setDepositBlockNumber(null)
      setDepositConfirmations(0)
      setDepositTxHash(null)
      setDepositNotifyAmountWei(null)
    }
  }, [isOpen])

  // Poll for confirmation count when deposit tx is mined; transition to success at 3 confirmations
  useEffect(() => {
    if (depositBlockNumber == null || depositPhase !== 'confirming_on_chain' || !publicClient || !depositTxHash || depositNotifyAmountWei == null) return
    let cancelled = false
    const poll = async () => {
      if (cancelled) return
      try {
        const currentBlock = await publicClient.getBlockNumber()
        const confirmations = Number(currentBlock - depositBlockNumber)
        const capped = Math.min(Math.max(confirmations, 0), DEPOSIT_CONFIRMATIONS_REQUIRED)
        setDepositConfirmations(capped)
        if (depositToastIdRef.current != null) {
          toast.loading('Confirming...', {
            id: depositToastIdRef.current,
            description: `${capped}/${DEPOSIT_CONFIRMATIONS_REQUIRED} confirmations`,
          })
        }
        if (confirmations >= DEPOSIT_CONFIRMATIONS_REQUIRED) {
          if (depositToastIdRef.current != null) {
            toast.success('Deposit successful', {
              id: depositToastIdRef.current,
              description: 'Funds will appear after refresh.',
              duration: 5000,
            })
          }
          notifyDeposit(depositTxHash, depositNotifyAmountWei).catch(() => {})
          if (onBalanceSync) {
            try { await onBalanceSync() } catch (e) {
              if (onRefreshBalance) onRefreshBalance().catch(() => {})
              else toast.info('Refresh the page to update your balance', { duration: 4000 })
            }
          }
          setDepositAmount('')
          setDepositPhase('success')
          setDepositBlockNumber(null)
          setDepositTxHash(null)
          setDepositNotifyAmountWei(null)
          setTimeout(() => setDepositPhase('idle'), 2000)
          return
        }
      } catch {
        // ignore RPC errors, will retry next tick
      }
    }
    poll()
    const interval = setInterval(poll, 2000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [depositBlockNumber, depositPhase, publicClient, depositTxHash, depositNotifyAmountWei, DEPOSIT_CONFIRMATIONS_REQUIRED, onBalanceSync, onRefreshBalance])

  const handleDepositPLS = async () => {
    if (!depositAmount || !plsEquivalent || !publicClient) return
    setDepositError(null)
    setDepositPhase('confirming')
    const toastId = toast.loading('Confirm in wallet...', {
      description: `Depositing ${depositAmount} MORBIUS worth of PLS`,
    })
    try {
      const txHash = await deposit(plsEquivalent)
      setDepositPhase('confirming_on_chain')
      toast.loading('Transaction processing...', {
        id: toastId,
        description: 'Waiting for blockchain confirmation...',
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      if (receipt.status === 'reverted') {
        throw new Error('Transaction reverted on-chain. The deposit failed.')
      }
      depositToastIdRef.current = toastId
      setDepositTxHash(txHash)
      setDepositNotifyAmountWei(plsEquivalent)
      setDepositBlockNumber(receipt.blockNumber)
      setDepositConfirmations(0)
      toast.loading('Confirming...', {
        id: toastId,
        description: '0/3 confirmations',
      })
    } catch (error: any) {
      console.error('Deposit failed:', error)
      const isUserRejection = error?.message?.includes('rejected') || error?.message?.includes('denied')
      setDepositPhase('error')
      setDepositError(isUserRejection ? 'Cancelled' : 'Deposit failed')
      toast.error(isUserRejection ? 'Transaction cancelled' : 'Deposit failed', {
        id: toastId,
        description: isUserRejection ? 'You cancelled the transaction' : 'There was an error processing your deposit',
      })
      setTimeout(() => { setDepositPhase('idle'); setDepositError(null) }, 4000)
    }
  }

  const handleDepositMORBIUS = async () => {
    if (!depositAmount || !publicClient) return
    if (needsApproval) {
      setShowApprovalModal(true)
      return
    }
    const amountWei = parseEther(depositAmount)
    setDepositError(null)
    setDepositPhase('confirming')
    const toastId = toast.loading('Confirm in wallet...', {
      description: `Depositing ${depositAmount} MORBIUS`,
    })
    try {
      const txHash = await depositMORBIUS(amountWei)
      setDepositPhase('confirming_on_chain')
      toast.loading('Transaction processing...', {
        id: toastId,
        description: 'Waiting for blockchain confirmation...',
      })
      const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
      if (depositReceipt.status === 'reverted') {
        throw new Error('Transaction reverted on-chain. The deposit failed.')
      }
      depositToastIdRef.current = toastId
      setDepositTxHash(txHash)
      setDepositNotifyAmountWei(amountWei)
      setDepositBlockNumber(depositReceipt.blockNumber)
      setDepositConfirmations(0)
      toast.loading('Confirming...', {
        id: toastId,
        description: '0/3 confirmations',
      })
    } catch (error: any) {
      console.error('Deposit failed:', error)
      if (error?.message?.includes('allowance') || error?.message?.includes('ERC20')) {
        setDepositPhase('idle')
        toast.error('Approval required', {
          id: toastId,
          description: 'Please approve MORBIUS spending first',
        })
        setShowApprovalModal(true)
      } else {
        const isUserRejection = error?.message?.includes('rejected') || error?.message?.includes('denied')
        setDepositPhase('error')
        setDepositError(isUserRejection ? 'Cancelled' : 'Deposit failed')
        toast.error(isUserRejection ? 'Transaction cancelled' : 'Deposit failed', {
          id: toastId,
          description: isUserRejection ? 'You cancelled the transaction' : (error?.message || 'There was an error processing your deposit'),
        })
        setTimeout(() => { setDepositPhase('idle'); setDepositError(null) }, 4000)
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
    setWithdrawError(null)
    setWithdrawPhase('queued')
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
          setWithdrawPhase('success')
          toast.success('Withdrawal successful!', {
            id: toastId,
            description: txHash ? `Sent to your wallet. Tx: ${txHash.slice(0, 10)}...` : 'Sent to your wallet.',
          })
          if (onRefreshBalance) await onRefreshBalance()
          if (onWithdrawSuccess) await Promise.resolve(onWithdrawSuccess())
          setWithdrawAmount('')
          setTxLoaded(false)
          await new Promise((r) => setTimeout(r, 2000))
          setWithdrawPhase('idle')
          return
        }
        if (status === 'failed') {
          setWithdrawPhase('error')
          setWithdrawError((statusData.error as string) || 'Withdrawal failed')
          toast.error('Withdrawal failed', {
            id: toastId,
            description: (statusData.error as string) || 'Transaction failed or was dropped.',
          })
          if (onRefreshBalance) await onRefreshBalance()
          setTimeout(() => { setWithdrawPhase('idle'); setWithdrawError(null) }, 4000)
          return
        }
        if (status === 'pending_confirmation' && txHash) {
          setWithdrawPhase('confirming')
          toast.loading('Confirming on chain...', {
            id: toastId,
            description: `Tx: ${txHash.slice(0, 10)}...`,
          })
        } else if (status === 'queued' || status === 'broadcasting') {
          toast.loading('Processing withdrawal...', { id: toastId })
        }
        await new Promise((r) => setTimeout(r, pollIntervalMs))
      }
      setWithdrawPhase('error')
      setWithdrawError('Withdrawal timed out')
      toast.error('Withdrawal timed out', {
        id: toastId,
        description: 'Check your balance or transaction history. If funds were deducted, contact support.',
      })
      if (onRefreshBalance) await onRefreshBalance()
      setTimeout(() => { setWithdrawPhase('idle'); setWithdrawError(null) }, 4000)
    } catch (error: any) {
      setWithdrawPhase('error')
      setWithdrawError(error?.message ?? 'Withdrawal failed')
      toast.error('Withdrawal failed', {
        id: toastId,
        description: error?.message ?? 'Something went wrong',
      })
      if (onRefreshBalance) await onRefreshBalance()
      setTimeout(() => { setWithdrawPhase('idle'); setWithdrawError(null) }, 4000)
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
                <button onClick={onClose} className="absolute top-6 right-6 z-20 text-gray-400 hover:text-black bg-gray-100 p-2 rounded-full transition-colors">
                  <X size={20}/>
                </button>
                <div className="relative min-h-[280px]">
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
                          <p className="text-xs text-gray-500 mt-1">Waiting for confirmation</p>
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
                {legacyItems.some((item) => item.reserve >= MIN_LEGACY_MORBIUS_WEI) && (
                  <button
                    type="button"
                    onClick={() => setShowLegacyPanel((v) => !v)}
                    className="absolute bottom-4 left-4 text-xs text-gray-500 hover:text-cyan-500 transition-colors"
                  >
                    {showLegacyPanel ? 'Hide' : 'Previous contract'} withdrawals
                  </button>
                )}
                <div className="text-center mt-4 mb-10">
                  <p className="text-sm text-gray-500 uppercase tracking-widest font-semibold mb-2">Reserve Balance</p>
                  <h4 className="text-5xl font-light tracking-tight text-gray-900 mb-2">
                    {displayBalance ? Math.floor(Number(formatEther(displayBalance))).toLocaleString() : 0}
                  </h4>
                  <p className="text-gray-400 font-medium inline-flex items-center justify-center gap-1"><img src={MORBIUS_LOGO} alt="" className="w-4 h-4 object-contain" />MORBIUS</p>
                  <p className="text-xs text-gray-400 mt-1">Refresh the page after deposit confirmation to see funds in the UI.</p>
                </div>

                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
                  <TabsList className="flex gap-2 mb-8 bg-gray-50 p-1 rounded-2xl h-auto border-0 w-full">
                    <TabsTrigger value="deposit" className="flex-1 py-3 text-sm font-medium text-gray-600 data-[state=active]:bg-white data-[state=active]:text-cyan-500 data-[state=active]:shadow-sm rounded-xl transition-all">Deposit</TabsTrigger>
                    <TabsTrigger value="withdraw" className="flex-1 py-3 text-sm font-medium text-gray-600 data-[state=active]:bg-white data-[state=active]:text-cyan-500 data-[state=active]:shadow-sm rounded-xl transition-all">Withdraw</TabsTrigger>
                    <TabsTrigger value="history" className="flex-1 py-3 text-sm font-medium text-gray-600 data-[state=active]:bg-white data-[state=active]:text-cyan-500 data-[state=active]:shadow-sm rounded-xl transition-all">History</TabsTrigger>
                  </TabsList>

                  <div className="space-y-4">
                    <TabsContent value="deposit" className="space-y-4 mt-0">
                      <div className="flex gap-2 bg-gray-50 p-1 rounded-xl">
                        <button
                          onClick={() => setDepositMethod('pls')}
                          disabled={controlsDisabled}
                          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${depositMethod === 'pls' ? 'bg-white text-cyan-500 shadow-sm' : 'text-gray-500 hover:text-black'}`}
                        >
                          <TokenLabel symbol="PLS" />
                        </button>
                        <button
                          onClick={() => setDepositMethod('morbius')}
                          disabled={controlsDisabled}
                          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${depositMethod === 'morbius' ? 'bg-white text-cyan-500 shadow-sm' : 'text-gray-500 hover:text-black'}`}
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
                                Avail: {maxDepositPLS.toLocaleString()} <TokenLabel symbol="PLS" size="sm" />{depositAmount && plsEquivalent != null && plsEquivalent > 0n ? <> · ≈{Math.floor(Number(formatEther(plsEquivalent))).toLocaleString()} <TokenLabel symbol="PLS" size="sm" /></> : null}
                              </span>
                            ) : (
                              <>Avail: {maxDepositMORBIUS.toLocaleString()} <TokenLabel symbol="MORBIUS" size="sm" /></>
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
                                'Approve'
                              ) : (
                                <>Deposit <TokenLabel symbol={depositMethod === 'pls' ? 'PLS' : 'MORBIUS'} /></>
                              )}
                            </>
                          )}
                        </button>
                        {depositPhase !== 'idle' && depositPhase !== 'error' && (
                          <p className="text-xs text-center text-gray-500">
                            {depositPhase === 'confirming' && 'Approve the transaction in your wallet'}
                            {depositPhase === 'confirming_on_chain' && (depositBlockNumber != null ? `${depositConfirmations}/${DEPOSIT_CONFIRMATIONS_REQUIRED} confirmations` : 'Waiting for blockchain confirmation')}
                            {depositPhase === 'success' && 'Funds will appear after refresh'}
                          </p>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 text-center mt-3">Withdrawals capped at 1,000,000 <TokenLabel symbol="MORBIUS" size="sm" />/day.</p>
                    </TabsContent>

                    <TabsContent value="withdraw" className="space-y-4 mt-0">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center px-1">
                          <label className="text-sm font-medium text-gray-700">Amount (<TokenLabel symbol="MORBIUS" size="sm" />)</label>
                          <span className="text-xs text-gray-500">Avail: {maxWithdraw.toLocaleString()} <TokenLabel symbol="MORBIUS" size="sm" /></span>
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
                        className="w-full py-4 bg-black text-gray-500 text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                      >
                        {isWithdrawLoading ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
                        ) : (
                          <>Withdraw <TokenLabel symbol="MORBIUS" /></>
                        )}
                      </button>
                      <p className="text-[10px] text-gray-400 text-center mt-3">Withdrawals capped at 1,000,000 <TokenLabel symbol="MORBIUS" size="sm" />/day.</p>
                    </TabsContent>

                    <TabsContent value="history" className="mt-0">
                      <div className="border border-gray-100 rounded-2xl p-3">
                        <div className="flex justify-between items-center mb-4">
                          <h5 className="font-medium text-cyan-500 text-sm">Last 50 transactions</h5>
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
                                        {isDeposit ? '+' : '−'}{morbius} <TokenLabel symbol="MORBIUS" size="sm" />
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

                {showLegacyPanel && legacyItems.filter((item) => item.reserve >= MIN_LEGACY_MORBIUS_WEI && !dismissedLegacy.has(item.address)).length > 0 && (
                  <div className="mt-4 space-y-4">
                    {legacyItems
                      .filter((item) => item.reserve >= MIN_LEGACY_MORBIUS_WEI && !dismissedLegacy.has(item.address))
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
                                Balance: {Math.floor(Number(formatEther(item.reserve))).toLocaleString()} <TokenLabel symbol="MORBIUS" size="sm" />
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
