'use client'

import React, { useState } from 'react'
import Image from 'next/image'
import { History, ChevronDown, Clock } from 'lucide-react'
import { formatEther } from 'viem'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { GameHistoryEntry } from './GameHistory'

const VALUE_TO_RANK: Record<number, string> = {
  1: 'A', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6',
  7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K'
}
const SUITS = ['S', 'H', 'D', 'C']

const getCardImagePath = (value: number, index: number, salt: number = 0): string => {
  const rank = VALUE_TO_RANK[value] || '2'
  const suit = SUITS[(index + salt) % 4]
  return `/BlackJack/Cards/PNG/${rank}${suit}.png`
}

const CardImage = ({ value, index, salt = 0 }: { value: number; index: number; salt?: number }) => {
  // Normalize: 0 can be Ace from deck index; 1-13 are ranks
  const rank = (value >= 0 && value <= 51) ? (value % 13) + 1 : (value === 0 ? 1 : value);
  if (rank < 1 || rank > 13) return null
  return (
    <div className="relative flex-shrink-0 rounded-md overflow-hidden shadow-lg"
      style={{ width: 36, height: 50, marginLeft: index > 0 ? -10 : 0 }}>
      <Image src={getCardImagePath(rank, index, salt)} alt="" width={36} height={50} className="object-contain" unoptimized />
    </div>
  )
}

export const MOCK_HISTORY_ENTRIES: GameHistoryEntry[] = [
  { id: '1', gameId: 'g1', timestamp: Date.now() - 3600000, betAmount: BigInt(1000e18), payout: BigInt(2000e18), result: 'win', playerHands: [{ cards: [8, 7], total: 15, result: 'win', payout: BigInt(2000e18) }], dealerCards: [13], dealerTotal: 10, verified: false },
  { id: '2', gameId: 'g2', timestamp: Date.now() - 7200000, betAmount: BigInt(500e18), payout: BigInt(0), result: 'loss', playerHands: [{ cards: [10, 9], total: 19, result: 'loss', payout: BigInt(0) }], dealerCards: [4, 5, 13], dealerTotal: 19, verified: false },
  { id: '3', gameId: 'g3', timestamp: Date.now() - 86400000, betAmount: BigInt(1000e18), payout: BigInt(2500e18), result: 'blackjack', playerHands: [{ cards: [1, 13], total: 21, result: 'blackjack', payout: BigInt(2500e18) }], dealerCards: [1, 13], dealerTotal: 11, verified: false },
  { id: '4', gameId: 'g4', timestamp: Date.now() - 172800000, betAmount: BigInt(1000e18), payout: BigInt(2000e18), result: 'win', playerHands: [{ cards: [8, 12], total: 18, result: 'win', payout: BigInt(2000e18) }], dealerCards: [8, 12], dealerTotal: 18, verified: false },
  { id: '5', gameId: 'g5', timestamp: Date.now() - 259200000, betAmount: BigInt(500e18), payout: BigInt(0), result: 'loss', playerHands: [{ cards: [6, 8, 7], total: 21, result: 'loss', payout: BigInt(0) }], dealerCards: [6, 8, 7], dealerTotal: 21, verified: false },
]

const getResultColor = (result: string) => {
  switch (result) {
    case 'win': return 'text-green-400 bg-green-900/20'
    case 'loss': return 'text-red-400 bg-red-900/20'
    case 'push': return 'text-yellow-400 bg-yellow-900/20'
    case 'blackjack': return 'text-purple-400 bg-purple-900/20'
    default: return 'text-gray-400 bg-gray-900/20'
  }
}

const getProfit = (entry: GameHistoryEntry) =>
  Math.floor(Number(formatEther(entry.payout))) - Math.floor(Number(formatEther(entry.betAmount)))

const formatAmount = (amount: bigint) => Math.floor(Number(formatEther(amount))).toLocaleString()

