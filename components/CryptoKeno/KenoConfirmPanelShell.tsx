'use client'

import { ReactNode } from 'react'

interface KenoConfirmPanelShellProps {
  children: ReactNode
}

export function KenoConfirmPanelShell({ children }: KenoConfirmPanelShellProps) {
  return (
    <div
      className="rounded-lg p-4 flex flex-col min-w-0 w-full overflow-x-hidden relative"
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
        boxShadow:
          'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
        border: '1px inset rgba(60, 60, 60, 0.5)',
      }}
    >
      {children}
    </div>
  )
}
