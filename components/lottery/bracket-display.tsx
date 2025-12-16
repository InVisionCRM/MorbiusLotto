'use client'

import { Card } from '@/components/ui/card'
import { formatUnits } from 'viem'
import { Trophy, Users, Coins } from 'lucide-react'

interface BracketInfo {
  bracketId: number
  poolAmount: bigint
  winnerCount: number
  matchCount: number
}

interface BracketDisplayProps {
  brackets: BracketInfo[]
  isLoading?: boolean
  isMegaMillions?: boolean
}

const BRACKET_ODDS = [
  { matches: 6, odds: '1 in 28,989,675', color: 'from-yellow-500 to-amber-600' },
  { matches: 5, odds: '1 in 145,716', color: 'from-purple-500 to-violet-600' },
  { matches: 4, odds: '1 in 3,387', color: 'from-blue-500 to-cyan-600' },
  { matches: 3, odds: '1 in 220', color: 'from-green-500 to-emerald-600' },
  { matches: 2, odds: '1 in 22', color: 'from-orange-500 to-red-600' },
  { matches: 1, odds: '1 in 5', color: 'from-gray-500 to-slate-600' },
]

export function BracketDisplay({ brackets, isLoading = false, isMegaMillions = false }: BracketDisplayProps) {
  const formatPssh = (amount: bigint) => {
    return parseFloat(formatUnits(amount, 9)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
  }

  const getPayoutPerWinner = (bracket: BracketInfo) => {
    if (bracket.winnerCount === 0) return '0'
    return formatPssh(bracket.poolAmount / BigInt(bracket.winnerCount))
  }

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-muted/50 animate-pulse rounded-lg" />
          ))}
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-6 bg-black/40">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="h-6 w-6 text-primary" />
          Prize Brackets
        </h2>
        {isMegaMillions && (
          <div className="px-4 py-2 bg-gradient-to-r from-yellow-500/20 to-amber-600/20 border border-yellow-500/30 rounded-lg">
            <p className="text-sm font-bold text-yellow-500 animate-pulse">
              🎰 MEGA-MORBIUS JACKPOT ROUND
            </p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {BRACKET_ODDS.map((bracket, index) => {
          const bracketData = brackets.find(b => b.matchCount === bracket.matches) || {
            bracketId: 0,
            poolAmount: BigInt(0),
            winnerCount: 0,
            matchCount: bracket.matches,
          }

          const poolAmount = formatPssh(bracketData.poolAmount)
          const payoutPerWinner = getPayoutPerWinner(bracketData)
          const hasWinners = bracketData.winnerCount > 0

          return (
            <div
              key={bracket.matches}
              className={`
                relative overflow-hidden rounded-lg border
                ${hasWinners ? 'border-primary/50 bg-black/40' : 'border-border bg-black/40'}
                transition-all duration-200 hover:scale-[1.02]
              `}
            >

              <div className="relative p-4">
                <div className="flex items-center justify-between">
                  {/* Left: Match info */}
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-xl flex flex-col items-center justify-center border border-white/20 text-white font-bold">
                      <div className="text-2xl">{bracket.matches}</div>
                      <div className="text-[10px] uppercase tracking-wider opacity-90">
                        Match{bracket.matches !== 1 ? 'es' : ''}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-lg">
                          Bracket {7 - index}
                        </h3>
                        {hasWinners && (
                          <span className="px-2 py-0.5 bg-green-500/20 text-green-500 text-xs font-semibold rounded-full">
                            {bracketData.winnerCount} Winner{bracketData.winnerCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Odds: {bracket.odds}
                      </p>
                    </div>
                  </div>

                  {/* Right: Prize info */}
                  <div className="text-right space-y-2">
                    <div>
                      <div className="flex items-center justify-end gap-1.5 text-muted-foreground text-xs mb-1">
                        <Coins className="h-3 w-3" />
                        <span>Prize Pool</span>
                      </div>
                      <div className="font-bold text-lg">
                        {poolAmount} <span className="text-xs text-muted-foreground">Morbius</span>
                      </div>
                    </div>

                    {hasWinners && (
                      <div className="pt-2 border-t border-border/50">
                        <div className="text-xs text-muted-foreground mb-1">Per Winner</div>
                        <div className="font-semibold text-primary">
                          {payoutPerWinner} <span className="text-xs">Morbius</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Special callout for bracket 6 (6 matches) */}
                {bracket.matches === 6 && bracketData.poolAmount > BigInt(0) && !hasWinners && (
                  <div className="mt-3 pt-3 border-t border-yellow-500/30">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="flex-1 h-1 bg-gradient-to-r from-yellow-500/50 to-transparent rounded-full" />
                      <span className="text-yellow-500 font-semibold animate-pulse">
                        JACKPOT WAITING TO BE WON!
                      </span>
                      <div className="flex-1 h-1 bg-gradient-to-l from-yellow-500/50 to-transparent rounded-full" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Info footer */}
      <div className="mt-6 pt-4 border-t border-border/50">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <Trophy className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold mb-1">Prize Distribution</p>
              <p>60% of ticket sales distributed across winning brackets</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Users className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold mb-1">Winner Payouts</p>
              <p>Each bracket's pool split equally among winners</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Coins className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold mb-1">Unclaimed Brackets</p>
              <p>Empty bracket pools roll to MegaMorbius Jackpot</p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
