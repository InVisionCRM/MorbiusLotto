'use client'

import { usePathname } from 'next/navigation'
import { ElevenLabsWidget } from '@/components/shared/ElevenLabsWidget'

/** Full-screen game routes where the floating ConvAI widget overlaps gameplay. */
const HIDDEN_PREFIXES = [
  '/BLACKJACK',
  '/blackjack-multi',
  '/PLINKO',
  '/keno',
  '/lottery',
  '/poker',
  '/roulette',
] as const

function hideWidgetOnPath(pathname: string | null): boolean {
  if (!pathname) return false
  return HIDDEN_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

export function ElevenLabsWidgetGate() {
  const pathname = usePathname()
  if (hideWidgetOnPath(pathname)) return null
  return <ElevenLabsWidget />
}
