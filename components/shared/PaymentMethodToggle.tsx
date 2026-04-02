"use client"

import React from 'react'
import { cn } from '@/lib/utils'

export type PaymentMethod = 'MORBIUS' | 'PLS'

interface PaymentMethodToggleProps {
  value: PaymentMethod
  onChange: (next: PaymentMethod) => void
  className?: string
  textClassName?: string
}

export function PaymentMethodToggle({
  value,
  onChange,
  className,
  textClassName = 'mitr-bold text-2xl sm:text-3xl',
}: PaymentMethodToggleProps) {
  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      <button
        type="button"
        onClick={() => onChange('MORBIUS')}
        className={cn(
          textClassName,
          'transition-all duration-300 cursor-pointer',
          value === 'MORBIUS'
            ? 'bg-gradient-to-r from-cyan-400 to-cyan-600 bg-clip-text text-transparent'
            : 'text-white/50 hover:text-white/70'
        )}
      >
        MORBIUS
      </button>
      <span className="text-white/40 text-2xl sm:text-3xl font-bold select-none">/</span>
      <button
        type="button"
        onClick={() => onChange('PLS')}
        className={cn(
          textClassName,
          'transition-all duration-300 cursor-pointer',
          value === 'PLS'
            ? 'bg-gradient-to-r from-purple-400 to-purple-600 bg-clip-text text-transparent'
            : 'text-white/50 hover:text-white/70'
        )}
      >
        PLS
      </button>
    </div>
  )
}
