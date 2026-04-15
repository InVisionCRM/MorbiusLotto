'use client'

import { formatEther } from 'viem'
import type { RouletteSpinResult } from '@/hooks/useRoulettePlayFlow'
import { BetType } from '@/hooks/useRoulettePlayFlow'
import { getPocketColor } from './roulette-constants'
import { cn } from '@/lib/utils'

const BET_TYPE_LABELS: Record<BetType, string> = {
  [BetType.STRAIGHT]:  'Straight',
  [BetType.SPLIT]:     'Split',
  [BetType.STREET]:    'Street',
  [BetType.CORNER]:    'Corner',
  [BetType.LINE]:      'Line',
  [BetType.COLUMN]:    'Column',
  [BetType.DOZEN]:     'Dozen',
  [BetType.RED_BLACK]: 'Red/Black',
  [BetType.EVEN_ODD]:  'Even/Odd',
  [BetType.LOW_HIGH]:  'Low/High',
}

// Multiplier = profit on top of wager returned (e.g. 35 means win 35× wager)
const BET_TYPE_MULTIPLIER: Record<BetType, number> = {
  [BetType.STRAIGHT]:  35,
  [BetType.SPLIT]:     17,
  [BetType.STREET]:    11,
  [BetType.CORNER]:    8,
  [BetType.LINE]:      5,
  [BetType.COLUMN]:    2,
  [BetType.DOZEN]:     2,
  [BetType.RED_BLACK]: 1,
  [BetType.EVEN_ODD]:  1,
  [BetType.LOW_HIGH]:  1,
}

interface RouletteResultOverlayProps {
  result: RouletteSpinResult
  onDismiss: () => void
}

export function RouletteResultOverlay({ result, onDismiss }: RouletteResultOverlayProps) {
  const color = getPocketColor(result.result)
  const won = result.netPayout > 0n
  const profitLoss = result.netPayout - result.totalWagered

  const colorClass =
    color === 'green'
      ? 'text-green-400 border-green-500/40'
      : color === 'red'
      ? 'text-red-400 border-red-500/40'
      : 'text-gray-200 border-gray-500/40'

  const bgStyle =
    color === 'green'
      ? 'from-green-950/90 to-black/90'
      : color === 'red'
      ? 'from-red-950/90 to-black/90'
      : 'from-gray-900/90 to-black/90'

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl backdrop-blur-sm">
      <div
        className={cn(
          'relative rounded-2xl border p-4 w-full max-w-sm mx-4 flex flex-col gap-3 shadow-2xl',
          `bg-gradient-to-br ${bgStyle}`,
          colorClass
        )}
        style={{ boxShadow: `0 0 40px rgba(0,0,0,0.8)` }}
      >
        {/* Result + P&L in one row */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'w-14 h-14 shrink-0 rounded-full flex items-center justify-center text-3xl font-black border-4',
              colorClass,
              color === 'green' ? 'bg-green-800/60' : color === 'red' ? 'bg-red-800/60' : 'bg-gray-800/60'
            )}
          >
            {result.result}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-gray-400 capitalize">
              {color}
              {result.result !== 0 && ` · ${result.result % 2 === 0 ? 'Even' : 'Odd'} · ${result.result <= 18 ? 'Low' : 'High'}`}
            </div>
            <div className={cn('font-black text-xl tabular-nums', profitLoss >= 0n ? 'text-green-400' : 'text-red-400')}>
              {profitLoss >= 0n ? '+' : ''}
              {Number(formatEther(profitLoss)).toLocaleString(undefined, { maximumFractionDigits: 0 })} M
            </div>
            <div className="text-xs text-gray-500">
              Wagered: {Number(formatEther(result.totalWagered)).toLocaleString(undefined, { maximumFractionDigits: 0 })} M
            </div>
          </div>
        </div>

        {/* Bet breakdown */}
        <div className="flex flex-col gap-1">
          {result.bets.map((bet, i) => {
            const isWin = (() => {
              const r = result.result
              switch (bet.betType) {
                case BetType.STRAIGHT:  return bet.numbers[0] === r
                case BetType.SPLIT:
                case BetType.STREET:
                case BetType.CORNER:
                case BetType.LINE:      return bet.numbers.includes(r)
                case BetType.COLUMN:    return r !== 0 && (r % 3) === ((bet.param + 1) % 3)
                case BetType.DOZEN:     return r !== 0 && Math.floor((r - 1) / 12) === bet.param
                case BetType.RED_BLACK: {
                  const reds = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])
                  return r !== 0 && (reds.has(r) === (bet.param === 0))
                }
                case BetType.EVEN_ODD:  return r !== 0 && ((r % 2 === 0) === (bet.param === 0))
                case BetType.LOW_HIGH:  return r !== 0 && ((r <= 18) === (bet.param === 0))
                default: return false
              }
            })()

            const winnings = isWin ? bet.wager * BigInt(BET_TYPE_MULTIPLIER[bet.betType]) : 0n

            return (
              <div key={i} className={cn(
                'flex items-center justify-between rounded-lg px-2.5 py-1 text-xs',
                isWin ? 'bg-cyan-400/10 border border-cyan-500/30' : 'bg-white/5'
              )}>
                <span className="text-gray-300 font-medium">{BET_TYPE_LABELS[bet.betType]}</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">
                    {Number(formatEther(bet.wager)).toLocaleString(undefined, { maximumFractionDigits: 0 })} M
                  </span>
                  {isWin ? (
                    <span className="text-green-400 font-bold">
                      +{Number(formatEther(winnings)).toLocaleString(undefined, { maximumFractionDigits: 0 })} M
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <button
          onClick={onDismiss}
          className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-white font-bold text-sm border border-white/10"
        >
          Spin Again
        </button>
      </div>
    </div>
  )
}
