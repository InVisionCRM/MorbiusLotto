'use client'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Gift, Info } from 'lucide-react'

interface FreeTicketBadgeProps {
  credits: number
  isLoading?: boolean
  variant?: 'badge' | 'card'
  className?: string
}

export function FreeTicketBadge({
  credits,
  isLoading = false,
  variant = 'badge',
  className = ''
}: FreeTicketBadgeProps) {
  if (isLoading) {
    return variant === 'badge' ? (
      <Badge variant="outline" className={`animate-pulse ${className}`}>
        <div className="h-4 w-16 bg-muted/50 rounded" />
      </Badge>
    ) : (
      <Card className={`p-4 ${className}`}>
        <div className="h-6 bg-muted/50 rounded animate-pulse" />
      </Card>
    )
  }

  if (credits === 0) {
    return null
  }

  if (variant === 'badge') {
    return (
      <Badge
        variant="outline"
        className={`
          bg-green-500/20 border-green-500/50 text-green-400
          hover:bg-green-500/30
          ${className}
        `}
        title="Earned from non-winning tickets, applied automatically at purchase"
      >
        <Gift className="h-3 w-3 mr-1" />
        {credits} Free Ticket{credits !== 1 ? 's' : ''}
      </Badge>
    )
  }

  return (
    <Card className={`p-4 bg-gradient-to-br from-green-900/20 to-emerald-900/20 border-green-500/30 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/20 rounded-lg">
            <Gift className="h-5 w-5 text-green-400" />
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Free Tickets</div>
            <div className="text-2xl font-bold text-green-400">
              {credits}
            </div>
          </div>
        </div>
        <div className="p-1.5 hover:bg-accent rounded-full transition-colors group relative">
          <Info className="h-4 w-4 text-muted-foreground" />
          <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2 w-64 p-3 bg-popover border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
            <div className="space-y-2 text-xs">
              <p className="font-semibold">How Free Tickets Work:</p>
              <ul className="space-y-1 list-disc list-inside text-muted-foreground">
                <li>Earn 1 credit per non-winning ticket</li>
                <li>Credits automatically applied at purchase</li>
                <li>Reduces your ticket cost</li>
                <li>Never expires</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 p-2 bg-green-500/10 border border-green-500/20 rounded text-xs text-center text-green-400/80">
        Applied automatically when you buy tickets
      </div>
    </Card>
  )
}
