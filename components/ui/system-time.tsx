'use client'

import React, { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface SystemTimeProps {
  className?: string
  /** If true, show date + time; otherwise time only */
  showDate?: boolean
}

/** Displays the user's system time based on their local clock. */
export function SystemTime({ className, showDate = false }: SystemTimeProps) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const text = showDate
    ? now.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })
    : now.toLocaleTimeString(undefined, { hour12: true, hour: 'numeric', minute: '2-digit', second: '2-digit' })

  return (
    <div
      className={cn(
        'absolute top-4 right-4 rounded px-2 py-1 text-sm text-white bg-slate-900/40',
        className
      )}
      aria-live="polite"
      aria-label={`System time: ${text}`}
    >
      {text}
    </div>
  )
}
