'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Minus, Loader2 } from 'lucide-react'
import { useAccount, usePublicClient } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { useTokenBalance } from '@/hooks/use-token'
import { useNativeBalance } from '@/hooks/use-native-balance'
import { usePlsQuote } from '@/hooks/use-pls-quote'
import { useBlackjackContract, useLegacyPlayerReserveAt, useLegacyEmergencyPausedAt, isLegacyAddress } from '@/hooks/use-blackjack-contract'
import { useTokenApproval } from '@/hooks/use-token-approval'
import { getBlackjackServerUrl } from '@/lib/api-urls'
import { BLACKJACK_ADDRESS, BLACKJACK_LEGACY_ADDRESS, BLACKJACK_LEGACY_ADDRESS_2, BLACKJACK_LEGACY_ADDRESS_3, BLACKJACK_LEGACY_ADDRESS_4, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'
import { CustomApprovalModal } from '@/components/BLACKJACK/CustomApprovalModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Theme, getPanelStyles } from '@/lib/theme'
import { toast } from 'sonner'

interface DepositWithdrawModalProps {
  isOpen: boolean
  onClose: () => void
  onBalanceSync?: () => Promise<void> // Callback to sync balance after deposit/withdraw (overwrites DB with contract)
  onRefreshBalance?: () => Promise<void> // Callback to refresh display from server only (safe, no overwrite)
  onWithdrawSuccess?: () => void | Promise<void> // Optional: called after successful withdrawal (e.g. refetch contract reserve)
  contractReserve?: bigint // Contract reserve for withdrawals (still needed for withdraw limits)
  offChainBalance?: bigint // Off-chain balance from server (for display)
}

export function DepositWithdrawModal({ isOpen, onClose, onBalanceSync, onRefreshBalance, onWithdrawSuccess, contractReserve, offChainBalance }: DepositWithdrawModalProps) {
  // Display balance: prefer off-chain whenever it's defined (including 0 after withdraw), else contract reserve
  const displayBalance = (offChainBalance !== undefined && offChainBalance !== null)
    ? offChainBalance
    : (contractReserve !== undefined && contractReserve !== null ? contractReserve : BigInt(0));
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit')
  const [depositMethod, setDepositMethod] = useState<'pls' | 'morbius'>('pls')
  const [showApprovalModal, setShowApprovalModal] = useState(false)
  const [isPreparingWithdraw, setIsPreparingWithdraw] = useState(false)
  /** Amount to withdraw per legacy contract (address -> amount string). Lets users withdraw in chunks under the 1M contract limit. */
  const [legacyWithdrawAmounts, setLegacyWithdrawAmounts] = useState<Record<string, string>>({})

  // Legacy contracts cap withdrawal at 1,000,000 MORBIUS per tx (MAX_DAILY_WITHDRAWAL)
  const LEGACY_MAX_WITHDRAW_WEI = BigInt(1_000_000) * BigInt(1e18)

  // Contract hooks
  const {
    depositTx,
    depositMORBIISTx,
    deposit,
    depositMORBIUS,
    withdrawLegacy,
    withdrawWithSignature,
    withdrawTx,
    withdrawWithSignatureTx,
  } = useBlackjackContract()

  // Legacy contracts: balances in previous Blackjack contracts (after upgrades)
  const legacy1Reserve = useLegacyPlayerReserveAt(BLACKJACK_LEGACY_ADDRESS)
  const legacy1Paused = useLegacyEmergencyPausedAt(BLACKJACK_LEGACY_ADDRESS)
  const legacy2Reserve = useLegacyPlayerReserveAt(BLACKJACK_LEGACY_ADDRESS_2)
  const legacy2Paused = useLegacyEmergencyPausedAt(BLACKJACK_LEGACY_ADDRESS_2)
  const legacy3Reserve = useLegacyPlayerReserveAt(BLACKJACK_LEGACY_ADDRESS_3)
  const legacy3Paused = useLegacyEmergencyPausedAt(BLACKJACK_LEGACY_ADDRESS_3)
  const legacy4Reserve = useLegacyPlayerReserveAt(BLACKJACK_LEGACY_ADDRESS_4)
  const legacy4Paused = useLegacyEmergencyPausedAt(BLACKJACK_LEGACY_ADDRESS_4)
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
  const hasAnyLegacyBalance = legacyItems.some((item) => item.reserve > BigInt(0))

  // Balance hooks (pass address so PLS balance is actually fetched)
  const { balance: morbiusBalance } = useTokenBalance(address)
  const { balance: plsBalance } = useNativeBalance(address ?? undefined)

  // PLS quote for MORBIUS deposits
  const { plsValue: plsEquivalent, isLoading: plsQuoteLoading } = usePlsQuote({
    morbiusCost: depositAmount ? parseEther(depositAmount) : BigInt(0),
    enabled: activeTab === 'deposit' && depositMethod === 'pls' && depositAmount !== ''
  })

  // Token approval for MORBIUS deposits
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

  // Handle approval success
  useEffect(() => {
    if (isApprovalSuccess) {
      toast.success('Approval successful', {
        description: 'You can now deposit MORBIUS',
        duration: 5000,
      })
      setShowApprovalModal(false)
    }
  }, [isApprovalSuccess])

  // Do NOT auto-sync when modal opens. During play, off-chain balance is the source of truth
  // (bets/losses are deducted there); contract balance stays higher until user withdraws.
  // Syncing on open would overwrite correct off-chain balance with contract and "restore" lost bets.

  // Handle deposit PLS
  const handleDepositPLS = async () => {
    if (!depositAmount || !plsEquivalent || !publicClient) return

    // Show persistent loading toast
    const toastId = toast.loading('Confirm in wallet...', {
      description: `Depositing ${depositAmount} MORBIUS worth of PLS`,
    })

    try {
      const txHash = await deposit(plsEquivalent)

      // Update toast to show transaction is processing
      toast.loading('Transaction processing...', {
        id: toastId,
        description: 'Waiting for blockchain confirmation...',
      })

      // Wait for transaction receipt
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      // Dismiss loading and show success
      toast.success('Deposit successful', {
        id: toastId,
        description: `Deposited ${depositAmount} MORBIUS worth of PLS`,
        duration: 5000,
      })

      // Wait a brief moment for contract state to update, then sync balance
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Sync off-chain balance with contract (non-blocking: deposit already succeeded)
      if (onBalanceSync) {
        try {
          await onBalanceSync()
        } catch (syncErr) {
          console.error('Balance sync failed after deposit:', syncErr)
          toast.info('Refresh the page to update your balance', { duration: 4000 })
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

  // Handle deposit MORBIUS
  const handleDepositMORBIUS = async () => {
    if (!depositAmount || !publicClient) return

    // Check if approval is needed
    if (needsApproval) {
      setShowApprovalModal(true)
      return
    }

    // Show persistent loading toast
    const toastId = toast.loading('Confirm in wallet...', {
      description: `Depositing ${depositAmount} MORBIUS`,
    })

    try {
      const txHash = await depositMORBIUS(parseEther(depositAmount))

      // Update toast to show transaction is processing
      toast.loading('Transaction processing...', {
        id: toastId,
        description: 'Waiting for blockchain confirmation...',
      })

      // Wait for transaction receipt
      await publicClient.waitForTransactionReceipt({ hash: txHash })

      // Show success
      toast.success('Deposit successful', {
        id: toastId,
        description: `Deposited ${depositAmount} MORBIUS`,
        duration: 5000,
      })

      // Sync off-chain balance with contract (non-blocking: deposit already succeeded)
      if (onBalanceSync) {
        try {
          await onBalanceSync()
        } catch (syncErr) {
          console.error('Balance sync failed after deposit:', syncErr)
          toast.info('Refresh the page to update your balance', { duration: 4000 })
        }
      }
      setDepositAmount('')
    } catch (error: any) {
      console.error('Deposit failed:', error)

      // Check if error is due to insufficient allowance
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

  // Handle approval from modal
  const handleApprove = (amount: bigint) => {
    // #region agent log
    // #endregion
    approve(amount)
  }

  // Handle withdrawal - uses server-signed withdrawWithSignature for off-chain balance support
  const handleWithdraw = async () => {
    if (!withdrawAmount || !publicClient || !address) return

    const amountWei = parseEther(withdrawAmount)

    // Validate amount is positive
    if (amountWei <= BigInt(0)) {
      toast.error('Invalid amount', {
        description: 'Please enter a positive amount to withdraw',
      })
      return
    }

    // Validate against off-chain balance (source of truth for game winnings)
    if (offChainBalance !== undefined && offChainBalance !== null && amountWei > offChainBalance) {
      toast.error('Insufficient balance', {
        description: `Your withdrawable balance is ${Math.floor(Number(formatEther(offChainBalance))).toLocaleString()} MORBIUS`,
      })
      return
    }

    setIsPreparingWithdraw(true)

    // Show persistent loading toast
    const toastId = toast.loading('Preparing withdrawal...', {
      description: 'Getting server authorization...',
    })

    try {
      // Step 1: Get server signature for the withdrawal
      const serverUrl = getBlackjackServerUrl()
      const response = await fetch(`${serverUrl}/api/withdraw/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address,
          requestedAmount: amountWei.toString(),
        }),
      })

      if (response.status === 409) {
        setIsPreparingWithdraw(false)
        const data = await response.json().catch(() => ({}))
        const msg = data?.error || 'Withdrawal conflict.'
        toast.error('Withdrawal failed', { id: toastId, description: msg })
        return
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Server error: ${response.status}`)
      }

      const { amount, nonce, v, r, s } = await response.json()

      // Server authorization complete, wallet tx state will take over
      setIsPreparingWithdraw(false)

      // Update toast for wallet confirmation
      toast.loading('Confirm in wallet...', {
        id: toastId,
        description: `Withdrawing ${Math.floor(Number(formatEther(BigInt(amount)))).toLocaleString()} MORBIUS`,
      })

      // Step 2: Call the contract with the server signature
      const txHash = await withdrawWithSignature(
        BigInt(amount),
        BigInt(nonce),
        v,
        r as `0x${string}`,
        s as `0x${string}`
      )

      // Update toast for blockchain confirmation
      toast.loading('Transaction processing...', {
        id: toastId,
        description: 'Waiting for blockchain confirmation...',
      })

      await publicClient.waitForTransactionReceipt({ hash: txHash })

      // Mark pending withdrawal completed so expiry cron never refunds (prevents double withdrawal)
      let confirmOk = false
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(`${serverUrl}/api/withdraw/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, nonce: String(nonce) }),
          })
          if (res.ok) {
            confirmOk = true
            break
          }
        } catch (e) {
          console.error(`Withdraw confirm attempt ${attempt} failed:`, e)
        }
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1000))
      }
      if (!confirmOk) {
        console.error('Withdraw confirm failed after 3 attempts — balance may double-credit if you withdraw again. Refresh the page.')
      }

      // Show success
      toast.success('Withdrawal successful', {
        id: toastId,
        description: `Withdrew ${Math.floor(Number(formatEther(BigInt(amount)))).toLocaleString()} MORBIUS`,
        duration: 5000,
      })

      await new Promise(resolve => setTimeout(resolve, 1000))
      if (onBalanceSync) {
        try {
          await onBalanceSync()
        } catch (syncErr) {
          console.error('Balance sync failed after withdrawal:', syncErr)
          toast.info('Refresh the page to update your balance', { duration: 4000 })
        }
      }
      if (onWithdrawSuccess) {
        try {
          await Promise.resolve(onWithdrawSuccess())
        } catch (err) {
          console.error('onWithdrawSuccess failed:', err)
        }
      }
      setWithdrawAmount('')
    } catch (error: any) {
      setIsPreparingWithdraw(false)
      console.error('Withdrawal failed:', error)

      // Parse specific error types for better user feedback
      const errorMessage = error?.message || ''

      if (errorMessage.includes('rejected') || errorMessage.includes('denied') || errorMessage.includes('cancelled')) {
        toast.error('Transaction cancelled', {
          id: toastId,
          description: 'You cancelled the transaction',
        })
      } else if (errorMessage.includes('Insufficient') || errorMessage.includes('insufficient')) {
        toast.error('Insufficient balance', {
          id: toastId,
          description: errorMessage,
        })
      } else if (errorMessage.includes('gas')) {
        toast.error('Gas estimation failed', {
          id: toastId,
          description: 'Unable to estimate gas. The transaction may fail.',
        })
      } else if (errorMessage.includes('Server error') || errorMessage.includes('fetch')) {
        toast.error('Server error', {
          id: toastId,
          description: 'Could not connect to the game server. Please try again.',
        })
      } else {
        toast.error('Withdrawal failed', {
          id: toastId,
          description: errorMessage.slice(0, 100) || 'There was an error processing your withdrawal',
        })
      }
    }
  }

  const maxDepositPLS = plsBalance ? Math.floor(Number(formatEther(plsBalance))) : 0
  const maxDepositMORBIUS = morbiusBalance ? Math.floor(Number(formatEther(morbiusBalance))) : 0
  // Withdrawable = off-chain balance (server signs up to dbBalance; contract handles liquidity/daily limits)
  const maxWithdraw =
    offChainBalance !== undefined && offChainBalance !== null
      ? Math.floor(Number(formatEther(offChainBalance)))
      : contractReserve !== undefined && contractReserve !== null
        ? Math.floor(Number(formatEther(contractReserve)))
        : 0

  const isDepositLoading = depositTx.isPending || depositMORBIISTx.isPending
  const isWithdrawLoading = isPreparingWithdraw || withdrawWithSignatureTx.isPending
  const isLegacyWithdrawLoading = withdrawTx.isPending

  const handleWithdrawLegacy = async (legacyAddress: `0x${string}`, amount: bigint, refetch: () => void) => {
    if (amount <= 0n) return
    const toastId = toast.loading('Confirm in wallet...', {
      description: `Withdrawing ${Math.floor(Number(formatEther(amount))).toLocaleString()} MORBIUS from previous contract`,
    })
    try {
      const txHash = await withdrawLegacy(legacyAddress, amount)
      toast.loading('Transaction processing...', { id: toastId, description: 'Waiting for confirmation...' })
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash: txHash })
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
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`fixed inset-0 z-50 ${Theme.modal.overlay}`}
              onClick={onClose}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-[50px] left-1/2 -translate-x-1/2 z-50 pointer-events-none p-3"
            >
              <Card
                className={`w-[92vw] max-w-[42rem] sm:max-w-[48rem] lg:max-w-4xl xl:max-w-5xl max-h-[85vh] flex flex-col overflow-hidden pointer-events-auto rounded-2xl ${Theme.modal.container}`}
                style={{ boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}
              >
                <CardHeader className={`flex flex-row items-center justify-between space-y-0 py-2 px-4 shrink-0 rounded-t-2xl ${Theme.modal.header}`}>
                  <CardTitle className="text-white text-sm font-bold">Reserve Management</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="text-white/80 hover:text-white hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </CardHeader>

                <CardContent className="px-4 pb-4 pt-2 flex flex-col min-h-0 overflow-hidden">
                  {(isDepositLoading || isWithdrawLoading || isLegacyWithdrawLoading) && (
                    <div className="flex items-center gap-1.5 py-1 px-2 rounded text-xs text-yellow-400 border border-cyan-500/30 bg-cyan-950/20 shrink-0 mb-2">
                      <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                      <span>Confirming...</span>
                    </div>
                  )}

                  {/* Always 2 cols: left = balances, right = deposit/withdraw — width only, no extra height */}
                  <div className="grid grid-cols-2 gap-4 min-h-0 flex-1 overflow-hidden">
                    <div className="space-y-2 min-h-0 overflow-y-auto pr-1" style={{ ...getPanelStyles('base'), borderRadius: 8, padding: 10 }}>
                      {legacyItems
                        .filter((item) => item.reserve > BigInt(0))
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
                            <div key={item.address} className="rounded border border-cyan-500/30 bg-slate-900/60 p-2 space-y-1" style={{ ...Theme.inset }}>
                              <div className="text-xs font-medium text-cyan-200">{item.label}</div>
                              {item.paused ? (
                                <p className="text-[11px] text-cyan-300/80">Withdrawals paused.</p>
                              ) : (
                                <p className="text-[11px] text-cyan-300/60">Max 1M per withdrawal.</p>
                              )}
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1">
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder={formatEther(maxAllowedWei)}
                                    value={rawInput}
                                    onChange={(e) => setLegacyWithdrawAmounts((prev) => ({ ...prev, [item.address]: e.target.value }))}
                                    className="h-7 text-xs bg-slate-800 border-cyan-500/30 text-white max-w-[100px]"
                                  />
                                  <Button type="button" variant="outline" size="sm" onClick={setMax} className="h-7 px-1.5 border-cyan-500/30 text-cyan-300 text-[11px] shrink-0">
                                    Max
                                  </Button>
                                </div>
                                <div className="flex items-center justify-between gap-1 flex-wrap">
                                  <span className="text-xs font-semibold text-white">
                                    {Math.floor(Number(formatEther(item.reserve))).toLocaleString()} MORBIUS
                                  </span>
                                  <Button
                                    size="sm"
                                    onClick={() => validAmount && handleWithdrawLegacy(item.address, amountWei, item.refetch)}
                                    disabled={item.paused || isLegacyWithdrawLoading || !validAmount}
                                    className={`h-7 text-[11px] shrink-0 disabled:opacity-60 ${Theme.cyan.gradient.button} ${Theme.cyan.gradient.buttonHover} text-white border-0`}
                                  >
                                    {isLegacyWithdrawLoading ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : item.paused ? (
                                      'Paused'
                                    ) : (
                                      'Withdraw'
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      <div className="text-center py-2 px-2 rounded border border-cyan-500/30 bg-slate-900/60" style={{ ...Theme.inset }}>
                        <div className="text-[11px] text-cyan-300/70">Current Balance</div>
                        <div className="text-base font-bold text-white">
                          {displayBalance ? Math.floor(Number(formatEther(displayBalance))).toLocaleString() : 0} MORBIUS
                        </div>
                        {contractReserve && contractReserve !== displayBalance && (
                          <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
                            <span className="text-[10px] text-cyan-300/60">
                              On-chain: {Math.floor(Number(formatEther(contractReserve))).toLocaleString()}
                            </span>
                            {onBalanceSync && contractReserve > displayBalance && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  toast.info('Syncing...')
                                  try {
                                    await onBalanceSync()
                                    toast.success('Synced!', { duration: 3000 })
                                  } catch (error) {
                                    console.error('Sync failed:', error)
                                    toast.error('Sync failed.')
                                  }
                                }}
                                className="h-5 px-1 text-[10px] border-cyan-500/30 text-cyan-300"
                              >
                                Sync
                              </Button>
                            )}
                            {onRefreshBalance && contractReserve <= displayBalance && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  toast.info('Refreshing...')
                                  try {
                                    await onRefreshBalance()
                                    toast.success('Refreshed', { duration: 3000 })
                                  } catch (error) {
                                    console.error('Refresh failed:', error)
                                    toast.error('Refresh failed.')
                                  }
                                }}
                                className="h-5 px-1 text-[10px] border-cyan-500/30 text-cyan-300"
                              >
                                Refresh
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="rounded border border-cyan-500/20 bg-slate-900/50 p-2 shrink-0">
                        <p className="text-[10px] text-cyan-300/70 leading-snug">
                          Withdrawals are capped at 1,000,000 MORBIUS per user per day. Our contracts and code are battle-tested, but we recommend withdrawing your funds at the end of each play session as a safe practice.
                        </p>
                      </div>
                    </div>

                    <div className="min-h-0 flex flex-col overflow-hidden">
                  <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'deposit' | 'withdraw')} className="flex flex-col min-h-0">
                    <TabsList className="grid w-full grid-cols-2 h-8 bg-slate-800/80 border border-cyan-500/30 rounded-lg p-0.5 shrink-0">
                      <TabsTrigger
                        value="deposit"
                        className="text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 data-[state=active]:text-white rounded-md"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Deposit
                      </TabsTrigger>
                      <TabsTrigger
                        value="withdraw"
                        className="text-xs data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 data-[state=active]:text-white rounded-md"
                      >
                        <Minus className="w-3 h-3 mr-1" />
                        Withdraw
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="deposit" className="space-y-2 mt-2 min-h-0 overflow-y-auto">
                      <div className="flex gap-1">
                        <Button
                          variant={depositMethod === 'pls' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setDepositMethod('pls')}
                          className={`flex-1 h-7 text-xs ${depositMethod === 'pls' ? Theme.cyan.gradient.button : 'border-cyan-500/30 text-cyan-300'}`}
                        >
                          PLS
                        </Button>
                        <Button
                          variant={depositMethod === 'morbius' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setDepositMethod('morbius')}
                          className={`flex-1 h-7 text-xs ${depositMethod === 'morbius' ? Theme.cyan.gradient.button : 'border-cyan-500/30 text-cyan-300'}`}
                        >
                          MORBIUS
                        </Button>
                      </div>
                      <div className="space-y-0.5">
                        <Label htmlFor="deposit-amount" className="text-[11px] text-cyan-300/80">
                          Amount ({depositMethod === 'pls' ? 'MORBIUS equiv.' : 'MORBIUS'})
                        </Label>
                        <Input
                          id="deposit-amount"
                          type="number"
                          placeholder="0"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          min="0"
                          step="1"
                          max={depositMethod === 'pls' ? maxDepositPLS : maxDepositMORBIUS}
                          className="h-7 text-sm bg-slate-800 border-cyan-500/30 text-white"
                        />
                      </div>
                      <div className="text-[10px] text-cyan-300/60">
                        {depositMethod === 'pls' ? (
                          <>Avail: {maxDepositPLS} PLS{plsEquivalent && depositAmount && <> · ≈{Math.floor(Number(formatEther(plsEquivalent)))} PLS</>}</>
                        ) : (
                          <>Avail: {maxDepositMORBIUS} MORBIUS</>
                        )}
                      </div>
                      <Button
                        onClick={depositMethod === 'pls' ? handleDepositPLS : handleDepositMORBIUS}
                        disabled={
                          !depositAmount ||
                          isDepositLoading ||
                          plsQuoteLoading ||
                          (depositMethod === 'morbius' && isLoadingAllowance) ||
                          (depositMethod === 'morbius' && isApproving)
                        }
                        className={`w-full h-7 text-xs ${Theme.cyan.gradient.button} ${Theme.cyan.gradient.buttonHover} text-white border-0`}
                      >
                        {isDepositLoading ? (
                          <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing...</>
                        ) : depositMethod === 'morbius' && isApproving ? (
                          <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Approving...</>
                        ) : depositMethod === 'morbius' && needsApproval ? (
                          'Approve'
                        ) : (
                          `Deposit ${depositMethod === 'pls' ? 'PLS' : 'MORBIUS'}`
                        )}
                      </Button>
                    </TabsContent>

                    <TabsContent value="withdraw" className="space-y-2 mt-2 min-h-0 overflow-y-auto">
                      <div className="space-y-0.5">
                        <Label htmlFor="withdraw-amount" className="text-[11px] text-cyan-300/80">Amount (MORBIUS)</Label>
                        <Input
                          id="withdraw-amount"
                          type="number"
                          placeholder="0"
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          min="0"
                          step="1"
                          max={maxWithdraw}
                          className="h-7 text-sm bg-slate-800 border-cyan-500/30 text-white"
                        />
                      </div>
                      <div className="text-[10px] text-cyan-300/60">Avail: {maxWithdraw} MORBIUS</div>
                      <Button
                        onClick={handleWithdraw}
                        disabled={!withdrawAmount || isWithdrawLoading}
                        className={`w-full h-7 text-xs ${Theme.cyan.gradient.button} ${Theme.cyan.gradient.buttonHover} text-white border-0`}
                      >
                        {isWithdrawLoading ? (
                          <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing...</>
                        ) : (
                          'Withdraw MORBIUS'
                        )}
                      </Button>
                    </TabsContent>
                  </Tabs>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      {/* Approval Modal */}
      <CustomApprovalModal
        open={showApprovalModal}
        onOpenChange={setShowApprovalModal}
        onApprove={handleApprove}
        isApproving={isApproving}
        tokenSymbol="MORBIUS"
        spenderName="Blackjack Contract"
      />
    </>
  )
}