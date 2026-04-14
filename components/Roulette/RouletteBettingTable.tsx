'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useCallback, useMemo } from 'react'
import { formatEther } from 'viem'
import { Trash2 } from 'lucide-react'
import { utils, type Bets } from 'react-casino-roulette'
import { playRouletteChipSound } from '@/lib/roulette-sounds'
import { BetType, type RouletteBet } from '@/hooks/useRoulettePlayFlow'
import { ROULETTE_CHIPS, rouletteChipSrcForDenom } from './roulette-chip-assets'
import { RouletteRecentNumbersStrip } from './RouletteRecentNumbersStrip'
import 'react-casino-roulette/dist/index.css'
import './roulette-table-overrides.css'

const CasinoRouletteTable = dynamic(
  () => import('react-casino-roulette').then((m) => m.RouletteTable),
  { ssr: false }
)

const MORBIUS_WEI = 1_000_000_000_000_000_000n

// Maps library ACTION_TYPE strings → our contract BetType + numbers (+ table sync ids)
function libraryBetToRouletteBet(
  action: string,
  payload: string[],
  chipValue: bigint,
  libraryBetId: string
): RouletteBet | null {
  const nums = payload.map(Number).filter((n) => !isNaN(n))

  switch (action) {
    case 'STRAIGHT_UP':
    case '0': {
      const row = { betType: BetType.STRAIGHT, param: 0, numbers: nums, wager: chipValue }
      return { ...row, libraryBetId, libraryPayload: [...payload] }
    }

    case 'SPLIT': {
      const row = { betType: BetType.SPLIT, param: 0, numbers: nums, wager: chipValue }
      return { ...row, libraryBetId, libraryPayload: [...payload] }
    }

    case 'STREET':
    case 'ROW': {
      const row = { betType: BetType.STREET, param: 0, numbers: nums, wager: chipValue }
      return { ...row, libraryBetId, libraryPayload: [...payload] }
    }

    case 'CORNER': {
      const row = { betType: BetType.CORNER, param: 0, numbers: nums, wager: chipValue }
      return { ...row, libraryBetId, libraryPayload: [...payload] }
    }

    case 'DOUBLE_STREET': {
      const row = { betType: BetType.LINE, param: 0, numbers: nums, wager: chipValue }
      return { ...row, libraryBetId, libraryPayload: [...payload] }
    }

    case '1ST_COLUMN': return { betType: BetType.COLUMN, param: 0, numbers: [], wager: chipValue, libraryBetId, libraryPayload: [...payload] }
    case '2ND_COLUMN': return { betType: BetType.COLUMN, param: 1, numbers: [], wager: chipValue, libraryBetId, libraryPayload: [...payload] }
    case '3RD_COLUMN': return { betType: BetType.COLUMN, param: 2, numbers: [], wager: chipValue, libraryBetId, libraryPayload: [...payload] }

    case '1ST_DOZEN': return { betType: BetType.DOZEN, param: 0, numbers: [], wager: chipValue, libraryBetId, libraryPayload: [...payload] }
    case '2ND_DOZEN': return { betType: BetType.DOZEN, param: 1, numbers: [], wager: chipValue, libraryBetId, libraryPayload: [...payload] }
    case '3RD_DOZEN': return { betType: BetType.DOZEN, param: 2, numbers: [], wager: chipValue, libraryBetId, libraryPayload: [...payload] }

    case 'RED':   return { betType: BetType.RED_BLACK, param: 0, numbers: [], wager: chipValue, libraryBetId, libraryPayload: [...payload] }
    case 'BLACK': return { betType: BetType.RED_BLACK, param: 1, numbers: [], wager: chipValue, libraryBetId, libraryPayload: [...payload] }

    case 'EVEN': return { betType: BetType.EVEN_ODD, param: 0, numbers: [], wager: chipValue, libraryBetId, libraryPayload: [...payload] }
    case 'ODD':  return { betType: BetType.EVEN_ODD, param: 1, numbers: [], wager: chipValue, libraryBetId, libraryPayload: [...payload] }

    case '1_TO_18':  return { betType: BetType.LOW_HIGH, param: 0, numbers: [], wager: chipValue, libraryBetId, libraryPayload: [...payload] }
    case '19_TO_36': return { betType: BetType.LOW_HIGH, param: 1, numbers: [], wager: chipValue, libraryBetId, libraryPayload: [...payload] }

    default: return null
  }
}

