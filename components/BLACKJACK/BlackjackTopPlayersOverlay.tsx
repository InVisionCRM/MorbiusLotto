'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { formatEther } from 'viem'
import { useBlackjackTopPlayers, type TopPlayerEntry } from '@/hooks/use-blackjack-stats'

const TOP_N = 25

function formatVal(wei: bigint): string {
  return Math.floor(Number(formatEther(wei))).toLocaleString()
}

function shortAddress(addr: string): string {
  if (!addr || addr.length < 8) return addr
  return addr.slice(-4)
}

function rankStyle(rank: number): string {
  if (rank === 1) return 'border-amber-400/80 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
  if (rank === 2) return 'border-slate-300/80 shadow-[0_0_10px_rgba(203,213,225,0.3)]'
  if (rank === 3) return 'border-amber-700/80 shadow-[0_0_10px_rgba(180,83,9,0.35)]'
  return 'border-white/20'
}

export function BlackjackTopPlayersOverlay() {
  const { data: players, isLoading } = useBlackjackTopPlayers(TOP_N)
  const scrollerRef = useRef<HTMLUListElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [start, setStart] = useState(false)

  useEffect(() => {
    if (!containerRef.current || !scrollerRef.current || !players?.length) return
    const list = scrollerRef.current
    const children = Array.from(list.children)
    children.forEach((el) => list.appendChild(el.cloneNode(true)))
    containerRef.current.style.setProperty('--animation-duration', '35s')
    containerRef.current.style.setProperty('--animation-direction', 'forwards')
    setStart(true)
  }, [players?.length])

  if (isLoading || !players?.length) return null

  return (
    <div
      ref={containerRef}
      className="scroller absolute top-0 left-0 right-0 z-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,white_15%,white_85%,transparent)]"
    >
      <ul
        ref={scrollerRef}
        className={`grid w-max min-w-full shrink-0 grid-flow-col grid-rows-2 gap-1 py-1.5 md:py-2 ${start ? 'animate-scroll' : ''} hover:[animation-play-state:paused]`}
        style={{ gridAutoColumns: 'minmax(140px, 1fr)' }}
      >
        {players.map((entry: TopPlayerEntry) => {
          const profit = entry.profit_loss >= BigInt(0)
          return (
            <li key={entry.wallet_address} className="min-w-[140px] w-[140px] md:min-w-[160px] md:w-[160px]">
              <Link
                href={`/player/${entry.wallet_address}`}
                className={`block rounded-lg border-2 bg-gradient-to-b from-slate-800/95 to-slate-900/95 px-2 py-1.5 text-white shadow-[0_4px_14px_rgba(0,0,0,0.45),0_2px_6px_rgba(0,0,0,0.3)] transition-opacity hover:opacity-95 ${rankStyle(entry.rank)}`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[10px] font-bold tabular-nums text-white/90">#{entry.rank}</span>
                  <span className="text-[10px] font-mono truncate text-white" title={entry.wallet_address}>
                    {shortAddress(entry.wallet_address)}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] tabular-nums text-white/80">
                  {entry.total_games} games · {entry.win_rate.toFixed(0)}%
                </div>
                <div className={`text-[10px] font-semibold tabular-nums ${profit ? 'text-emerald-400' : 'text-red-400'}`}>
                  {profit ? '+' : ''}{formatVal(entry.profit_loss)} M
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
