'use client'

import { useState } from 'react'
import { Menu, X, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { LOTTERY_ADDRESS } from '@/lib/contracts'
import { YourResultsModal } from './modals/your-results-modal'
import { PreviousRoundsBracketsModal } from './modals/previous-rounds-brackets-modal'
import { HowToPlayModal } from './modals/how-to-play-modal'
import { RoundHistoryModal } from './modals/round-history-modal'
import { SwitchModal } from './modals/switch-modal'
import { BallDrawModal } from './modals/ball-draw-modal'

interface NavigationMenuProps {
  // Props for Your Results
  address?: `0x${string}`
  displayRoundId: number
  isLoadingTicketsFinal: boolean
  winningNumbers: readonly (number | bigint)[]
  roundState: number
  winningTickets: Array<{
    ticketId: bigint
    matches: number
    payout: bigint
    numbers: readonly (number | bigint)[]
  }>
  totalWinningPssh: bigint
  formatPssh: (amount: bigint) => string

  // Props for Previous Rounds Brackets
  brackets: Array<{
    bracketId: number
    poolAmount: bigint
    winnerCount: number
    matchCount: number
  }>
  isLoadingBrackets: boolean
  isMegaMillions: boolean

  // Props for Round History
  currentRoundId: number
}

export function NavigationMenu({
  address,
  displayRoundId,
  isLoadingTicketsFinal,
  winningNumbers,
  roundState,
  winningTickets,
  totalWinningPssh,
  formatPssh,
  brackets,
  isLoadingBrackets,
  isMegaMillions,
  currentRoundId,
}: NavigationMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeModal, setActiveModal] = useState<string | null>(null)

  const menuItems = [
    { id: 'your-results', label: 'Your Results' },
    { id: 'previous-brackets', label: 'Previous Rounds Prize Brackets' },
    { id: 'ball-draw', label: 'View Draw Animation' },
    { id: 'how-to-play', label: 'How to Play' },
    { id: 'round-history', label: 'Round History' },
    { id: 'switch', label: 'Switch' },
  ]

  const handleMenuItemClick = (itemId: string, href?: string) => {
    if (href) {
      window.open(href, '_blank', 'noopener,noreferrer')
      setIsOpen(false)
      return
    }
    setActiveModal(itemId)
    setIsOpen(false)
  }

  const closeModal = () => {
    setActiveModal(null)
  }

  return (
    <>
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>

        {isOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            <div className="absolute right-0 top-full mt-2 w-64 bg-black/95 border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
              <div className="px-3 py-2 bg-white/5 border-b border-white/10 flex items-center justify-between text-xs text-white/80">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] uppercase tracking-wide text-white/60 mb-1">Lottery CA</div>
                  <div className="font-mono text-[11px] break-all">{LOTTERY_ADDRESS}</div>
                </div>
                <button
                  type="button"
                  className="p-1.5 rounded hover:bg-white/10 transition-colors flex-shrink-0 ml-2"
                  aria-label="Copy Lottery CA"
                  onClick={() => navigator.clipboard.writeText(LOTTERY_ADDRESS)}
                >
                  <Copy className="w-4 h-4 text-white/80" />
                </button>
              </div>
              <div className="py-1">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleMenuItemClick(item.id, item.href)}
                    className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/10 transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Your Results Modal */}
      <Dialog open={activeModal === 'your-results'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-3xl bg-black max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/10">
            <DialogTitle>Your Results</DialogTitle>
            <DialogDescription>
              Your winning tickets from Round #{displayRoundId || '-'}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-6">
            <YourResultsModal
              address={address}
              displayRoundId={displayRoundId}
              isLoadingTicketsFinal={isLoadingTicketsFinal}
              winningNumbers={winningNumbers}
              roundState={roundState}
              winningTickets={winningTickets}
              totalWinningPssh={totalWinningPssh}
              formatPssh={formatPssh}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Previous Rounds Prize Brackets Modal */}
      <Dialog open={activeModal === 'previous-brackets'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-4xl bg-black max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/10">
            <DialogTitle>Previous Rounds Prize Brackets</DialogTitle>
            <DialogDescription>
              Prize bracket information for the current round
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-6">
            <PreviousRoundsBracketsModal
              brackets={brackets}
              isLoading={isLoadingBrackets}
              isMegaMillions={isMegaMillions}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* How to Play Modal */}
      <Dialog open={activeModal === 'how-to-play'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-5xl bg-black max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/10">
            <DialogTitle>How the 6-of-55 Lottery Works</DialogTitle>
            <DialogDescription>
              Everything you need to know about playing
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-6">
            <HowToPlayModal />
          </div>
        </DialogContent>
      </Dialog>

      {/* Round History Modal */}
      <Dialog open={activeModal === 'round-history'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-5xl bg-black max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/10">
            <DialogTitle>Round History</DialogTitle>
            <DialogDescription>
              View past rounds and their results
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-6">
            <RoundHistoryModal currentRoundId={currentRoundId} maxRounds={10} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Switch Modal */}
      <Dialog open={activeModal === 'switch'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-6xl bg-black max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/10">
            <DialogTitle>Switch</DialogTitle>
            <DialogDescription>
              Swap tokens on PulseChain
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 px-6">
            <SwitchModal />
          </div>
        </DialogContent>
      </Dialog>

      {/* Ball Draw Simulator Modal */}
      <Dialog open={activeModal === 'ball-draw'} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="max-w-6xl bg-black/95 border-white/10 p-0 overflow-hidden max-h-[95vh] flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-white/10">
            <DialogTitle>Round #{displayRoundId || currentRoundId} Draw Animation</DialogTitle>
            <DialogDescription>
              Watch the winning numbers being drawn
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-hidden flex-1">
            {winningNumbers.length === 6 && roundState === 2 ? (
              <BallDrawModal
                winningNumbers={winningNumbers.map((n) => Number(n))}
                roundId={displayRoundId || currentRoundId}
                playerTickets={[]} // Navigation menu doesn't have access to player tickets
              />
            ) : (
              <div className="p-6 text-center">
                <p className="text-white/60">No winning numbers available for this round yet.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