interface RouletteBettingTableProps {
  bets: RouletteBet[]
  chipValue: bigint
  onBetsChange: (bets: RouletteBet[]) => void
  disabled?: boolean
  winningNumber?: number | null
}

export function RouletteBettingTable({
  bets,
  chipValue,
  onBetsChange,
  disabled,
  winningNumber,
}: RouletteBettingTableProps) {
  const winningAttr =
    winningNumber !== null && winningNumber !== undefined ? String(winningNumber) : undefined
  const libraryBets = useMemo((): Bets => {
    const o = {} as Bets
    for (const b of bets) {
      o[b.libraryBetId as keyof Bets] = {
        amount: Number(b.wager / MORBIUS_WEI),
        payload: [...b.libraryPayload],
        payoutScale: utils.calculatePayout(b.libraryBetId as never),
      }
    }
    return o
  }, [bets])

  const handleBet = useCallback(
    ({ bet, payload, id }: { bet: string; payload: string[]; id: string }) => {
      if (disabled) return
      const newBet = libraryBetToRouletteBet(bet, payload, chipValue, id)
      if (!newBet) return

      const existing = bets.findIndex((b) => b.libraryBetId === id)
      if (existing !== -1) {
        const updated = [...bets]
        updated[existing] = { ...updated[existing], wager: updated[existing].wager + chipValue }
        onBetsChange(updated)
      } else {
        onBetsChange([...bets, newBet])
      }
      playRouletteChipSound()
    },
    [disabled, chipValue, bets, onBetsChange]
  )

  return (
    <div className="flex min-w-0 flex-col gap-2 select-none w-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-1 flex-wrap">
        <span className="inline-flex items-center gap-2 text-xl text-gray-400">
          <span className="relative h-9 w-9 shrink-0">
            <Image
              src={rouletteChipSrcForDenom(Number(formatEther(chipValue)))}
              alt=""
              fill
              sizes="36px"
              className="object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]"
            />
          </span>
          <span>
            Chip:{' '}
            <span className="text-cyan-400 font-bold">
              {Number(formatEther(chipValue)).toLocaleString(undefined, { maximumFractionDigits: 0 })} MORBIUS
            </span>
          </span>
        </span>
        {bets.length > 0 && !disabled && (
          <button
            type="button"
            onClick={() => onBetsChange([])}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold uppercase tracking-wide
              bg-gradient-to-r from-[#1a0f13] to-[#2a171e] text-rose-50/95
              border-2 border-[#e01e3d]/80 shadow-[0_0_16px_rgba(224,30,61,0.35),inset_0_1px_0_rgba(255,255,255,0.07)]
              hover:from-[#221218] hover:to-[#321d26] hover:border-[#ff3d62] active:scale-[0.98]
              transition-all duration-150"
          >
            <Trash2 className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            Clear all
          </button>
        )}
      </div>

      <div className="morb-roulette-table-rail w-full min-w-0 overflow-hidden">
        <RouletteRecentNumbersStrip />
        <div
          className="morb-roulette-felt-surface"
          data-winning-pocket={winningAttr}
        >
          <div className="morb-roulette-table-wrap relative z-[1] w-full overflow-hidden rounded-lg border border-cyan-500/35">
            <CasinoRouletteTable
              bets={libraryBets}
              chips={ROULETTE_CHIPS}
              onBet={handleBet as any}
              layoutType="european"
              readOnly={disabled}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
