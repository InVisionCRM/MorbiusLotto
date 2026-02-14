'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { InfiniteMovingCards, type ImageCardItem } from '@/components/ui/infinite-moving-cards'
import { formatEther } from 'viem'
import { getApiUrlOptional } from '@/lib/api-urls'

interface TopPlayerCard {
  wallet_address: string
  display_name?: string
  profile_image_url?: string | null
  /** From API: string (wei/count) or number (e.g. win_rate 55.56) */
  value: string | number
  label: string
  /** From API: ISO string; normalize to Date when needed */
  created_at?: Date | string
  category: string
}

const categories: Array<'games' | 'profit_loss' | 'wagered' | 'win_rate' | 'total_won' | 'win_streak'> = [
  'games',
  'profit_loss',
  'wagered',
  'win_rate',
  'total_won',
  'win_streak',
]

function formatValue(category: string, value: string | number): string {
  switch (category) {
    case 'games':
      return `${Number(value)} games`
    case 'profit_loss':
    case 'wagered':
    case 'total_won': {
      // Wei amounts: API sends integer string; BigInt() rejects decimals (e.g. win_rate 55.56)
      const raw = value ?? '0'
      const str = typeof raw === 'number' ? String(Math.floor(raw)) : String(raw)
      const wei = /^\d+$/.test(str) ? BigInt(str) : BigInt(0)
      return `${Math.floor(Number(formatEther(wei))).toLocaleString()} MORBIUS`
    }
    case 'win_rate':
      return `${Number(value).toFixed(1)}%`
    case 'win_streak':
      return `${value} wins`
    default:
      return String(value)
  }
}

function formatAddress(address: string): string {
  if (!address || address.length < 8) return address
  return address.slice(-4)
}

function formatPlayingDuration(createdAt?: Date | string): string {
  if (createdAt == null) return 'Unknown'
  const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt
  if (Number.isNaN(date.getTime())) return 'Unknown'
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays < 1) return 'Today'
  if (diffDays === 1) return '1 day'
  if (diffDays < 7) return `${diffDays} days`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months`
  return `${Math.floor(diffDays / 365)} years`
}

export function BlackjackTopPlayersCarousel() {
  const [playerCards, setPlayerCards] = useState<TopPlayerCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchTopPlayers() {
      setLoading(true)
      const apiUrl = getApiUrlOptional()
      if (!apiUrl) {
        setLoading(false)
        return
      }

      try {
        const results = await Promise.all(
          categories.map(async (category) => {
            try {
              const response = await fetch(`${apiUrl}/api/analytics/top-player-by-category?category=${category}`)
              if (!response.ok) return null
              const data = await response.json()
              return Array.isArray(data) && data.length > 0 ? { ...data[0], category } : null
            } catch (error) {
              console.error(`Error fetching ${category}:`, error)
              return null
            }
          })
        )

        const validResults = results.filter((r): r is TopPlayerCard => r !== null)
        setPlayerCards(validResults)
      } catch (error) {
        console.error('Error fetching top players:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchTopPlayers()
    // Refresh every 5 minutes
    const interval = setInterval(fetchTopPlayers, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      </div>
    )
  }

  if (playerCards.length === 0) {
    return null
  }

  const cardItems: ImageCardItem[] = playerCards.map((result) => {
    const displayName = result.display_name || `...${formatAddress(result.wallet_address)}`
    const value = formatValue(result.category, result.value)
    const duration = formatPlayingDuration(result.created_at)
    const label = result.label.replace(/_/g, ' ')
    return {
      name: `${label} · ${displayName}`,
      subtitle: `${value} · ${duration}`,
      href: `/player/${result.wallet_address}`,
    }
  })

  return (
    <div className="w-full py-1.5 md:py-2 bg-gradient-to-b from-slate-950/95 to-slate-900/95">
      <InfiniteMovingCards
        items={cardItems}
        variant="image"
        direction="left"
        speed="normal"
        pauseOnHover={true}
        className="max-w-5xl mx-auto [&_span]:text-inherit [&_a]:cursor-pointer [&_ul]:py-1 [&_ul]:md:py-1.5 [&_li]:h-[72px] [&_li]:sm:h-[78px] [&_li]:md:h-[88px] [&_li]:lg:h-[96px]"
      />
    </div>
  )
}
