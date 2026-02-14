'use client'

import React, { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Loader2 } from 'lucide-react'
import { parseEther } from 'viem'

interface CustomApprovalModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onApprove: (amount: bigint) => void
  isApproving: boolean
  tokenSymbol: string
  spenderName: string
}

const MAX_UINT256 = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935')

const APPROVAL_PRESETS = [
  { label: '1,000', value: '1000' },
  { label: '10,000', value: '10000' },
  { label: '50,000', value: '50000' },
  { label: '100,000', value: '100000' },
]

export function CustomApprovalModal({
  open,
  onOpenChange,
  onApprove,
  isApproving,
  tokenSymbol,
  spenderName
}: CustomApprovalModalProps) {
  const [approvalType, setApprovalType] = useState<'unlimited' | 'custom'>('unlimited')
  const [customAmount, setCustomAmount] = useState<string>('10000')

  const handleApprove = () => {
    try {
      const amount = approvalType === 'unlimited'
        ? MAX_UINT256
        : parseEther(customAmount)
      onApprove(amount)
      onOpenChange(false)
    } catch (error) {
      console.error('Invalid amount:', error)
    }
  }

  const handlePresetClick = (amount: string) => {
    setCustomAmount(amount)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-black/80 border-white/20">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <i className="fas fa-shield-alt text-cyan-400"></i>
            Approve {tokenSymbol} Spending
          </DialogTitle>
          <DialogDescription>
            Allow {spenderName} to spend your {tokenSymbol} tokens on your behalf
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Approval Type Selection */}
          <RadioGroup value={approvalType} onValueChange={(value) => setApprovalType(value as 'unlimited' | 'custom')}>
            <div className="space-y-3 text-white">
              <div className="relative flex items-start space-x-3 p-3 rounded-lg border border-cyan-500/20 text-white">
                {approvalType === 'unlimited' && (
                  <div className="absolute top-2 right-2">
                    <span className="text-xs font-medium text-blue-400 bg-blue-400/10 px-2 py-1 rounded">
                      Selected
                    </span>
                  </div>
                )}
                <RadioGroupItem value="unlimited" id="unlimited" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="unlimited" className="font-medium cursor-pointer">
                    Unlimited Approval (Recommended)
                  </Label>
                  <p className="text-sm text-white/80 mt-1">
                    Approve once and play without interruption. You can revoke approval anytime in your wallet.
                  </p>
                </div>
              </div>

              <div className="relative flex items-start space-x-3 p-3 rounded-lg border border-orange-500/20">
                {approvalType === 'custom' && (
                  <div className="absolute top-2 right-2">
                    <span className="text-xs font-medium text-blue-400 bg-blue-400/10 px-2 py-1 rounded">
                      Selected
                    </span>
                  </div>
                )}
                <RadioGroupItem value="custom" id="custom" className="mt-0.5" />
                <div className="flex-1">
                  <Label htmlFor="custom" className="font-medium cursor-pointer">
                    Custom Amount
                  </Label>
                  <p className="text-sm text-white/80 mt-1">
                    Set a specific spending limit for enhanced security.
                  </p>
                </div>
              </div>
            </div>
          </RadioGroup>

          {/* Custom Amount Input */}
          {approvalType === 'custom' && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="amount" className="text-sm font-medium">
                  Amount ({tokenSymbol})
                </Label>
                <Input
                  id="amount"
                  type="number"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="10000"
                  className="mt-1"
                  min="0"
                  step="0.01"
                />
              </div>

              {/* Preset Options */}
              <div>
                <Label className="text-sm font-medium text-white">Quick Select</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {APPROVAL_PRESETS.map(({ label, value }) => (
                    <Button
                      key={value}
                      variant="outline"
                      size="sm"
                      onClick={() => handlePresetClick(value)}
                      className="text-xs hover:bg-white/10"
                    >
                      {label} {tokenSymbol}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Security Notice */}
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div className="flex items-start gap-2">
              <i className="fas fa-info-circle text-yellow-400 mt-0.5"></i>
              <div>
                <p className="text-sm font-medium text-yellow-400">Security Note</p>
                <p className="text-xs text-white mt-1">
                  You can revoke approvals anytime through your wallet. Only approve what you trust.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isApproving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={isApproving || (approvalType === 'custom' && !customAmount)}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 disabled:opacity-50"
          >
            {isApproving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Waiting for Confirmation...
              </>
            ) : (
              <>
                <i className="fas fa-check mr-2"></i>
                Approve {approvalType === 'unlimited' ? 'Unlimited' : customAmount + ' ' + tokenSymbol}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}