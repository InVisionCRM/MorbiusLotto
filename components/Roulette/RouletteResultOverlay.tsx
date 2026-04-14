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
          'relative rounded-2xl border p-6 w-full max-w-sm mx-4 flex flex-col gap-4 shadow-2xl',
          `bg-gradient-to-br ${bgStyle}`,
          colorClass
        )}
        style={{ boxShadow: `0 0 40px rgba(0,0,0,0.8)` }}
      >
        {/* Result pocket */}
        <div className="flex flex-col items-center gap-1">
          <div className="text-sm text-gray-400 font-medium uppercase tracking-widest">Result</div>
          <div
            className={cn(
              'w-20 h-20 rounded-full flex items-center justify-center text-4xl font-black border-4',
              colorClass,
              color === 'green'
                ? 'bg-green-800/60'
                : color === 'red'
                ? 'bg-red-800/60'
                : 'bg-gray-800/60'
            )}
          >
            {result.result}
          </div>
          <div className="text-xs text-gray-400 capitalize">{color}</div>
          <div className="text-xs text-gray-400">
            {result.result === 0
              ? '—'
              : result.result % 2 === 0
              ? 'Even'
              : 'Odd'}{' '}
            {result.result !== 0 && `· ${result.result <= 18 ? 'Low' : 'High'}`}
          </div>
        </div>

        {/* Bet breakdown */}
        <div className="flex flex-col gap-1.5">
          {result.bets.map((bet, i) => {
            const isWin = (() => {
              // Re-evaluate which bets won based on result
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

            return (
              <div key={i} className={cn(
                'flex items-center justify-between rounded-lg px-3 py-1.5 text-sm',
                isWin ? 'bg-cyan-400/10 border border-cyan-500/30' : 'bg-white/5'
              )}>
                <span className="text-gray-300 font-medium">{BET_TYPE_LABELS[bet.betType]}</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs">
                    {Number(formatEther(bet.wager)).toLocaleString(undefined, { maximumFractionDigits: 0 })} M
                  </span>
                  {isWin ? (
                    <span className="text-cyan-400 font-bold text-xs">WIN</span>
                  ) : (
                    <span className="text-gray-600 text-xs">—</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* P&L */}
        <div className="flex items-center justify-between rounded-xl px-4 py-3 bg-black/40 border border-white/10">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500">Total Wagered</span>
            <span className="text-white font-bold">
              {Number(formatEther(result.totalWagered)).toLocaleString(undefined, { maximumFractionDigits: 0 })} MORBIUS
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-xs text-gray-500">{won ? 'Payout' : 'Result'}</span>
            <span className={cn('font-black text-lg', profitLoss >= 0n ? 'text-green-400' : 'text-red-400')}>
              {profitLoss >= 0n ? '+' : ''}
              {Number(formatEther(profitLoss)).toLocaleString(undefined, { maximumFractionDigits: 0 })} M
            </span>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-white font-bold text-sm border border-white/10"
        >
          Spin Again
        </button>
      </div>
    </div>
  )
}
