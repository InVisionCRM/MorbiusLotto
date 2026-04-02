"use client"

import React, { type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type TransactionButtonVariant = 'play' | 'approve'

interface GameTransactionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode
  isLoading?: boolean
  variant?: TransactionButtonVariant
}

const VARIANT_CLASSES: Record<TransactionButtonVariant, string> = {
  play: 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500',
  approve: 'bg-cyan-600 hover:bg-cyan-500',
}

const VARIANT_SPINNER_SIZE: Record<TransactionButtonVariant, string> = {
  play: 'w-5 h-5',
  approve: 'w-4 h-4',
}

export function GameTransactionButton({
  children,
  isLoading = false,
  variant = 'play',
  className,
  type = 'button',
  ...props
}: GameTransactionButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'w-full px-6 py-2.5 rounded-xl text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2',
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    >
      {isLoading ? <Loader2 className={cn(VARIANT_SPINNER_SIZE[variant], 'animate-spin shrink-0')} /> : null}
      {children}
    </button>
  )
}
