'use client'

import { useEffect, useState } from 'react'
import { useWaitForTransactionReceipt } from 'wagmi'
import { Card } from '@/components/ui/card'
import { Loader2, CheckCircle2, XCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TransactionStatusWidgetProps {
  hash?: `0x${string}`
  type?: 'approval' | 'purchase'
  onComplete?: () => void
  onDismiss?: () => void
}

export function TransactionStatusWidget({
  hash,
  type = 'purchase',
  onComplete,
  onDismiss,
}: TransactionStatusWidgetProps) {
  const [isDismissed, setIsDismissed] = useState(false)
  const [autoHideTimer, setAutoHideTimer] = useState<NodeJS.Timeout | null>(null)

  const {
    isLoading,
    isSuccess,
    isError,
  } = useWaitForTransactionReceipt({
    hash,
  })

  useEffect(() => {
    if (isSuccess) {
      onComplete?.()
      // Auto-hide after 5 seconds on success
      const timer = setTimeout(() => {
        setIsDismissed(true)
        onDismiss?.()
      }, 5000)
      setAutoHideTimer(timer)
    }
  }, [isSuccess, onComplete, onDismiss])

  useEffect(() => {
    return () => {
      if (autoHideTimer) {
        clearTimeout(autoHideTimer)
      }
    }
  }, [autoHideTimer])

  const handleDismiss = () => {
    setIsDismissed(true)
    onDismiss?.()
    if (autoHideTimer) {
      clearTimeout(autoHideTimer)
    }
  }

  if (!hash || isDismissed) {
    return null
  }

  const getStatusConfig = () => {
    if (isLoading) {
      return {
        icon: <Loader2 className="h-5 w-5 animate-spin text-blue-400" />,
        title: type === 'approval' ? 'Approving...' : 'Purchasing Tickets...',
        description: 'Please wait while your transaction is being confirmed',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/30',
      }
    }
    if (isSuccess) {
      return {
        icon: <CheckCircle2 className="h-5 w-5 text-green-400" />,
        title: type === 'approval' ? 'Approved!' : 'Purchase Successful!',
        description: type === 'approval' ? 'You can now proceed with purchase' : 'Your tickets have been purchased',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/30',
      }
    }
    if (isError) {
      return {
        icon: <XCircle className="h-5 w-5 text-red-400" />,
        title: 'Transaction Failed',
        description: 'Please try again or contact support',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/30',
      }
    }
    return {
      icon: <Loader2 className="h-5 w-5 animate-spin text-blue-400" />,
      title: 'Processing...',
      description: 'Transaction is being processed',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/30',
    }
  }

  const config = getStatusConfig()

  return (
    <Card
      className={cn(
        'fixed top-20 right-4 z-50 w-80 p-4 shadow-lg backdrop-blur-md border',
        config.bgColor,
        config.borderColor,
        'animate-in slide-in-from-right duration-300'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {config.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-white mb-1">
                {config.title}
              </h4>
              <p className="text-xs text-white/60">
                {config.description}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 flex-shrink-0 hover:bg-white/10"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {hash && (
            <a
              href={`https://scan.pulsechain.com/tx/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline mt-2 inline-block"
            >
              View on PulseScan →
            </a>
          )}
        </div>
      </div>
    </Card>
  )
}
