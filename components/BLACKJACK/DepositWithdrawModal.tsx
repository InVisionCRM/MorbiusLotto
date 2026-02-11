'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Minus, Loader2 } from 'lucide-react'
import { useAccount, usePublicClient } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { useTokenBalance } from '@/hooks/use-token'
import { useNativeBalance } from '@/hooks/use-native-balance'
import { usePlsQuote } from '@/hooks/use-pls-quote'
import { useBlackjackContract, useLegacyPlayerReserve } from '@/hooks/use-blackjack-contract'
import { useTokenApproval } from '@/hooks/use-token-approval'
import { getBlackjackServerUrl } from '@/lib/api-urls'
import { BLACKJACK_ADDRESS, BLACKJACK_LEGACY_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'
import { CustomApprovalModal } from '@/components/BLACKJACK/CustomApprovalModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

interface DepositWithdrawModalProps {
  isOpen: boolean
  onClose: () => void
  onBalanceSync?: () => Promise<void> // Callback to sync balance after deposit/withdraw (overwrites DB with contract)
  onRefreshBalance?: () => Promise<void> // Callback to refresh display from server only (safe, no overwrite)
  contractReserve?: bigint // Contract reserve for withdrawals (still needed for withdraw limits)
  offChainBalance?: bigint // Off-chain balance from server (for display)
}

export function DepositWithdrawModal({ isOpen, onClose, onBalanceSync, onRefreshBalance, contractReserve, offChainBalance }: DepositWithdrawModalProps) {
  // Display balance: prefer off-chain balance (most up-to-date), fallback to contract reserve
  // Use offChainBalance if available and > 0, otherwise use contractReserve
  const displayBalance = (offChainBalance !== undefined && offChainBalance !== null && offChainBalance > BigInt(0))
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

  // Legacy contract: balance in previous Blackjack contract (after upgrade)
  const legacyReserveQuery = useLegacyPlayerReserve()
  const legacyReserve = (legacyReserveQuery.data ?? BigInt(0)) as bigint
  const hasLegacyBalance = BLACKJACK_LEGACY_ADDRESS && legacyReserve > BigInt(0)

  // Balance hooks
  const { balance: morbiusBalance } = useTokenBalance(address)
  const { balance: plsBalance } = useNativeBalance()

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

      // Sync off-chain balance with contract
      if (onBalanceSync) {
        await onBalanceSync()
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

      // Sync off-chain balance with contract
      if (onBalanceSync) {
        await onBalanceSync()
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
    fetch('http://127.0.0.1:7244/ingest/3e24c92c-45ff-45dc-a058-ffe6e9196f8c',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'DepositWithdrawModal.tsx:209',message:'handleApprove called from modal',data:{amount:amount.toString(),needsApproval,isApproving,hasAddress:!!address},timestamp:Date.now(),runId:'run1',hypothesisId:'A'})}).catch(()=>{});
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

      // Show success
      toast.success('Withdrawal successful', {
        id: toastId,
        description: `Withdrew ${Math.floor(Number(formatEther(BigInt(amount)))).toLocaleString()} MORBIUS`,
        duration: 5000,
      })

      await new Promise(resolve => setTimeout(resolve, 1000))
      if (onBalanceSync) {
        await onBalanceSync()
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
  // Cap by off-chain balance (source of truth) so user cannot withdraw more than they have
  const maxWithdraw =
    contractReserve !== undefined &&
    contractReserve !== null &&
    offChainBalance !== undefined &&
    offChainBalance !== null
      ? Math.min(
          Math.floor(Number(formatEther(contractReserve))),
          Math.floor(Number(formatEther(offChainBalance)))
        )
      : contractReserve
        ? Math.floor(Number(formatEther(contractReserve)))
        : 0

  const isDepositLoading = depositTx.isPending || depositMORBIISTx.isPending
  const isWithdrawLoading = isPreparingWithdraw || withdrawWithSignatureTx.isPending
  const isLegacyWithdrawLoading = withdrawTx.isPending

  const handleWithdrawLegacy = async () => {
    if (!hasLegacyBalance || legacyReserve <= 0n) return
    const toastId = toast.loading('Confirm in wallet...', {
      description: `Withdrawing ${Math.floor(Number(formatEther(legacyReserve))).toLocaleString()} MORBIUS from previous contract`,
    })
    try {
      const txHash = await withdrawLegacy(legacyReserve)
      toast.loading('Transaction processing...', { id: toastId, description: 'Waiting for confirmation...' })
      if (publicClient) await publicClient.waitForTransactionReceipt({ hash: txHash })
      toast.success('Withdrawal successful', {
        id: toastId,
        description: `Withdrew ${Math.floor(Number(formatEther(legacyReserve))).toLocaleString()} MORBIUS from previous contract`,
        duration: 5000,
      })
      legacyReserveQuery.refetch()
      if (onRefreshBalance) await onRefreshBalance()
    } catch (e: any) {
      toast.error(e?.message?.slice(0, 80) || 'Withdrawal failed', { id: toastId })
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
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
              onClick={onClose}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-[50px] left-1/2 -translate-x-1/2 z-50 pointer-events-none p-4"
            >
              <Card className="w-full max-w-md bg-gradient-to-br from-gray-900 to-black border-gray-700 shadow-2xl pointer-events-auto">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                  <CardTitle className="text-white text-lg font-bold">Reserve Management</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="text-gray-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </CardHeader>

                <CardContent className="space-y-6">
                  {/* Transaction Status Indicator */}
                  {(isDepositLoading || isWithdrawLoading || isLegacyWithdrawLoading) && (
                    <div className="flex items-center justify-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                      <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />
                      <span className="text-sm text-yellow-400 font-medium">
                        Waiting for blockchain confirmation...
                      </span>
                    </div>
                  )}

                  {/* Previous contract balance (after upgrade) */}
                  {hasLegacyBalance && (
                    <div className="p-4 rounded-lg border border-amber-500/40 bg-amber-950/30 space-y-2">
                      <div className="text-sm font-medium text-amber-200">
                        Balance in previous contract
                      </div>
                      <p className="text-xs text-amber-200/80">
                        You have MORBIUS in the previous Blackjack contract. Withdraw it to your wallet (no server needed).
                      </p>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-lg font-bold text-white">
                          {Math.floor(Number(formatEther(legacyReserve))).toLocaleString()} MORBIUS
                        </span>
                        <Button
                          onClick={handleWithdrawLegacy}
                          disabled={isLegacyWithdrawLoading}
                          className="bg-amber-600 hover:bg-amber-500 text-white shrink-0"
                        >
                          {isLegacyWithdrawLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            'Withdraw to wallet'
                          )}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Current Reserve Balance */}
                  <div className="text-center p-4 bg-gradient-to-r from-blue-900/20 to-purple-900/20 rounded-lg border border-blue-500/20">
                    <div className="text-sm text-gray-400 mb-1">Current Balance</div>
                    <div className="text-2xl font-bold text-white">
                      {displayBalance ? Math.floor(Number(formatEther(displayBalance))).toLocaleString() : 0} MORBIUS
                    </div>
                    {/* Show contract reserve if different from display (e.g. during play, display = off-chain) */}
                    {contractReserve && contractReserve !== displayBalance && (
                      <div className="flex items-center justify-center gap-2 mt-2">
                        <div className="text-xs text-yellow-400">
                          On-chain: {Math.floor(Number(formatEther(contractReserve))).toLocaleString()} MORBIUS
                        </div>
                        {/* If on-chain > display, show Sync button to sync on-chain → DB */}
                        {onBalanceSync && contractReserve > displayBalance && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              toast.info('Syncing balance...')
                              try {
                                await onBalanceSync()
                                toast.success('Balance synced!', { duration: 3000 })
                              } catch (error) {
                                console.error('Sync failed:', error)
                                toast.error('Sync failed. Please try again.')
                              }
                            }}
                            className="h-6 px-2 text-xs bg-yellow-600/20 border-yellow-500/50 text-yellow-400 hover:bg-yellow-600/30"
                          >
                            Sync
                          </Button>
                        )}
                        {/* Otherwise show Refresh button to just refresh display */}
                        {onRefreshBalance && contractReserve <= displayBalance && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              toast.info('Refreshing...')
                              try {
                                await onRefreshBalance()
                                toast.success('Balance refreshed', { duration: 3000 })
                              } catch (error) {
                                console.error('Refresh failed:', error)
                                toast.error('Refresh failed. Please try again.')
                              }
                            }}
                            className="h-6 px-2 text-xs bg-yellow-600/20 border-yellow-500/50 text-yellow-400 hover:bg-yellow-600/30"
                          >
                            Refresh
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'deposit' | 'withdraw')}>
                    <TabsList className="grid w-full grid-cols-2 bg-gray-800">
                      <TabsTrigger
                        value="deposit"
                        className="data-[state=active]:bg-green-600 data-[state=active]:text-white"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Deposit
                      </TabsTrigger>
                      <TabsTrigger
                        value="withdraw"
                        className="data-[state=active]:bg-red-600 data-[state=active]:text-white"
                      >
                        <Minus className="w-4 h-4 mr-2" />
                        Withdraw
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="deposit" className="space-y-4">
                      {/* Deposit Method Selection */}
                      <div className="flex space-x-2">
                        <Button
                          variant={depositMethod === 'pls' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setDepositMethod('pls')}
                          className="flex-1"
                        >
                          Deposit PLS
                        </Button>
                        <Button
                          variant={depositMethod === 'morbius' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setDepositMethod('morbius')}
                          className="flex-1"
                        >
                          Deposit MORBIUS
                        </Button>
                      </div>

                      {/* Deposit Amount Input */}
                      <div className="space-y-2">
                        <Label htmlFor="deposit-amount" className="text-white">
                          Amount ({depositMethod === 'pls' ? 'MORBIUS equivalent' : 'MORBIUS'})
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
                          className="bg-gray-800 border-gray-600 text-white"
                        />
                      </div>

                      {/* Balance Display */}
                      <div className="text-sm text-gray-400">
                        {depositMethod === 'pls' ? (
                          <>
                            Available: {maxDepositPLS} PLS
                            {plsEquivalent && depositAmount && (
                              <div className="text-green-400">
                                ≈ {Math.floor(Number(formatEther(plsEquivalent)))} PLS required
                              </div>
                            )}
                          </>
                        ) : (
                          <>Available: {maxDepositMORBIUS} MORBIUS</>
                        )}
                      </div>

                      {/* Deposit Button */}
                      <Button
                        onClick={depositMethod === 'pls' ? handleDepositPLS : handleDepositMORBIUS}
                        disabled={
                          !depositAmount || 
                          isDepositLoading || 
                          plsQuoteLoading || 
                          (depositMethod === 'morbius' && isLoadingAllowance) ||
                          (depositMethod === 'morbius' && isApproving)
                        }
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        {isDepositLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing Transaction...
                          </>
                        ) : depositMethod === 'morbius' && isApproving ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Waiting for Approval...
                          </>
                        ) : depositMethod === 'morbius' && needsApproval ? (
                          'Approve Required'
                        ) : (
                          `Deposit ${depositMethod === 'pls' ? 'PLS' : 'MORBIUS'}`
                        )}
                      </Button>
                    </TabsContent>

                    <TabsContent value="withdraw" className="space-y-4">
                      {/* Withdraw Amount Input */}
                      <div className="space-y-2">
                        <Label htmlFor="withdraw-amount" className="text-white">
                          Amount (MORBIUS)
                        </Label>
                        <Input
                          id="withdraw-amount"
                          type="number"
                          placeholder="0"
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          min="0"
                          step="1"
                          max={maxWithdraw}
                          className="bg-gray-800 border-gray-600 text-white"
                        />
                      </div>

                      {/* Available Balance */}
                      <div className="text-sm text-gray-400">
                        Available: {maxWithdraw} MORBIUS
                      </div>

                      {/* Withdraw Button */}
                      <Button
                        onClick={handleWithdraw}
                        disabled={!withdrawAmount || isWithdrawLoading}
                        className="w-full bg-red-600 hover:bg-red-700"
                      >
                        {isWithdrawLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing Transaction...
                          </>
                        ) : (
                          'Withdraw MORBIUS'
                        )}
                      </Button>
                    </TabsContent>
                  </Tabs>
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