const formatTimestamp = (timestamp: number) => {
  const diffMs = Date.now() - timestamp
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  if (diffHours < 1) return `${Math.floor(diffMs / (1000 * 60))}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

interface LayoutProps {
  history: GameHistoryEntry[]
  sortBy: 'newest' | 'oldest' | 'profit'
  onSortChange: (v: 'newest' | 'oldest' | 'profit') => void
}

const sortHistory = (history: GameHistoryEntry[], sortBy: 'newest' | 'oldest' | 'profit') => {
  const arr = [...history]
  if (sortBy === 'newest') return arr.sort((a, b) => b.timestamp - a.timestamp)
  if (sortBy === 'oldest') return arr.sort((a, b) => a.timestamp - b.timestamp)
  return arr.sort((a, b) => {
    const ap = getProfit(a)
    const bp = getProfit(b)
    return bp - ap
  })
}

// Layout A: Stacked rows (mobile-first, full-width)
export function GameHistoryLayoutA({ history, sortBy, onSortChange }: LayoutProps) {
  const sorted = sortHistory(history, sortBy)
  return (
    <Card className="w-full bg-gradient-to-br from-gray-900 to-black border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-white flex items-center gap-2">
          <History className="w-5 h-5" />
          Game History ({history.length})
        </CardTitle>
        <select value={sortBy} onChange={(e) => onSortChange(e.target.value as any)} className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white">
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="profit">By Profit</option>
        </select>
      </CardHeader>
      <CardContent className="space-y-0 p-0">
        {sorted.map((entry, i) => {
          const playerTotal = entry.playerHands?.[0]?.total ?? 0
          return (
            <div key={entry.id} className="border-b border-gray-700/60 last:border-b-0 p-4 hover:bg-gray-800/30 transition-colors">
              <div className="flex flex-col gap-3 w-full">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`${getResultColor(entry.result)} border-0`}>{entry.result.toUpperCase()}</Badge>
                    <span className="text-sm text-gray-400 flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{formatTimestamp(entry.timestamp)}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-gray-300">{formatAmount(entry.betAmount)} MORBIUS</span>
                    <span className={`text-sm font-semibold ${getProfit(entry) > 0 ? 'text-green-400' : getProfit(entry) < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                      {getProfit(entry) > 0 ? '+' : ''}{getProfit(entry).toLocaleString()} MORBIUS
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-gray-500 uppercase shrink-0">You</span>
                    <div className="flex items-center gap-1">
                      {entry.playerHands?.[0]?.cards?.slice(0, 3).map((v, j) => <CardImage key={j} value={v} index={j} salt={i} />)}
                      {(!entry.playerHands?.[0]?.cards?.length) && <span className="text-xs text-gray-500">No cards</span>}
                    </div>
                    <span className="text-sm font-bold text-white ml-1">{playerTotal}</span>
                  </div>
                  <span className="text-gray-500 text-sm">vs</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-gray-500 uppercase shrink-0">Dealer</span>
                    <div className="flex items-center gap-1">
                      {entry.dealerCards?.slice(0, 3).map((v, j) => <CardImage key={j} value={v} index={j} salt={i + 100} />)}
                      {(!entry.dealerCards?.length) && <span className="text-xs text-gray-500">No cards</span>}
                    </div>
                    <span className="text-sm font-bold text-white ml-1">{entry.dealerTotal ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// Layout B: Two-column cards (You | Dealer side by side)
export function GameHistoryLayoutB({ history, sortBy, onSortChange }: LayoutProps) {
  const sorted = sortHistory(history, sortBy)
  return (
    <Card className="w-full bg-gradient-to-br from-gray-900 to-black border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-white flex items-center gap-2">
          <History className="w-5 h-5" />
          Game History ({history.length})
        </CardTitle>
        <select value={sortBy} onChange={(e) => onSortChange(e.target.value as any)} className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white">
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="profit">By Profit</option>
        </select>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {sorted.map((entry, i) => {
          const playerTotal = entry.playerHands?.[0]?.total ?? 0
          return (
            <div key={entry.id} className="rounded-lg border border-gray-700/60 bg-gray-800/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <Badge className={`${getResultColor(entry.result)} border-0`}>{entry.result.toUpperCase()}</Badge>
                <span className="text-xs text-gray-400">{formatTimestamp(entry.timestamp)}</span>
                <span className="text-sm text-gray-300">{formatAmount(entry.betAmount)} MORBIUS</span>
                <span className={`text-sm font-semibold ${getProfit(entry) > 0 ? 'text-green-400' : getProfit(entry) < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                  {getProfit(entry) > 0 ? '+' : ''}{getProfit(entry).toLocaleString()} MORBIUS
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-gray-900/50 p-3 border border-cyan-500/20">
                  <div className="text-xs text-cyan-400 uppercase font-medium mb-2">You</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {entry.playerHands?.[0]?.cards?.slice(0, 4).map((v, j) => <CardImage key={j} value={v} index={j} salt={i} />)}
                    {(!entry.playerHands?.[0]?.cards?.length) && <span className="text-xs text-gray-500">No cards</span>}
                  </div>
                  <div className="text-lg font-bold text-white mt-2">{playerTotal}</div>
                </div>
                <div className="rounded-lg bg-gray-900/50 p-3 border border-red-500/20">
                  <div className="text-xs text-red-400 uppercase font-medium mb-2">Dealer</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {entry.dealerCards?.slice(0, 4).map((v, j) => <CardImage key={j} value={v} index={j} salt={i + 100} />)}
                    {(!entry.dealerCards?.length) && <span className="text-xs text-gray-500">No cards</span>}
                  </div>
                  <div className="text-lg font-bold text-white mt-2">{entry.dealerTotal ?? 0}</div>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// Layout C: Compact single-row (minimal, expand for cards)
export function GameHistoryLayoutC({ history, sortBy, onSortChange }: LayoutProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const sorted = sortHistory(history, sortBy)
  return (
    <Card className="w-full bg-gradient-to-br from-gray-900 to-black border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-white flex items-center gap-2">
          <History className="w-5 h-5" />
          Game History ({history.length})
        </CardTitle>
        <select value={sortBy} onChange={(e) => onSortChange(e.target.value as any)} className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white">
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="profit">By Profit</option>
        </select>
      </CardHeader>
      <CardContent className="space-y-0 p-0">
        {sorted.map((entry, i) => {
          const playerTotal = entry.playerHands?.[0]?.total ?? 0
          const isExpanded = expanded === entry.id
          return (
            <div key={entry.id} className="border-b border-gray-700/60 last:border-b-0">
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : entry.id)}
                className="w-full flex items-center gap-2 sm:gap-4 p-4 text-left hover:bg-gray-800/30 transition-colors"
              >
                <Badge className={`${getResultColor(entry.result)} border-0 shrink-0`}>{entry.result.toUpperCase()}</Badge>
                <span className="text-xs text-gray-400 shrink-0">{formatTimestamp(entry.timestamp)}</span>
                <span className="text-sm text-gray-300">{formatAmount(entry.betAmount)}</span>
                <span className={`text-sm font-semibold shrink-0 ${getProfit(entry) > 0 ? 'text-green-400' : getProfit(entry) < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                  {getProfit(entry) > 0 ? '+' : ''}{getProfit(entry).toLocaleString()}
                </span>
                <span className="text-sm text-white/80">
                  You: <strong>{playerTotal}</strong> vs Dealer: <strong>{entry.dealerTotal ?? 0}</strong>
                </span>
                <ChevronDown className={`w-4 h-4 ml-auto shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 flex gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    {entry.playerHands?.[0]?.cards?.map((v, j) => <CardImage key={j} value={v} index={j} salt={i} />)}
                  </div>
                  <div className="flex items-center gap-2">
                    {entry.dealerCards?.map((v, j) => <CardImage key={j} value={v} index={j} salt={i + 100} />)}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// Layout D: Battle layout (You vs Dealer with clear sections)
export function GameHistoryLayoutD({ history, sortBy, onSortChange }: LayoutProps) {
  const sorted = sortHistory(history, sortBy)
  return (
    <Card className="w-full bg-gradient-to-br from-gray-900 to-black border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-white flex items-center gap-2">
          <History className="w-5 h-5" />
          Game History ({history.length})
        </CardTitle>
        <select value={sortBy} onChange={(e) => onSortChange(e.target.value as any)} className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white">
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="profit">By Profit</option>
        </select>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {sorted.map((entry, i) => {
          const playerTotal = entry.playerHands?.[0]?.total ?? 0
          return (
            <div key={entry.id} className="rounded-lg border border-gray-700/60 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gray-800/50">
                <div className="flex items-center gap-2">
                  <Badge className={`${getResultColor(entry.result)} border-0`}>{entry.result.toUpperCase()}</Badge>
                  <span className="text-xs text-gray-400">{formatTimestamp(entry.timestamp)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">WAGER</span>
                    <span className="text-sm">{formatAmount(entry.betAmount)} MORBIUS</span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">OUTCOME</span>
                    <span className={`text-sm font-bold ${getProfit(entry) > 0 ? 'text-green-400' : getProfit(entry) < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                      {getProfit(entry) > 0 ? '+' : ''}{getProfit(entry).toLocaleString()} MORBIUS
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-stretch">
                <div className="flex-1 min-w-0 p-4 flex flex-col items-center justify-center border-r border-gray-700">
                  <div className="text-xs text-cyan-400 uppercase font-medium mb-2">You</div>
                  <div className="flex items-center justify-center gap-1 mb-2">
                    {entry.playerHands?.[0]?.cards?.map((v, j) => <CardImage key={j} value={v} index={j} salt={i} />)}
                    {(!entry.playerHands?.[0]?.cards?.length) && <span className="text-xs text-gray-500">No cards</span>}
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">TOTAL</span>
                    <span className="text-2xl font-bold text-cyan-400">{playerTotal}</span>
                  </div>
                </div>
                <div className="flex items-center px-4 bg-gray-900/50">
                  <span className="text-sm font-bold text-gray-500">VS</span>
                </div>
                <div className="flex-1 min-w-0 p-4 flex flex-col items-center justify-center">
                  <div className="text-xs text-red-400 uppercase font-medium mb-2">Dealer</div>
                  <div className="flex items-center justify-center gap-1 mb-2">
                    {entry.dealerCards?.map((v, j) => <CardImage key={j} value={v} index={j} salt={i + 100} />)}
                    {(!entry.dealerCards?.length) && <span className="text-xs text-gray-500">No cards</span>}
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">TOTAL</span>
                    <span className="text-2xl font-bold text-red-400">{entry.dealerTotal ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

// Layout E: Table-like (grid with clear columns)
export function GameHistoryLayoutE({ history, sortBy, onSortChange }: LayoutProps) {
  const sorted = sortHistory(history, sortBy)
  return (
    <Card className="w-full bg-gradient-to-br from-gray-900 to-black border-gray-700 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-white flex items-center gap-2">
          <History className="w-5 h-5" />
          Game History ({history.length})
        </CardTitle>
        <select value={sortBy} onChange={(e) => onSortChange(e.target.value as any)} className="bg-gray-800 border border-gray-600 rounded px-3 py-1.5 text-sm text-white">
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="profit">By Profit</option>
        </select>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 bg-gray-800/50 border-b border-gray-700 text-xs font-medium text-gray-400 uppercase tracking-wider">
            <div>Result</div>
            <div>Time</div>
            <div>Bet</div>
            <div>P/L</div>
            <div>You</div>
            <div>Dealer</div>
          </div>
          {sorted.map((entry, i) => {
            const playerTotal = entry.playerHands?.[0]?.total ?? 0
            return (
              <div
                key={entry.id}
                className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 items-center border-b border-gray-700/60 last:border-b-0 hover:bg-gray-800/30"
              >
                <Badge className={`${getResultColor(entry.result)} border-0 w-fit`}>{entry.result.toUpperCase()}</Badge>
                <span className="text-sm text-gray-400">{formatTimestamp(entry.timestamp)}</span>
                <span className="text-sm text-gray-300">{formatAmount(entry.betAmount)} MORBIUS</span>
                <span className={`text-sm font-semibold ${getProfit(entry) > 0 ? 'text-green-400' : getProfit(entry) < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                  {getProfit(entry) > 0 ? '+' : ''}{getProfit(entry).toLocaleString()} MORBIUS
                </span>
                <span className="text-sm font-bold text-white">{playerTotal}</span>
                <span className="text-sm font-bold text-white">{entry.dealerTotal ?? 0}</span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
