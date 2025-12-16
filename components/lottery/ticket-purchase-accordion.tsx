'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Ticket } from 'lucide-react'
import { TicketPurchaseBuilder } from './ticket-purchase-builder'

interface TicketPurchaseModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  initialRounds?: number
  onSuccess?: () => void
  onError?: (error: Error) => void
  onStateChange?: (tickets: number[][], rounds: number) => void
}

export function TicketPurchaseModal({
  isOpen,
  onOpenChange,
  initialRounds = 1,
  onSuccess,
  onError,
  onStateChange,
}: TicketPurchaseModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black/95 border-white/20 text-white max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] overflow-x-hidden">

        <div className="mt-6">
          <TicketPurchaseBuilder
            initialRounds={initialRounds}
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
export function TicketPurchaseAccordion(props: TicketPurchaseModalProps) {
  return <TicketPurchaseModal {...props} />
}


