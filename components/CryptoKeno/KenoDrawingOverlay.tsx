"use client"

import React from 'react'
import { formatEther } from 'viem'
import { cn } from '@/lib/utils'
import { NumberTicker } from '@/components/ui/number-ticker'

interface KenoDrawingOverlayProps {
  drawnCount: number
  lastResult: { spotSize: number; wager: bigint } | null
  kenoStats: {
    totalPlays: bigint
    totalWagered: bigint
    totalWon: bigint
    winRate: number
    profitLoss: bigint
  }
}

export function KenoDrawingOverlay({ drawnCount, lastResult, kenoStats }: KenoDrawingOverlayProps) {
  return (
    <div
      className="absolute inset-0 z-20 flex flex-col rounded-lg"
      style={{
        background: 'linear-gradient(325deg, rgba(16, 20, 24, 0.98), rgba(24, 28, 32, 0.98))',
      }}
    >
      <div className="flex-1 min-h-0 p-3 grid grid-cols-3 grid-rows-3 gap-2 border-b border-white/10">
        {[
          {
            label: 'Balls left',
            value: (
              <NumberTicker
                value={20 - drawnCount}
                animateOnChange
                direction="down"
                startValue={20}
                className="font-russo-one text-2xl md:text-3xl font-black tabular-nums text-white drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]"
              />
            ),
          },
          { label: 'Drawn', value: `${drawnCount} / 20` },
          { label: 'Spot', value: lastResult?.spotSize ?? '—' },
          { label: 'Wager', value: lastResult ? `${Number(formatEther(lastResult.wager)).toLocaleString()}` : '—' },
          { label: 'Total plays', value: kenoStats.totalPlays.toString() },
          { label: 'Wagered', value: Number(formatEther(kenoStats.totalWagered)).toLocaleString() },
          { label: 'Total won', value: Number(formatEther(kenoStats.totalWon)).toLocaleString() },
          { label: 'Win rate', value: `${kenoStats.winRate.toFixed(1)}%` },
          {
            label: 'P/L',
            value:
              (kenoStats.profitLoss >= 0n ? '+' : '') +
              Number(formatEther(kenoStats.profitLoss >= 0n ? kenoStats.profitLoss : -kenoStats.profitLoss)).toLocaleString(),
            highlight: true,
          },
        ].map((stat, i) => (
          <div
            key={i}
            className="flex flex-col items-center justify-center rounded-lg p-2 min-h-0"
            style={{
              background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
              boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(60, 60, 60, 0.5)',
            }}
          >
            <span className="text-cyan-300/80 text-[10px] font-bold uppercase tracking-wider truncate w-full text-center">
              {stat.label}
            </span>
            <span
              className={cn(
                'text-white font-bold text-sm md:text-base tabular-nums mt-0.5',
                stat.highlight && (kenoStats.profitLoss >= 0n ? 'text-emerald-400' : 'text-red-400')
              )}
            >
              {stat.value}
            </span>
          </div>
        ))}
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center p-4">
        <div
          className="w-full h-full min-h-[80px] flex items-center justify-center rounded-lg border border-dashed border-white/20 text-white/40 text-sm"
          style={{
            background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.6), rgba(40, 40, 40, 0.4))',
          }}
        >
          Advertisement
        </div>
      </div>
    </div>
  )
}
