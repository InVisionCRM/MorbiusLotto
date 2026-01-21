'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Minus, Loader2 } from 'lucide-react'
import { useAccount } from 'wagmi'
import { parseEther, formatEther } from 'viem'
import { useTokenBalance } from '@/hooks/use-token'
import { useNativeBalance } from '@/hooks/use-native-balance'
import { usePlsQuote } from '@/hooks/use-pls-quote'
import { useBlackjackContract } from '@/hooks/use-blackjack-contract'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

interface DepositWithdrawModalProps {
  isOpen: boolean
  onClose: () => void
}

export function DepositWithdrawModal({ isOpen, onClose }: DepositWithdrawModalProps) {
  const { address } = useAccount()
  const [depositAmount, setDepositAmount] = useState('')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit')
  const [depositMethod, setDepositMethod] = useState<'pls' | 'morbius'>('pls')

  // Contract hooks
  const {
    playerReserve,
    depositTx,
    depositMORBIISTx,
    withdrawTx,
    refetchPlayerReserve
  } = useBlackjackContract()

  // Balance hooks
  const { balance: morbiusBalance } = useTokenBalance(address)
  const { balance: plsBalance } = useNativeBalance()

  // PLS quote for MORBIUS deposits
  const { plsValue: plsEquivalent, isLoading: plsQuoteLoading } = usePlsQuote({
    morbiusCost: depositAmount ? parseEther(depositAmount) : 0n,
    enabled: activeTab === 'deposit' && depositMethod === 'pls' && depositAmount !== ''
  })

  // Handle deposit PLS
  const handleDepositPLS = async () => {
    if (!depositAmount || !plsEquivalent) return

    try {
      const tx = await depositTx.writeContractAsync({
        address: process.env.NEXT_PUBLIC_BLACKJACK_ADDRESS as `0x${string}`,
        abi: [], // Will be provided by hook
        functionName: 'deposit',
        value: plsEquivalent,
      })

      toast({
        title: 'Deposit initiated',
        description: 'Your PLS deposit is being processed...',
      })

      // Wait for transaction
      await tx.wait()

      toast({
        title: 'Deposit successful',
        description: `Deposited ${depositAmount} MORBIUS worth of PLS`,
      })

      // Refresh data
      refetchPlayerReserve()
      setDepositAmount('')
    } catch (error) {
      console.error('Deposit failed:', error)
      toast({
        title: 'Deposit failed',
        description: 'There was an error processing your deposit',
        variant: 'destructive',
      })
    }
  }

  // Handle deposit MORBIUS
  const handleDepositMORBIUS = async () => {
    if (!depositAmount) return

    try {
      const tx = await depositMORBIISTx.writeContractAsync({
        address: process.env.NEXT_PUBLIC_BLACKJACK_ADDRESS as `0x${string}`,
        abi: [], // Will be provided by hook
        functionName: 'depositMORBIUS',
        args: [parseEther(depositAmount)],
      })

      toast({
        title: 'Deposit initiated',
        description: 'Your MORBIUS deposit is being processed...',
      })

      // Wait for transaction
      await tx.wait()

      toast({
        title: 'Deposit successful',
        description: `Deposited ${depositAmount} MORBIUS`,
      })

      // Refresh data
      refetchPlayerReserve()
      setDepositAmount('')
    } catch (error) {
      console.error('Deposit failed:', error)
      toast({
        title: 'Deposit failed',
        description: 'There was an error processing your deposit',
        variant: 'destructive',
      })
    }
  }

  // Handle withdrawal
  const handleWithdraw = async () => {
    if (!withdrawAmount) return

    try {
      const tx = await withdrawTx.writeContractAsync({
        address: process.env.NEXT_PUBLIC_BLACKJACK_ADDRESS as `0x${string}`,
        abi: [], // Will be provided by hook
        functionName: 'withdraw',
        args: [parseEther(withdrawAmount)],
      })

      toast({
        title: 'Withdrawal initiated',
        description: 'Your MORBIUS withdrawal is being processed...',
      })

      // Wait for transaction
      await tx.wait()

      toast({
        title: 'Withdrawal successful',
        description: `Withdrew ${withdrawAmount} MORBIUS`,
      })

      // Refresh data
      refetchPlayerReserve()
      setWithdrawAmount('')
    } catch (error) {
      console.error('Withdrawal failed:', error)
      toast({
        title: 'Withdrawal failed',
        description: 'There was an error processing your withdrawal',
        variant: 'destructive',
      })
    }
  }

  const maxDepositPLS = plsBalance ? Math.floor(Number(formatEther(plsBalance))) : 0
  const maxDepositMORBIUS = morbiusBalance ? Math.floor(Number(formatEther(morbiusBalance))) : 0
  const maxWithdraw = playerReserve ? Math.floor(Number(formatEther(playerReserve))) : 0

  const isDepositLoading = depositTx.isPending || depositMORBIISTx.isPending
  const isWithdrawLoading = withdrawTx.isPending

  return (
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
            className="fixed inset-4 md:inset-8 lg:inset-16 flex items-center justify-center z-50 pointer-events-none"
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
                {/* Current Reserve Balance */}
                <div className="text-center p-4 bg-gradient-to-r from-blue-900/20 to-purple-900/20 rounded-lg border border-blue-500/20">
                  <div className="text-sm text-gray-400 mb-1">Current Reserve</div>
                  <div className="text-2xl font-bold text-white">
                    {playerReserve ? Math.floor(Number(formatEther(playerReserve))) : 0} MORBIUS
                  </div>
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
                      disabled={!depositAmount || isDepositLoading || plsQuoteLoading}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      {isDepositLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing...
                        </>
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
                          Processing...
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
  )
}