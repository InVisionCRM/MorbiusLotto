'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAccount } from 'wagmi'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { InstantLotteryPlayPanel } from '@/components/lottery/InstantLotteryPlayPanel'
import { InstantLotteryResultModal } from '@/components/lottery/InstantLotteryResultModal'
import { InstantLotteryHistory } from '@/components/lottery/InstantLotteryHistory'
import { GlobalLotteryHistoryTable } from '@/components/lottery/GlobalLotteryHistoryTable'
import LotteryTopPlayers from '@/components/lottery/LotteryTopPlayers'
import InstantBallDraw from '@/components/lottery/ball-draw-simulator/InstantBallDraw'
import { useInstantLotteryResults, useContractReserve, useInstantLotteryStats } from '@/hooks/use-instant-lottery'
import { formatUnits } from 'viem'
import { TOKEN_DECIMALS, LOTTERY_INSTANT_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'

/** Format wei as token amount: commas on integer part only, up to maxDecimals after decimal. */
function formatTokenDisplay(wei: bigint, decimals: number, maxDecimals = 2): string {
  const raw = formatUnits(wei, decimals)
  const [intPart, decPart] = raw.split('.')
  const commaInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (!decPart || maxDecimals === 0) return commaInt
  const dec = decPart.slice(0, maxDecimals).padEnd(maxDecimals, '0')
  return `${commaInt}.${dec}`
}
import Footer from '@/components/PLINKO/Footer'
import { GameFAQ } from '@/components/shared/GameFAQ'
import { toast } from 'sonner'
import type { InstantLotteryResultRow } from '@/hooks/use-instant-lottery'
import { AdSpace } from '@/components/shared/AdSpace'

const ZERO = '0x0000000000000000000000000000000000000000'
const isDeployed = (LOTTERY_INSTANT_ADDRESS as string) !== ZERO

function LotteryIntroScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const duration = 2500
    const t = setTimeout(() => setTimeout(onComplete, 200), duration)
    return () => clearTimeout(t)
  }, [onComplete])

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(10, 15, 20))',
      }}
      suppressHydrationWarning
    >
      <div className="absolute top-6 left-1/2 -translate-x-1/2 w-[300px]">
        <AdSpace slot="loading" width={300} height={100} showCta={false} />
      </div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-[30px]">
        <div className="relative w-16 h-16 shrink-0">
          <div
            className="absolute inset-0 rounded-full bg-gradient-to-br from-cyan-500 to-purple-700 flex items-center justify-center shadow-lg"
            style={{
              animation: 'lotteryBallIn 0.5s ease-out both',
              boxShadow: '0 4px 20px rgba(6, 182, 212, 0.4)',
            }}
          >
            <span className="text-white text-xl font-bold">⑥</span>
          </div>
        </div>
        <div className="text-center shrink-0">
          <div className="text-white text-xl font-bold animate-pulse mb-2">
            DRAWING NUMBERS...
          </div>
          <div className="text-gray-400 text-sm">
            Preparing Lotto
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes lotteryBallIn {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

export default function LotteryPage() {
  const { address } = useAccount()
  const [showIntro, setShowIntro] = useState(true)
  const [showResultModal, setShowResultModal] = useState(false)
  const lastShownResultKeyRef = useRef<string | null>(null)
  const [lastPlayResult, setLastPlayResult] = useState<InstantLotteryResultRow | null>(null)
  const [resultToAnimate, setResultToAnimate] = useState<InstantLotteryResultRow | null>(null)
  const lastAnimatedTxRef = useRef<string | null>(null)
  const initialResultsSeenRef = useRef(false)

  const { results } = useInstantLotteryResults({ playerAddress: address ?? undefined, limit: 50 })
  const { data: reserve = 0n } = useContractReserve()
  const { totalPlays, totalWagered, totalPayouts } = useInstantLotteryStats()

  const latestResultFromChain = results.length > 0 ? results[0] : null
  const latestResultForUser = lastPlayResult ?? latestResultFromChain

  const getResultKey = (r: InstantLotteryResultRow | null) =>
    r ? `${r.transactionHash ?? ''}-${String(r.blockNumber ?? '')}-${(r.winningNumbers ?? []).join(',')}` : null

  const [drawCompletedKey, setDrawCompletedKey] = useState<string | null>(null)

  useEffect(() => {
    if (results.length === 0) return
    const currentTx = results[0]?.transactionHash ?? null
    if (!initialResultsSeenRef.current) {
      initialResultsSeenRef.current = true
      if (currentTx) lastAnimatedTxRef.current = currentTx
      return
    }
    if (currentTx && currentTx !== lastAnimatedTxRef.current) {
      lastAnimatedTxRef.current = currentTx
      setResultToAnimate(results[0])
    }
  }, [results])

  const onResult = useCallback(
    (result: { playerNumbers: number[]; winningNumbers: number[]; matchCount: number; wager: bigint; netPayout: bigint; txHash?: string }) => {
      const row: InstantLotteryResultRow = {
        player: (address ?? '0x0') as `0x${string}`,
        playerNumbers: result.playerNumbers,
        winningNumbers: result.winningNumbers,
        matchCount: result.matchCount,
        wager: result.wager,
        grossPayout: result.netPayout,
        netPayout: result.netPayout,
        transactionHash: result.txHash as `0x${string}` | undefined,
      }
      setLastPlayResult(row)
      setResultToAnimate(row)
    },
    [address]
  )

  useEffect(() => {
    if (lastPlayResult?.transactionHash && latestResultFromChain?.transactionHash === lastPlayResult.transactionHash) {
      setLastPlayResult(null)
    }
  }, [lastPlayResult?.transactionHash, latestResultFromChain?.transactionHash])

  const onDrawComplete = useCallback(() => {
    if (!resultToAnimate) return
    const key = getResultKey(resultToAnimate)
    if (key) {
      lastShownResultKeyRef.current = key
      setDrawCompletedKey(key)
      setShowResultModal(true)
    }
  }, [resultToAnimate])

  if (showIntro) {
    return <LotteryIntroScreen onComplete={() => setShowIntro(false)} />
  }

  if (!isDeployed) {
    return (
      <div className="flex flex-col min-h-screen w-full">
        <GlobalMainNav>
          <main className="container mx-auto px-4 py-6 pt-4 md:pt-2">
            <div
              className="rounded-2xl p-8 text-center max-w-lg mx-auto"
              style={{
                background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                border: '1px inset rgba(60, 60, 60, 0.5)',
              }}
            >
              <h2 className="text-xl font-bold text-white mb-4">Instant Lottery Not Deployed</h2>
              <p className="text-white/70 mb-4">
                The instant lottery contract has not been deployed yet. Set <code className="bg-white/10 px-2 py-1 rounded text-cyan-300">NEXT_PUBLIC_LOTTERY_INSTANT_ADDRESS</code> after deployment.
              </p>
            </div>
          </main>
        </GlobalMainNav>
      </div>
    )
  }

  const panelStyle = {
    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
    border: '1px inset rgba(60, 60, 60, 0.5)',
  }

  return (
    <div className="flex flex-col min-h-screen w-full">
      <GlobalMainNav>
        <main className="flex flex-col pt-4 md:pt-2 px-2 gap-4 lg:px-4 lg:gap-6 min-h-[calc(100vh-4rem)] max-w-5xl mx-auto w-full relative">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="rounded-lg p-3" style={panelStyle}>
              <div className="text-xs text-white/60 mb-1">Reserve</div>
              <div className="text-sm sm:text-base font-bold text-white">
                {formatTokenDisplay((reserve as bigint) ?? 0n, TOKEN_DECIMALS)}
              </div>
            </div>
            <div className="rounded-lg p-3" style={panelStyle}>
              <div className="text-xs text-white/60 mb-1">Total plays</div>
              <div className="text-sm sm:text-base font-bold text-white">{totalPlays.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</div>
            </div>
            <div className="rounded-lg p-3" style={panelStyle}>
              <div className="text-xs text-white/60 mb-1">Wagered</div>
              <div className="text-sm sm:text-base font-bold text-white">
                {formatTokenDisplay((totalWagered as bigint) ?? 0n, TOKEN_DECIMALS)}
              </div>
            </div>
            <div className="rounded-lg p-3" style={panelStyle}>
              <div className="text-xs text-white/60 mb-1">Payouts</div>
              <div className="text-sm sm:text-base font-bold text-white">
                {formatTokenDisplay((totalPayouts as bigint) ?? 0n, TOKEN_DECIMALS)}
              </div>
            </div>
          </div>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <div className="order-1">
              <InstantBallDraw
                winningNumbers={resultToAnimate ? [...resultToAnimate.winningNumbers] : null}
                resultKey={getResultKey(resultToAnimate)}
                onComplete={onDrawComplete}
                compact
              />
            </div>
            <div className="order-2">
              <InstantLotteryPlayPanel onResult={onResult} onError={(err) => toast.error(err.message)} />
            </div>
          </section>

          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
            <div className="min-w-0">
              <LotteryTopPlayers />
            </div>
            <div className="min-w-0">
              <InstantLotteryHistory
                results={
                  lastPlayResult && results[0]?.transactionHash !== lastPlayResult.transactionHash
                    ? [lastPlayResult, ...results]
                    : results
                }
                limit={20}
                compact
              />
            </div>
            <div className="min-w-0">
              <GlobalLotteryHistoryTable limit={20} title="Recent games" />
            </div>
          </section>
        </main>

        {/* FAQ (includes contract addresses) */}
        <div className="w-full flex justify-center py-4">
          <GameFAQ
            game="lottery"
            addresses={[
              { label: 'Instant Lottery Contract', address: LOTTERY_INSTANT_ADDRESS as string },
              { label: 'MORBIUS Token', address: MORBIUS_TOKEN_ADDRESS },
            ]}
          />
        </div>

        <Footer />
      </GlobalMainNav>

      <InstantLotteryResultModal
        open={showResultModal}
        onOpenChange={setShowResultModal}
        result={latestResultForUser}
      />
    </div>
  )
}
