'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Ticket } from 'lucide-react'
import { KenoTicketPurchaseBuilder } from './keno-ticket-purchase-builder'

interface KenoTicketPurchaseModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  initialSpotSize?: number
  initialWager?: number
  initialDraws?: number
  initialMultiplier?: boolean
  initialBullsEye?: boolean
  initialPlus3?: boolean
  initialProgressive?: boolean
  initialPaymentMethod?: 'morbius' | 'pls'
  onSuccess?: () => void
  onError?: (error: Error) => void
  onStateChange?: (config: {
    selectedNumbers: number[]
    spotSize: number
    wager: number
    draws: number
    multiplier: boolean
    bullsEye: boolean
    plus3: boolean
    progressive: boolean
    paymentMethod: 'morbius' | 'pls'
  }) => void
}

export function KenoTicketPurchaseModal({
  isOpen,
  onOpenChange,
  initialSpotSize = 8,
  initialWager = 0.001,
  initialDraws = 5,
  initialMultiplier = false,
  initialBullsEye = false,
  initialPlus3 = false,
  initialProgressive = false,
  initialPaymentMethod = 'morbius',
  onSuccess,
  onError,
  onStateChange,
}: KenoTicketPurchaseModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/95 border-white/20 text-white max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold">Build Your Keno Ticket</DialogTitle>
        </DialogHeader>

        <div className="mt-6">
          <KenoTicketPurchaseBuilder
            initialSpotSize={initialSpotSize}
            initialWager={initialWager}
            initialDraws={initialDraws}
            initialMultiplier={initialMultiplier}
            initialBullsEye={initialBullsEye}
            initialPlus3={initialPlus3}
            initialProgressive={initialProgressive}
            initialPaymentMethod={initialPaymentMethod}
            onSuccess={() => {
              onSuccess?.()
              onOpenChange(false) // Close modal on success
            }}
            onError={onError}
            onStateChange={onStateChange}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Keep the old name for backward compatibility but it now acts as a modal trigger
export function KenoTicketPurchaseAccordion(props: KenoTicketPurchaseModalProps) {
  return <KenoTicketPurchaseModal {...props} />
}