'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseEther } from 'viem'
import { useAccount } from 'wagmi'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import Footer from '@/components/PLINKO/Footer'
import { GameFAQ } from '@/components/shared/GameFAQ'
import { ROULETTE_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'
import { useRoulettePlayFlow, type RouletteBet } from '@/hooks/useRoulettePlayFlow'
import { RouletteWheel } from '@/components/Roulette/RouletteWheel'
import { RouletteBettingTable } from '@/components/Roulette/RouletteBettingTable'
import { RouletteResultOverlay } from '@/components/Roulette/RouletteResultOverlay'
import { RouletteActionPanel } from '@/components/Roulette/RouletteActionPanel'
import { RouletteRecentPlays } from '@/components/Roulette/RouletteRecentPlays'
import { RouletteRoomBackgroundPicker } from '@/components/Roulette/RouletteRoomBackgroundPicker'
import { useRouletteRoomBackground } from '@/hooks/use-roulette-room-background'
import { playRouletteSpinStartSound } from '@/lib/roulette-sounds'

const DEFAULT_CHIP = parseEther('1000')

export default function RoulettePage() {
  const { address, isConnected } = useAccount()

  const [bets, setBets] = useState<RouletteBet[]>([])
  const [chipValue, setChipValue] = useState<bigint>(DEFAULT_CHIP)
  const [showResult, setShowResult] = useState(false)
  const [wheelSpinning, setWheelSpinning] = useState(false)
  // wheelResult drives the winningBet prop — null resets it to '-1' between spins
  const [wheelResult, setWheelResult] = useState<number | null>(null)

  const totalWager = useMemo(() => bets.reduce((sum, b) => sum + b.wager, 0n), [bets])

  const {
    paymentMethod,
    setPaymentMethod,
    handleSpin,
    busy,
    isApprovePending,
    isApproveConfirming,
    isSpinPending,
    isSpinning,
    lastResult,
    setSpinComplete,
  } = useRoulettePlayFlow({ address, isConnected, bets, totalWager })

  // Trigger wheel when result arrives
  const prevResultRef = useMemo(() => ({ current: null as typeof lastResult }), [])
  if (lastResult && lastResult !== prevResultRef.current) {
    prevResultRef.current = lastResult
    setWheelSpinning(true)
    setShowResult(false)
    setWheelResult(lastResult.result)
  }

  const handleWheelSpinComplete = useCallback(() => {
    setWheelSpinning(false)
    setWheelResult(null)   // reset so next spin always triggers the effect
    setSpinComplete(true)
    setShowResult(true)
  }, [setSpinComplete])

  const handleBetsChange = useCallback((newBets: RouletteBet[]) => {
    setBets(newBets)
    if (newBets.length === 0) setShowResult(false)
  }, [])

  const handleDismissResult = useCallback(() => {
    setShowResult(false)
    setBets([])
  }, [])

  const { id: roomBgId, setId: setRoomBgId, preset: roomPreset } = useRouletteRoomBackground()

  const spinStartSoundForSpinId = useRef<bigint | null>(null)
  useEffect(() => {
    if (!wheelSpinning || !lastResult) return
    if (spinStartSoundForSpinId.current === lastResult.spinId) return
    spinStartSoundForSpinId.current = lastResult.spinId
    playRouletteSpinStartSound()
  }, [wheelSpinning, lastResult])

  return (
    <div className="relative min-h-screen text-white">
      {/* Classy room atmosphere (same preset family as poker felt); fixed while content scrolls */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 min-h-screen"
        style={{
          background: roomPreset.gradient,
          backgroundAttachment: 'fixed',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'cover',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] min-h-screen bg-[radial-gradient(ellipse_80%_55%_at_50%_0%,rgba(34,211,238,0.11),transparent_65%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[1] min-h-screen bg-gradient-to-b from-transparent via-transparent to-black/35"
      />
      <div className="relative z-10">
      <GlobalMainNav onOpenPlayerProfile={address ? () => {} : undefined}>
        <main className="mx-auto w-[90%] overflow-x-hidden px-3 pb-16 pt-4 sm:px-4 lg:px-6">

          {/* ── Game: ~⅔ wheel + table | ~⅓ action + recent plays (stack on small screens) ── */}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-6">
            <div className="flex w-full min-w-0 flex-col gap-6 lg:w-2/3">
              <div className="flex justify-center">
                <div className="relative">
                  <RouletteWheel
                    roomBgId={roomBgId}
                    spinning={wheelSpinning}
                    result={wheelResult}
                    onSpinComplete={handleWheelSpinComplete}
                  />
                  {showResult && lastResult && (
                    <RouletteResultOverlay
                      result={lastResult}
                      onDismiss={handleDismissResult}
                    />
                  )}
                </div>
              </div>
              <RouletteBettingTable
                bets={bets}
                chipValue={chipValue}
                onBetsChange={handleBetsChange}
                disabled={busy || wheelSpinning}
                winningNumber={showResult ? lastResult?.result ?? null : null}
              />
            </div>

            <aside className="w-full shrink-0 lg:w-1/3 lg:min-w-0 flex flex-col gap-4">
              <RouletteActionPanel
                bets={bets}
                totalWager={totalWager}
                chipValue={chipValue}
                onChipChange={setChipValue}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={setPaymentMethod}
                isConnected={isConnected}
                busy={busy}
                isApprovePending={isApprovePending}
                isApproveConfirming={isApproveConfirming}
                isSpinPending={isSpinPending}
                isSpinning={isSpinning}
                onSpin={handleSpin}
              />
              <div
                className="relative overflow-hidden rounded-2xl"
                style={{ background: 'linear-gradient(325deg, rgba(15,25,15,0.9), rgba(20,30,15,0.7))' }}
              >
                <Tabs defaultValue="recent-games" className="relative p-3 sm:p-4">
                  <TabsList className="grid w-full grid-cols-2 h-11 bg-black/40 border border-cyan-500/30 rounded-xl p-1">
                    <TabsTrigger
                      value="recent-games"
                      className="font-jost font-bold text-[14px] text-white/80 data-[state=active]:text-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 rounded-lg transition-all"
                    >
                      Recent Spins
                    </TabsTrigger>
                    <TabsTrigger
                      value="my-spins"
                      className="font-jost font-bold text-[14px] text-white/80 data-[state=active]:text-white data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-600 data-[state=active]:to-blue-600 rounded-lg transition-all"
                    >
                      My Spins
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="recent-games" className="mt-4 focus-visible:outline-none">
                    <RouletteRecentPlays hold={wheelSpinning} />
                  </TabsContent>
                  <TabsContent value="my-spins" className="mt-4 focus-visible:outline-none">
                    <RouletteRecentPlays playerAddress={address} compact hold={wheelSpinning} />
                  </TabsContent>
                </Tabs>
              </div>
            </aside>
          </div>

          {/* ── How to Play ── */}
          <section className="mt-6">
            <Card
              className="rounded-xl overflow-hidden border border-cyan-500/30"
              style={{
                background: 'linear-gradient(325deg, rgba(20,20,20,0.9), rgba(40,40,40,0.7))',
                boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.8)',
              }}
            >
              <div className="p-4 space-y-4">
                <h2 className="text-lg font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  How to Play Roulette
                </h2>
                <div className="grid sm:grid-cols-2 gap-4 text-sm text-white/90">
                  <div>
                    <h3 className="font-semibold text-white mb-1">Place Your Bets</h3>
                    <p>Select a chip value, then click any number or outside bet zone. Click the same spot again to stack more chips.</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white mb-1">Bet Types</h3>
                    <p><strong>Straight</strong> (35:1) · <strong>Red/Black, Even/Odd, Low/High</strong> (1:1) · <strong>Columns &amp; Dozens</strong> (2:1)</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white mb-1">Spin &amp; Win</h3>
                    <p>Click SPIN. Result is determined on-chain in the same transaction — provably fair, instant payout.</p>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white mb-1">Fees</h3>
                    <p>5% total: 1.25% MORBIUS holders · 1.75% house · 1.5% LP holders · 0.5% burn</p>
                  </div>
                </div>
              </div>
            </Card>
          </section>

          <div className="mt-6 flex justify-end">
            <RouletteRoomBackgroundPicker activeId={roomBgId} onSelect={setRoomBgId} />
          </div>

        </main>

        <div className="w-full flex justify-center py-4">
          <GameFAQ
            game="roulette"
            addresses={[
              { label: 'Roulette Contract', address: ROULETTE_ADDRESS },
              { label: 'MORBIUS Token', address: MORBIUS_TOKEN_ADDRESS },
            ]}
          />
        </div>

        <Footer />
      </GlobalMainNav>
      </div>
    </div>
  )
}
