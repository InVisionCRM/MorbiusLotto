'use client'

import { ReactNode } from 'react'
import { Card } from '@/components/ui/card'

interface KenoPlayPanelShellProps {
  ticketBuilder: ReactNode
  confirmPanel: ReactNode
  overlay?: ReactNode
}

export function KenoPlayPanelShell({ ticketBuilder, confirmPanel, overlay }: KenoPlayPanelShellProps) {
  return (
    <Card
      className="relative overflow-hidden p-0 w-full max-w-full rounded-xl border-0 bg-transparent text-white shadow-none ring-0"
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
        boxShadow:
          'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
        border: '1px solid rgba(0, 0, 0, 0.1)',
      }}
    >
      <div className="relative flex flex-col gap-4 p-4 min-h-0 overflow-x-hidden w-full">
        {ticketBuilder}
        {confirmPanel}
      </div>
      {overlay}
    </Card>
  )
}
