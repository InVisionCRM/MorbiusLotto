'use client'

import Image from 'next/image'
import { formatEther, parseEther } from 'viem'
import { cn } from '@/lib/utils'
import { WalletMenu } from '@/components/shared/WalletMenu'
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text'
import { PaymentMethodToggle } from '@/components/shared/PaymentMethodToggle'
import { GameTransactionButton } from '@/components/shared/GameTransactionButton'
import type { RouletteBet } from '@/hooks/useRoulettePlayFlow'
import { ROULETTE_CHIP_DENOMS, rouletteChipSrcForDenom } from '@/components/Roulette/roulette-chip-assets'

interface RouletteActionPanelProps {
  bets: RouletteBet[]
  totalWager: bigint
  chipValue: bigint
  onChipChange: (value: bigint) => void
  paymentMethod: 'MORBIUS' | 'PLS'
  onPaymentMethodChange: (method: 'MORBIUS' | 'PLS') => void
  isConnected: boolean
  busy: boolean
  isApprovePending: boolean
  isApproveConfirming: boolean
  isSpinPending: boolean
  isSpinning: boolean
  onSpin: () => void
}

export function RouletteActionPanel({
  bets,
  totalWager,
  chipValue,
  onChipChange,
  paymentMethod,
  onPaymentMethodChange,
  isConnected,
  busy,
  isApprovePending,
  isApproveConfirming,
  isSpinPending,
  isSpinning,
  onSpin,
}: RouletteActionPanelProps) {
  const noBets = bets.length === 0

  return (
    <div
      className="rounded-2xl p-4 flex flex-col gap-4"
      style={{
        background: 'linear-gradient(325deg, rgba(20,20,20,0.9), rgba(40,40,40,0.7))',
        boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.8), inset 0 -3px 6px rgba(255,255,255,0.05)',
        border: '1px solid rgba(34, 211, 238, 0.25)',
      }}
    >
      {/* Chip selector */}
      <div>
        <div className="text-xs text-gray-500 uppercase tracking-widest mb-2 font-semibold">Chip Value</div>
        <div className="grid grid-cols-3 gap-2">
          {ROULETTE_CHIP_DENOMS.map((v) => {
            const wei = parseEther(v.toString())
            const active = chipValue === wei
            const label = v >= 1_000 ? `${v / 1_000}k` : v.toString()
            const src = rouletteChipSrcForDenom(v)
            return (
              <button
                key={v}
                type="button"
                onClick={() => onChipChange(wei)}
                title={`${v.toLocaleString()} MORBIUS`}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2 transition-all',
                  active
                    ? 'border-cyan-400 bg-cyan-950/40 shadow-[0_0_14px_rgba(34,211,238,0.4)] ring-1 ring-cyan-400/60'
                    : 'border-cyan-500/25 bg-black/35 hover:border-cyan-500/45 hover:bg-cyan-950/20'
                )}
              >
                <span className="relative h-11 w-11 shrink-0">
                  <Image
                    src={src}
                    alt=""
                    fill
                    sizes="44px"
                    className="object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.65)]"
                  />
                </span>
                <span
                  className={cn(
                    'text-[10px] font-black tabular-nums leading-none',
                    active ? 'text-cyan-200' : 'text-cyan-400/90'
                  )}
                >
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Total wager */}
      <div className="flex items-center justify-between rounded-xl px-3 py-2 bg-black/40 border border-white/10">
        <span className="text-xs text-gray-500">Total Bet</span>
        <span className="text-cyan-400 font-black">
          {Number(formatEther(totalWager)).toLocaleString(undefined, { maximumFractionDigits: 0 })} MORBIUS
        </span>
      </div>

      {/* Payment method */}
      <div
        className="rounded-lg p-3"
        style={{
          background: 'linear-gradient(325deg, rgba(20,20,20,0.8), rgba(40,40,40,0.6))',
          boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.8)',
          border: '1px inset rgba(60,60,60,0.5)',
        }}
      >
        <PaymentMethodToggle value={paymentMethod} onChange={onPaymentMethodChange} textClassName="text-xl font-semibold" />
      </div>

      {/* Spin / Connect button */}
      {!isConnected ? (
        <div className="w-full flex justify-center">
          <WalletMenu className="justify-center" />
        </div>
      ) : (
        <GameTransactionButton
          className={cn(
            'h-14 text-lg hover:opacity-80',
            busy || noBets
              ? 'text-white/40 [-webkit-text-stroke:0.1px_black] font-bold'
              : 'text-white'
          )}
          disabled={busy || noBets}
          onClick={onSpin}
          isLoading={isApprovePending || isApproveConfirming || isSpinPending || isSpinning}
        >
          {isApprovePending || isApproveConfirming ? (
            <AnimatedShinyText className="text-white/40 [-webkit-text-stroke:0.1px_black] font-bold">
              Approving...
            </AnimatedShinyText>
          ) : isSpinPending || isSpinning ? (
            <AnimatedShinyText className="text-white/40 [-webkit-text-stroke:0.1px_black] font-bold">
              Spinning...
            </AnimatedShinyText>
          ) : noBets ? (
            'Place a Bet First'
          ) : (
            <AnimatedShinyText className="text-white [-webkit-text-stroke:0.1px_black] font-bold">
              {paymentMethod === 'PLS' ? 'Spin with PLS' : 'SPIN'}
            </AnimatedShinyText>
          )}
        </GameTransactionButton>
      )}
    </div>
  )
}
