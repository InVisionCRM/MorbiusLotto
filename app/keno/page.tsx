'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { useAccount } from 'wagmi'
import { formatEther } from 'viem'
import {
  KENO_ADDRESS,
  MORBIUS_TOKEN_ADDRESS,
} from '@/lib/contracts'
import { LiveKenoBoard } from '@/components/CryptoKeno/live-keno-board'
import { KenoPrizePoolModal } from '@/components/CryptoKeno/keno-prize-pool-modal'
import KenoTopPlayers from '@/components/CryptoKeno/KenoTopPlayers'
import { KenoRecentPlays } from '@/components/CryptoKeno/KenoRecentPlays'
import { GlobalKenoHistoryTable } from '@/components/CryptoKeno/GlobalKenoHistoryTable'
import Footer from '@/components/PLINKO/Footer'
import { GameFAQ } from '@/components/shared/GameFAQ'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { PlayerProfileModal, type PlayerProfileGame } from '@/components/shared/PlayerProfileModal'
import { useKenoPlayerStats } from '@/hooks/use-keno-results'
import { AdSpace } from '@/components/shared/AdSpace'
import { MorbiusLoadingChip } from '@/components/shared/MorbiusLoadingChip'
import { KenoDrawingOverlay } from '@/components/CryptoKeno/KenoDrawingOverlay'
import { KenoPlayPanelShell } from '@/components/CryptoKeno/KenoPlayPanelShell'
import { KenoTicketBuilder } from '@/components/CryptoKeno/KenoTicketBuilder'
import { KenoConfirmPanel } from '@/components/CryptoKeno/KenoConfirmPanel'
import { useKenoPlayFlow } from '@/hooks/useKenoPlayFlow'

const ALL_NUMBERS = Array.from({ length: 80 }, (_, i) => i + 1)

// Must match CryptoKeno.sol _initDefaultPaytables (max wager 100k, top prize 25x @ 10/10 = 2.5M cap)
const PAYTABLE: Record<number, Record<number, number>> = {
  1: { 1: 2 },
  2: { 2: 3 },
  3: { 2: 2, 3: 4 },
  4: { 2: 1, 3: 3, 4: 7 },
  5: { 3: 2, 4: 7, 5: 10 },
  6: { 3: 1, 4: 5, 5: 10, 6: 12 },
  7: { 3: 1, 4: 5, 5: 9, 6: 12, 7: 15 },
  8: { 4: 2, 5: 5, 6: 7, 7: 12, 8: 17 },
  9: { 4: 2, 5: 4, 6: 7, 7: 10, 8: 15, 9: 20 },
  10: { 0: 3, 5: 2, 6: 5, 7: 12, 8: 15, 9: 20, 10: 25 },
}

function KenoIntroScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const duration = 2500
    const fallbackTimeout = setTimeout(() => {
      setTimeout(onComplete, 200)
    }, duration)
    return () => clearTimeout(fallbackTimeout)
  }, [onComplete])

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(10, 15, 20))',
      }}
      suppressHydrationWarning
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-6">
        <div className="w-[300px] shrink-0">
          <AdSpace slot="loading" width={300} height={100} showCta={true} />
        </div>
        <div className="flex flex-col items-center gap-[30px]">
        <div className="grid grid-cols-5 gap-1 shrink-0">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="w-8 h-8 rounded bg-gradient-to-br from-cyan-500 to-purple-700 flex items-center justify-center text-white text-xs font-bold"
              style={{
                animation: 'kenoCellIn 0.35s ease-out both',
                animationDelay: `${i * 0.05}s`,
              }}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <div className="text-center shrink-0">
          <div className="text-white text-xl font-bold animate-pulse mb-2">
            PICKING NUMBERS...
          </div>
          <div className="text-gray-400 text-sm">
            Preparing Keno
          </div>
        </div>
        </div>
      </div>
      <MorbiusLoadingChip />
      <style jsx>{`
        @keyframes kenoCellIn {
          0% {
            transform: scale(0);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

export default function KenoPage() {
  const { address, isConnected } = useAccount()

  const [showIntro, setShowIntro] = useState(true)
  const handleIntroComplete = useCallback(() => setShowIntro(false), [])

  // Game state
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([])
  const [spotSize, setSpotSize] = useState(8)
  const [wager, setWager] = useState(1000)
  const [showPrizePool, setShowPrizePool] = useState(false)
  const [playerProfileOpen, setPlayerProfileOpen] = useState(false)
  const [playerProfileGame, setPlayerProfileGame] = useState<PlayerProfileGame>('keno')
  const [isNumberPickerCollapsed, setIsNumberPickerCollapsed] = useState(true)

  const kenoStats = useKenoPlayerStats(address ?? undefined)
  const {
    paymentMethod,
    setPaymentMethod,
    handlePlay,
    busy,
    isApprovePending,
    isApproveConfirming,
    isPlayPending,
    isPlaying,
    lastResult,
    drawComplete,
    setDrawComplete,
    drawnCount,
    setDrawnCount,
  } = useKenoPlayFlow({
    address,
    isConnected,
    selectedNumbers,
    spotSize,
    wager,
  })

  // Number toggle
  const handleToggleNumber = (n: number) => {
    setSelectedNumbers((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n)
      if (prev.length >= spotSize) return prev
      return [...prev, n]
    })
  }

  const quickPick = () => {
    const pool = [...ALL_NUMBERS]
    const picks: number[] = []
    while (picks.length < spotSize && pool.length) {
      const idx = Math.floor(Math.random() * pool.length)
      picks.push(pool.splice(idx, 1)[0])
    }
    setSelectedNumbers(picks)
  }

  if (showIntro) {
    return <KenoIntroScreen onComplete={handleIntroComplete} />
  }

  const ticketBuilder = (
    <KenoTicketBuilder
      spotSize={spotSize}
      wager={wager}
      selectedNumbers={selectedNumbers}
      isNumberPickerCollapsed={isNumberPickerCollapsed}
      paytable={PAYTABLE}
      allNumbers={ALL_NUMBERS}
      onSpotSizeChange={setSpotSize}
      onWagerChange={setWager}
      onQuickPick={quickPick}
      onClearNumbers={() => setSelectedNumbers([])}
      onToggleNumber={handleToggleNumber}
      onNumberPickerCollapsedChange={setIsNumberPickerCollapsed}
    />
  )

  // Shared confirm panel JSX
  const confirmPanel = (
    <KenoConfirmPanel
      paymentMethod={paymentMethod}
      spotSize={spotSize}
      wager={wager}
      isConnected={isConnected}
      busy={busy}
      selectedNumbersCount={selectedNumbers.length}
      isApprovePending={isApprovePending}
      isApproveConfirming={isApproveConfirming}
      isPlayPending={isPlayPending}
      isPlaying={isPlaying}
      onPaymentMethodChange={setPaymentMethod}
      onPlay={handlePlay}
    />
  )

  return (
    <div
      className="min-h-screen text-white"
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.95))',
      }}
    >
      <GlobalMainNav
        onShowKenoPrizePool={() => setShowPrizePool(true)}
        onOpenPlayerProfile={address ? (game) => { setPlayerProfileGame(game); setPlayerProfileOpen(true); } : undefined}
      >
      <main className="px-2 sm:px-4 md:px-6 pb-16 pt-4 md:pt-2 w-full max-w-full overflow-x-hidden">
        <div className="flex flex-col md:grid md:grid-cols-2 gap-6">
          {/* LEFT COLUMN: Live board always visible — min-height keeps layout stable when overlay shows/hides */}
          <div className="flex flex-col gap-6 order-1 md:order-none min-h-[520px] md:min-h-[580px]">
            {/* Live Keno Board — fixed min-height so overlay doesn't change column size */}
            <div id="live-keno-board" className="min-h-[380px] flex flex-col">
              <LiveKenoBoard
                winningNumbers={lastResult?.winningNumbers ?? []}
                active={!!lastResult}
                onDrawComplete={() => setDrawComplete(true)}
                onDrawProgress={(drawn, total) => setDrawnCount(drawn)}
                tickets={lastResult ? [{
                  ticketId: lastResult.ticketId,
                  numbers: lastResult.playerNumbers,
                  spotSize: lastResult.spotSize,
                  wager: Number(formatEther(lastResult.wager)).toFixed(0),
                  draws: 1,
                  // Keep drawsRemaining at 1 during animation so "Your Numbers" stays visible;
                  // the filteredTickets filter in LiveKenoBoard also bypasses this when active=true
                  drawsRemaining: drawComplete ? 0 : 1,
                  firstRoundId: BigInt(0),
                  roundTo: 0,
                  isActive: !drawComplete,
                  currentWin: drawComplete ? Number(formatEther(lastResult.netPayout)).toFixed(0) : '0',
                }] : selectedNumbers.length > 0 ? [{
                  ticketId: BigInt(0),
                  numbers: selectedNumbers,
                  spotSize,
                  wager: wager.toString(),
                  draws: 1,
                  drawsRemaining: 1,
                  firstRoundId: BigInt(0),
                  roundTo: 0,
                  isActive: true,
                  currentWin: '0',
                }] : []}
              />
            </div>

            {/* Mobile ticket builder */}
            <div className="md:hidden">
              <KenoPlayPanelShell
                ticketBuilder={ticketBuilder}
                confirmPanel={confirmPanel}
                overlay={lastResult && !drawComplete ? (
                  <KenoDrawingOverlay
                    drawnCount={drawnCount}
                    lastResult={lastResult}
                    kenoStats={kenoStats}
                  />
                ) : null}
              />
            </div>

            {/* Advertising space — fixed height so board/betting panel/ad stay same size after game */}
            <AdSpace slot="default" />

          </div>

          {/* RIGHT COLUMN - Ticket Builder (desktop only) — min-height matches left so columns stay same size */}
          <div className="hidden md:block order-2 md:order-none min-h-[520px] md:min-h-[580px]">
            <KenoPlayPanelShell
              ticketBuilder={ticketBuilder}
              confirmPanel={confirmPanel}
              overlay={lastResult && !drawComplete ? (
                <KenoDrawingOverlay
                  drawnCount={drawnCount}
                  lastResult={lastResult}
                  kenoStats={kenoStats}
                />
              ) : null}
            />
          </div>
        </div>

        {/* Recent Games / Recent Play / Leaderboard tabs */}
        <section className="mt-6">
          <div className="surface-panel relative overflow-hidden rounded-2xl">
            <div className="surface-cyan-glow" />

            <Tabs defaultValue="recent-games" className="relative p-3 sm:p-4">
              <TabsList className="grid w-full grid-cols-3 h-11 bg-black/40 border border-cyan-500/30 rounded-xl p-1">
                <TabsTrigger
                  value="recent-games"
                  className="font-jost font-bold text-[14px] text-white/80 data-[state=active]:text-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 rounded-lg transition-all"
                >
                  Recent Games
                </TabsTrigger>
                <TabsTrigger
                  value="recent-play"
                  className="font-jost font-bold text-[14px] text-white/80 data-[state=active]:text-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 rounded-lg transition-all"
                >
                  Recent Play
                </TabsTrigger>
                <TabsTrigger
                  value="leaderboard"
                  className="font-jost font-bold text-[14px] text-white/80 data-[state=active]:text-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 rounded-lg transition-all"
                >
                  Leaderboard
                </TabsTrigger>
              </TabsList>

              <TabsContent value="recent-games" className="mt-4 focus-visible:outline-none">
                <GlobalKenoHistoryTable title="Recent games" />
              </TabsContent>

              <TabsContent value="recent-play" className="mt-4 focus-visible:outline-none">
                <KenoRecentPlays compact />
              </TabsContent>

              <TabsContent value="leaderboard" className="mt-4 focus-visible:outline-none">
                <KenoTopPlayers />
              </TabsContent>
            </Tabs>
          </div>
        </section>

        {/* How to Play */}
        <section className="mt-6">
          <Card
            className="rounded-xl overflow-hidden border border-cyan-500/30"
            style={{
              background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.9), rgba(40, 40, 40, 0.7))',
              boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div className="p-4 space-y-4">
              <h2 className="text-lg font-bold text-cyan-400">How to Play Crypto KENO</h2>
              <div className="space-y-4 text-sm text-white/90">
                <div>
                  <h3 className="font-semibold text-white mb-1">Getting Started</h3>
                  <p>Connect your Web3 wallet to play on PulseChain. Choose how many spots (1-10) you want to play. Set your wager in MORBIUS or pay with PLS.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">Selecting Numbers</h3>
                  <p>Pick numbers from 1-80 or use Quick Pick. The count must match your spot size.</p>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">Instant Results</h3>
                  <p>Click Play Now and the contract draws 20 winning numbers in the same transaction. Your result and payout appear instantly!</p>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">Paytables</h3>
                  <p>Paytables are shown above for your chosen spot size. Higher spot sizes offer bigger multipliers for full matches.</p>
                </div>
              </div>
            </div>
          </Card>
        </section>

      </main>

      {/* Prize Pool Modal */}
      <KenoPrizePoolModal
        open={showPrizePool}
        onOpenChange={setShowPrizePool}
      />

      <PlayerProfileModal
        isOpen={playerProfileOpen}
        onClose={() => setPlayerProfileOpen(false)}
        address={address ?? null}
        game={playerProfileGame}
      />

      {/* FAQ (includes contract addresses) */}
      <div className="w-full flex justify-center py-4">
        <GameFAQ
          game="keno"
          addresses={[
            { label: 'Keno Contract', address: KENO_ADDRESS },
            { label: 'MORBIUS Token', address: MORBIUS_TOKEN_ADDRESS },
          ]}
        />
      </div>

      {/* Footer */}
      <Footer />
      </GlobalMainNav>
    </div>
  )
}
