'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatUnits } from 'viem'
import { TOKEN_DECIMALS } from '@/lib/contracts'
import type { InstantLotteryResultRow } from '@/hooks/use-instant-lottery'

interface InstantLotteryResultModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: InstantLotteryResultRow | null
}

export function InstantLotteryResultModal({ open, onOpenChange, result }: InstantLotteryResultModalProps) {
  if (!result) return null

  const { playerNumbers, winningNumbers, matchCount, wager, netPayout } = result
  const win = netPayout > 0n

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-cyan-500/30 rounded-2xl shadow-2xl max-w-lg w-full"
        style={{ boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05)' }}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
            {win ? 'You won!' : 'No match'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div>
            <p className="text-white/70 mb-1">Your numbers</p>
            <div className="flex gap-2 flex-wrap">
              {playerNumbers.map((n, i) => (
                <span key={i} className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-bold text-white">
                  {n}
                </span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-white/70 mb-1">Drawn numbers</p>
            <div className="flex gap-2 flex-wrap">
              {winningNumbers.map((n, i) => (
                <span key={i} className="w-9 h-9 rounded-full bg-cyan-500/30 flex items-center justify-center font-bold text-cyan-200">
                  {n}
                </span>
              ))}
            </div>
          </div>
          <p className="text-white font-medium">
            Matches: <span className="text-cyan-300">{matchCount}</span>
          </p>
          <p className="text-white/80">
            Wager: {formatUnits(wager, TOKEN_DECIMALS)} MORBIUS
          </p>
          <p className={win ? 'text-green-400 font-semibold' : 'text-white/80'}>
            Payout: {formatUnits(netPayout, TOKEN_DECIMALS)} MORBIUS
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
