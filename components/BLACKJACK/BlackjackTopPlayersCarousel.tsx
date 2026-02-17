'use client'

import React, { useEffect, useState } from 'react'
import { formatEther } from 'viem'
import { getApiUrlOptional } from '@/lib/api-urls'
import { CarouselLayouts, type CarouselItem } from './BlackjackTopPlayersLayouts'

interface TopPlayerCard {
  wallet_address: string
  display_name?: string
  profile_image_url?: string | null
  value: string | number
  label: string
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

const CATEGORY_LABELS: Record<string, string> = {
  games: 'Most Games Played',
  profit_loss: 'Best Profit',
  wagered: 'Highest Wagered',
  win_rate: 'Best Win Rate',
  total_won: 'Most Won',
  win_streak: 'Longest Win Streak',
}

function formatDisplayValue(category: string, value: string | number): string {
  switch (category) {
    case 'games':
      return `${Number(value).toLocaleString()} games`
    case 'profit_loss':
    case 'wagered':
    case 'total_won': {
      const raw = value ?? '0'
      const str = typeof raw === 'number' ? String(Math.floor(raw)) : String(raw)
      const wei = /^-?\d+$/.test(str) ? BigInt(str) : BigInt(0)
      const num = Math.floor(Number(formatEther(wei)))
      const prefix = category === 'profit_loss' && num > 0 ? '+' : ''
      return `${prefix}${num.toLocaleString()} MORB`
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
  return `...${address.slice(-4)}`
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

  const carouselItems: CarouselItem[] = playerCards.map((result) => ({
    categoryLabel: CATEGORY_LABELS[result.category] ?? result.label.replace(/_/g, ' '),
    playerShort: formatAddress(result.wallet_address),
    displayValue: formatDisplayValue(result.category, result.value),
    href: `/player/${result.wallet_address}`,
  }))

  return (
    <div className="w-full py-1.5 md:py-2 bg-gradient-to-b from-slate-950/95 to-slate-900/95">
      <CarouselLayouts.E items={carouselItems} />
    </div>
  )
}
