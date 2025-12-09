'use client'

import { useEffect, useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Copy, Check } from 'lucide-react'
import Link from 'next/link'
import { NavigationMenu } from './navigation-menu'

const shortAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`

interface HeaderProps {
  nextDrawEndTime?: bigint
  fallbackRemaining?: bigint
  navigationMenuProps?: {
    address?: `0x${string}`
    displayRoundId: number
    isLoadingTicketsFinal: boolean
    winningNumbers: readonly (number | bigint)[]
    roundState: number
    winningTickets: Array<{
      ticketId: bigint
      matches: number
      payout: bigint
      numbers: readonly (number | bigint)[]
    }>
    totalWinningPssh: bigint
    formatPssh: (amount: bigint) => string
    brackets: Array<{
      bracketId: number
      poolAmount: bigint
      winnerCount: number
      matchCount: number
    }>
    isLoadingBrackets: boolean
    isMegaMillions: boolean
    currentRoundId: number
  }
}

const formatSeconds = (totalSeconds: number) => {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function Header({ navigationMenuProps, nextDrawEndTime, fallbackRemaining = BigInt(0) }: HeaderProps) {
  const [remaining, setRemaining] = useState<number>(() => {
    if (!nextDrawEndTime || nextDrawEndTime === BigInt(0)) return Number(fallbackRemaining)
    const fromEnd = Number(nextDrawEndTime) * 1000 - Date.now()
    if (!Number.isNaN(fromEnd) && fromEnd > 0) return Math.floor(fromEnd / 1000)
    return Number(fallbackRemaining)
  })

  useEffect(() => {
    if (!nextDrawEndTime || nextDrawEndTime === BigInt(0)) {
      setRemaining(Number(fallbackRemaining))
      return
    }
    const update = () => {
      const ms = Number(nextDrawEndTime) * 1000 - Date.now()
      if (!Number.isNaN(ms)) {
        setRemaining(Math.max(0, Math.floor(ms / 1000)))
      }
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [nextDrawEndTime, fallbackRemaining])

  return (
    <header className="border-b border-slate-800/50 bg-black/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-3 py-3 relative">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="text-left">
              <h1 className="text-xl font-bold text-white leading-none">YoLotto</h1>
            </div>
          </Link>

          <div className="flex items-center gap-2 ml-auto">
            {navigationMenuProps && <NavigationMenu {...navigationMenuProps} />}
            <ConnectButton showBalance={false} />
          </div>
        </div>

        {/* Centered Next Draw Timer (no label) */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-pink-400 bg-clip-text text-transparent drop-shadow">
            {remaining > 0 ? formatSeconds(remaining) : '--'}
          </div>
        </div>
      </div>
    </header>
  )
}
