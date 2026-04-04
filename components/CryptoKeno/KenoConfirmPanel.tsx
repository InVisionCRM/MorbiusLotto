'use client'
import { cn } from '@/lib/utils'
import { WalletMenu } from '@/components/shared/WalletMenu'
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text'
import { PaymentMethodToggle } from '@/components/shared/PaymentMethodToggle'
import { GameTransactionButton } from '@/components/shared/GameTransactionButton'
import { KenoConfirmPanelShell } from '@/components/CryptoKeno/KenoConfirmPanelShell'

interface KenoConfirmPanelProps {
  paymentMethod: 'MORBIUS' | 'PLS'
  spotSize: number
  wager: number
  isConnected: boolean
  busy: boolean
  selectedNumbersCount: number
  isApprovePending: boolean
  isApproveConfirming: boolean
  isPlayPending: boolean
  isPlaying: boolean
  onPaymentMethodChange: (paymentMethod: 'MORBIUS' | 'PLS') => void
  onPlay: () => void
}

export function KenoConfirmPanel({
  paymentMethod,
  spotSize,
  wager,
  isConnected,
  busy,
  selectedNumbersCount,
  isApprovePending,
  isApproveConfirming,
  isPlayPending,
  isPlaying,
  onPaymentMethodChange,
  onPlay,
}: KenoConfirmPanelProps) {
  return (
    <KenoConfirmPanelShell>
      <div className="relative z-10">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-white text-center mb-3">PLAY WITH</h2>
        </div>

        <div
          className="mb-4 w-full rounded-lg relative overflow-hidden p-4"
          style={{
            background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
            boxShadow:
              'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
            border: '1px inset rgba(60, 60, 60, 0.5)',
          }}
        >
          <PaymentMethodToggle value={paymentMethod} onChange={onPaymentMethodChange} textClassName="text-2xl font-semibold" />
        </div>

        {!isConnected ? (
          <div className="w-full flex justify-center">
            <WalletMenu className="justify-center" />
          </div>
        ) : (
          <GameTransactionButton
            className={cn(
              'h-12 hover:opacity-80',
              busy || selectedNumbersCount !== spotSize
                ? 'text-white/40 [-webkit-text-stroke:0.1px_black] font-bold'
                : 'text-white'
            )}
            disabled={busy || selectedNumbersCount !== spotSize}
            onClick={onPlay}
            isLoading={isApprovePending || isApproveConfirming || isPlayPending || isPlaying}
          >
            {isApprovePending || isApproveConfirming ? (
              <AnimatedShinyText className="text-white/40 [-webkit-text-stroke:0.1px_black] font-bold">Approving...</AnimatedShinyText>
            ) : isPlayPending || isPlaying ? (
              <AnimatedShinyText className="text-white/40 [-webkit-text-stroke:0.1px_black] font-bold">Playing...</AnimatedShinyText>
            ) : selectedNumbersCount !== spotSize ? (
              `Select ${spotSize - selectedNumbersCount} more number${spotSize - selectedNumbersCount !== 1 ? 's' : ''}`
            ) : (
              <AnimatedShinyText className="text-white [-webkit-text-stroke:0.1px_black] font-bold">
                {paymentMethod === 'PLS' ? 'Play with PLS' : 'Play Now'}
              </AnimatedShinyText>
            )}
          </GameTransactionButton>
        )}
      </div>
    </KenoConfirmPanelShell>
  )
}
