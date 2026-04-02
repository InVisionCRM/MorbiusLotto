'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useAccount, useBalance, useWaitForTransactionReceipt } from 'wagmi'
import { parseEther, formatUnits, decodeEventLog } from 'viem'
import { MORBIUS_TOKEN_ADDRESS, LOTTERY_INSTANT_ADDRESS } from '@/lib/contracts'
import { useContractReserve, useWagerLimits, usePlayLottery, usePlayLotteryWithPLS, useMaxPayoutForWager } from '@/hooks/use-instant-lottery'
import { useTokenApproval } from '@/hooks/use-token-approval'
import { useReadContract } from 'wagmi'
import { ERC20_ABI } from '@/abi/erc20'
import { INSTANT_LOTTERY_6OF55_ABI } from '@/abi/instant-lottery-6of55'
import { useNetworkValidation } from '@/hooks/use-network-validation'
import { useWplsPrice, calculateWplsAmount } from '@/hooks/use-wpls-price'
import { getApiUrlOptional } from '@/lib/api-urls'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Theme } from '@/lib/theme'
import { PaymentMethodToggle } from '@/components/shared/PaymentMethodToggle'
import { GameTransactionButton } from '@/components/shared/GameTransactionButton'

const USE_PROVABLY_FAIR_API =
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_INSTANT_LOTTERY_PROVABLY_FAIR === 'true'

const MIN_NUMBER = 1
const MAX_NUMBER = 55
const NUMBERS_PER_TICKET = 6
const ZERO = '0x0000000000000000000000000000000000000000'
const WAGER_PRESETS = [50, 100, 500, 1000] as const

// InstantLottery6of55.sol MULTIPLIERS_BPS: 0->0, 1->0.5x, 2->1.5x, 3->5x, 4->15x, 5->50x, 6->100x
const PAYOUT_ROWS: { matches: number; mult: string }[] = [
  { matches: 0, mult: '0×' },
  { matches: 1, mult: '0.5×' },
  { matches: 2, mult: '1.5×' },
  { matches: 3, mult: '5×' },
  { matches: 4, mult: '15×' },
  { matches: 5, mult: '50×' },
  { matches: 6, mult: '100×' },
]

function toBigIntSafe(value: unknown): bigint {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value))
  if (typeof value === 'string') {
    try {
      return BigInt(value)
    } catch {
      return 0n
    }
  }
  if (typeof value === 'boolean') return value ? 1n : 0n
  return 0n
}

function toNumberSafe(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  if (typeof value === 'boolean') return value ? 1 : 0
  return 0
}

type Ticket = [number, number, number, number, number, number]

export function InstantLotteryPlayPanel({
  onResult,
  onError,
}: {
  onResult?: (result: { playerNumbers: number[]; winningNumbers: number[]; matchCount: number; wager: bigint; netPayout: bigint; txHash?: string }) => void
  onError?: (err: Error) => void
}) {
  const { address } = useAccount()
  const [selected, setSelected] = useState<number[]>([])
  const [wagerInput, setWagerInput] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'MORBIUS' | 'PLS'>('MORBIUS')
  const [showPayoutModal, setShowPayoutModal] = useState(false)
  const { isOnPulseChain, switchToPulseChain } = useNetworkValidation()
  const { wplsPerMORBIUS, morbiusPerPLS, isLoading: isLoadingPlsPrice, error: plsPriceError, source: priceSource } = useWplsPrice()

  const { data: reserve = 0n } = useContractReserve()
  const { data: wagerLimits } = useWagerLimits()
  const minWager = wagerLimits?.[0] ?? parseEther('1')
  const maxWager = wagerLimits?.[1] ?? parseEther('1000')

  const wagerWei = (() => {
    try {
      const v = parseEther(wagerInput || '0')
      return v
    } catch {
      return 0n
    }
  })()
  const currentWagerNum = (() => {
    try {
      const n = Number(wagerInput || '0')
      return Number.isFinite(n) ? n : 0
    } catch {
      return 0
    }
  })()

  // When paying with PLS, wager is always in MORBIUS; we quote PLS required. Contract requires getAmountsOut(msg.value)[1] in [minWager, maxWager], so cap at PLS equivalent of maxWager.
  const plsRequiredWei = useMemo(() => {
    if (wagerWei < minWager || wagerWei > maxWager || !wplsPerMORBIUS) return 0n
    const withBuffer = calculateWplsAmount(wagerWei, wplsPerMORBIUS, 15) // 15% buffer for slippage
    const plsCap = (maxWager * wplsPerMORBIUS) / (10n ** 18n) // max PLS that still quotes <= maxWager
    return withBuffer <= plsCap ? withBuffer : plsCap
  }, [wagerWei, minWager, maxWager, wplsPerMORBIUS])

  const { data: plsBalance } = useBalance({ address: paymentMethod === 'PLS' ? address : undefined })

  const { data: maxPayout } = useMaxPayoutForWager(wagerWei > 0n ? wagerWei : undefined)
  const reserveOk = maxPayout != null ? reserve >= maxPayout : true
  // 6 matches = 100× wager; max wager that reserve can cover = reserve / 100
  const SIX_MATCH_MULTIPLIER = 100n
  const maxWagerForReserve = reserve > 0n ? reserve / SIX_MATCH_MULTIPLIER : 0n

  const { allowance, needsApproval, approve, isApproving, approveHash: approveTxHash, isLoadingAllowance, isApprovalSuccess, approvalError } = useTokenApproval({
    tokenAddress: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
    spenderAddress: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    requiredAmount: wagerWei,
    userAddress: address,
    enabled: (LOTTERY_INSTANT_ADDRESS as string) !== ZERO && paymentMethod === 'MORBIUS' && wagerWei > 0n,
    defaultToUnlimited: true, // Approve once, play many times; avoids Approve button reappearing after each play
  })

  const [approveClicked, setApproveClicked] = useState(false)
  const [playClicked, setPlayClicked] = useState(false)
  useEffect(() => {
    if (isApprovalSuccess || approvalError) setApproveClicked(false)
  }, [isApprovalSuccess, approvalError])

  useEffect(() => {
    if (isApprovalSuccess) toast.success('Approved! Click Play to continue.')
  }, [isApprovalSuccess])

  const { data: morbiusBalance } = useReadContract({
    address: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  })

  const { playLottery, data: playTxHashMorbius, isPending: isPendingMorbius, isError: isPlayError } = usePlayLottery()
  const { playLotteryWithPLS, data: playTxHashPLS, isPending: isPendingPLS, isError: isPlayPLSError } = usePlayLotteryWithPLS()

  const [apiPlaying, setApiPlaying] = useState(false)
  const apiUrl = getApiUrlOptional()
  const useApiPlay = USE_PROVABLY_FAIR_API && !!apiUrl && paymentMethod === 'MORBIUS'

  const playTxHash = playTxHashMorbius ?? playTxHashPLS
  const {
    data: playReceipt,
    isLoading: isPlayConfirming,
    isSuccess: isPlayConfirmed,
    isError: isPlayReceiptError,
  } = useWaitForTransactionReceipt({ hash: playTxHash })
  const lastResultForwardedTxRef = useRef<string | null>(null)

  useEffect(() => {
    if (isPlayConfirmed) {
      setPlayClicked(false)
      toast.success('Play confirmed!')
    }
  }, [isPlayConfirmed])
  useEffect(() => {
    if (isPlayError || isPlayPLSError) setPlayClicked(false)
  }, [isPlayError, isPlayPLSError])
  // Clear "Confirming" state when receipt is in (success or revert) so UI doesn't stay stuck
  useEffect(() => {
    if (playTxHash && !isPlayConfirming) setPlayClicked(false)
  }, [playTxHash, isPlayConfirming])
  useEffect(() => {
    if (isPlayReceiptError) toast.error('Transaction failed. Try again or use MORBIUS.')
  }, [isPlayReceiptError])

  useEffect(() => {
    if (!onResult || useApiPlay || !playTxHash || !playReceipt) return
    const txHash = playTxHash.toLowerCase()
    if (lastResultForwardedTxRef.current === txHash) return

    const lotteryAddress = (LOTTERY_INSTANT_ADDRESS as string).toLowerCase()
    for (const log of playReceipt.logs) {
      if (log.address.toLowerCase() !== lotteryAddress) continue
      try {
        const decoded = decodeEventLog({
          abi: INSTANT_LOTTERY_6OF55_ABI,
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName !== 'InstantLotteryResult') continue

        const args = decoded.args as Record<string, unknown>
        const playerNumbers = Array.isArray(args.playerNumbers) ? args.playerNumbers.map((n) => Number(n)) : []
        const winningNumbers = Array.isArray(args.winningNumbers) ? args.winningNumbers.map((n) => Number(n)) : []
        if (playerNumbers.length !== NUMBERS_PER_TICKET || winningNumbers.length !== NUMBERS_PER_TICKET) continue

        const matchCount = toNumberSafe(args.matchCount)
        const wager = toBigIntSafe(args.wager)
        const netPayout = toBigIntSafe(args.netPayout)

        onResult({
          playerNumbers,
          winningNumbers,
          matchCount,
          wager,
          netPayout,
          txHash: playTxHash,
        })
        lastResultForwardedTxRef.current = txHash
        break
      } catch {
        // Ignore unrelated logs in the receipt and continue scanning.
      }
    }
  }, [onResult, playReceipt, playTxHash, useApiPlay])

  const canPlayMorbius = address && selected.length === NUMBERS_PER_TICKET && wagerWei >= minWager && wagerWei <= maxWager && (morbiusBalance ?? 0n) >= wagerWei && reserveOk && (!needsApproval || allowance >= wagerWei)
  const canPlayPLS = address && selected.length === NUMBERS_PER_TICKET && paymentMethod === 'PLS' && wagerWei >= minWager && wagerWei <= maxWager && reserveOk && plsRequiredWei > 0n && (plsBalance?.value ?? 0n) >= plsRequiredWei

  const toggleNumber = useCallback((num: number) => {
    setSelected((prev) => {
      if (prev.includes(num)) return prev.filter((n) => n !== num)
      if (prev.length >= NUMBERS_PER_TICKET) return prev
      return [...prev, num].sort((a, b) => a - b)
    })
  }, [])

  const quickPick = useCallback(() => {
    const nums: number[] = []
    while (nums.length < NUMBERS_PER_TICKET) {
      const n = Math.floor(Math.random() * MAX_NUMBER) + MIN_NUMBER
      if (!nums.includes(n)) nums.push(n)
    }
    setSelected(nums.sort((a, b) => a - b))
  }, [])

  const handlePlayMorbius = useCallback(async () => {
    if (!address || selected.length !== NUMBERS_PER_TICKET || wagerWei < minWager || wagerWei > maxWager) return
    if (!isOnPulseChain) {
      try {
        await switchToPulseChain()
      } catch (e) {
        onError?.(e instanceof Error ? e : new Error('Switch to PulseChain'))
        return
      }
    }
    if (needsApproval) {
      setApproveClicked(true)
      approve()
      return
    }
    const ticket: Ticket = [selected[0], selected[1], selected[2], selected[3], selected[4], selected[5]]

    if (useApiPlay) {
      setApiPlaying(true)
      try {
        const res = await fetch(`${apiUrl}/api/lottery/instant/play`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address,
            numbers: ticket,
            wager: wagerWei.toString(),
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          onError?.(new Error(data?.error ?? `Play failed (${res.status})`))
          return
        }
        onResult?.({
          playerNumbers: ticket,
          winningNumbers: data.winningNumbers ?? [],
          matchCount: data.matchCount ?? 0,
          wager: wagerWei,
          netPayout: BigInt(data.netPayout ?? 0),
          txHash: data.txHash,
        })
      } catch (e) {
        onError?.(e instanceof Error ? e : new Error('Play failed'))
      } finally {
        setApiPlaying(false)
      }
      return
    }

    setPlayClicked(true)
    playLottery(ticket, wagerWei)
  }, [address, selected, wagerWei, minWager, maxWager, isOnPulseChain, switchToPulseChain, needsApproval, approve, playLottery, useApiPlay, apiUrl, onResult, onError])

  const handlePlayPLS = useCallback(async () => {
    if (!address || selected.length !== NUMBERS_PER_TICKET || wagerWei < minWager || wagerWei > maxWager) return
    if (plsRequiredWei <= 0n) {
      onError?.(new Error('Unable to quote PLS. Try MORBIUS or refresh.'))
      return
    }
    if (!isOnPulseChain) {
      try {
        await switchToPulseChain()
      } catch (e) {
        onError?.(e instanceof Error ? e : new Error('Switch to PulseChain'))
        return
      }
    }
    const ticket: Ticket = [selected[0], selected[1], selected[2], selected[3], selected[4], selected[5]]
    setPlayClicked(true)
    playLotteryWithPLS(ticket, plsRequiredWei)
  }, [address, selected, wagerWei, minWager, maxWager, plsRequiredWei, isOnPulseChain, switchToPulseChain, playLotteryWithPLS, onError])

  const isPending = isPendingMorbius || isPendingPLS
  const buttonBusy = approveClicked || playClicked || isPending || isPlayConfirming || apiPlaying

  return (
    <div className="surface-panel mx-auto w-full max-w-2xl overflow-hidden rounded-2xl">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h3 className="text-white text-base sm:text-lg uppercase tracking-wider" style={{ fontFamily: "'Russo One', sans-serif" }}>
            Pick your numbers
          </h3>
          <div className="flex items-center gap-2 shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={quickPick} className="border-cyan-500/60 bg-cyan-600 text-white hover:bg-cyan-500 hover:text-white shrink-0">
              Quick Pick
            </Button>
            <span className="text-cyan-300/90 text-sm tabular-nums">
              {selected.length}/{NUMBERS_PER_TICKET}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-6 xs:grid-cols-7 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-11 gap-0.5">
          {Array.from({ length: MAX_NUMBER }, (_, i) => i + MIN_NUMBER).map((num) => {
            const isSelected = selected.includes(num)
            return (
              <button
                key={num}
                type="button"
                onClick={() => toggleNumber(num)}
                disabled={!isSelected && selected.length >= NUMBERS_PER_TICKET}
                className={cn(
                  'h-8 rounded text-xs font-semibold transition-all',
                  isSelected ? 'bg-white text-black scale-105' : 'text-white/90 hover:bg-white/10'
                )}
                style={!isSelected ? { background: 'rgba(20,20,20,0.9)', border: '1px solid rgba(60,60,60,0.5)' } : undefined}
              >
                {num}
              </button>
            )
          })}
        </div>

        <div className="space-y-3">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center justify-center gap-3 w-full">
              <label className="text-white text-lg sm:text-xl font-semibold uppercase tracking-wider" style={{ fontFamily: 'var(--font-mitr), sans-serif' }}>
                Wager
              </label>
              <span className="text-white/40">·</span>
              <button
                type="button"
                onClick={() => setShowPayoutModal(true)}
                className={cn('text-lg sm:text-xl font-semibold uppercase tracking-wider underline-offset-2 hover:underline', Theme.cyan.text.primary)}
                style={{ fontFamily: 'var(--font-mitr), sans-serif' }}
              >
                Payouts
              </button>
            </div>
            <div className="flex flex-wrap justify-center gap-2 items-center">
              {WAGER_PRESETS.map((preset) => {
                const label = preset >= 1000 ? `${preset / 1000}k` : String(preset)
                const isSelected = currentWagerNum === preset
                return (
                  <Button
                    key={preset}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setWagerInput(String(preset))}
                    className={cn(
                      'tabular-nums border-white/30 bg-white/5 text-white hover:bg-white/15 hover:text-white',
                      isSelected && 'border-cyan-400/60 bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40'
                    )}
                  >
                    {label}
                  </Button>
                )
              })}
              <input
                type="text"
                inputMode="decimal"
                placeholder="Custom"
                value={wagerInput}
                onChange={(e) => setWagerInput(e.target.value)}
                className="w-20 px-2 py-1.5 rounded-md text-sm font-bold tabular-nums bg-white/5 border border-white/20 text-white placeholder:text-white/40 focus:border-cyan-500/50 focus:outline-none"
              />
            </div>
          </div>
          <PaymentMethodToggle value={paymentMethod} onChange={setPaymentMethod} />

          {/* PLS price / conversion (same pattern as Plinko) */}
          {paymentMethod === 'PLS' && isLoadingPlsPrice && (
            <div className="text-center -mt-1 mb-1">
              <span className="text-white/40 text-[10px]">Loading PLS rate…</span>
            </div>
          )}
          {paymentMethod === 'PLS' && !plsPriceError && !isLoadingPlsPrice && morbiusPerPLS != null && (
            <div className="text-center -mt-1 mb-1">
              <span className="text-white/40 text-[10px]">
                1 PLS = {morbiusPerPLS >= 1 ? morbiusPerPLS.toFixed(2) : morbiusPerPLS.toFixed(6)} MORBIUS
                {' '}
                <span className="text-white/25">
                  (via {priceSource === 'pulsex' ? 'PulseX' : 'DexScreener'})
                </span>
                {currentWagerNum > 0 && plsRequiredWei > 0n && (
                  <>
                    {' · '}
                    <span className="text-white/50">
                      {currentWagerNum} MORBIUS ≈ {Number(formatUnits(plsRequiredWei, 18)).toFixed(4)} PLS
                    </span>
                  </>
                )}
              </span>
            </div>
          )}
          {paymentMethod === 'PLS' && plsPriceError && (
            <div className="rounded-lg p-2 mb-1" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
              <span className="text-red-300 text-xs">⚠️ Unable to fetch PLS price. Please try MORBIUS instead.</span>
            </div>
          )}
        </div>

        {!reserveOk && (
          <p className="text-amber-400 text-sm">
            Reserve ({formatUnits(reserve, 18)} MORBIUS) is too low for this wager. Max payout for 6 matches is 100×. With current reserve, max wager is {formatUnits(maxWagerForReserve, 18)} MORBIUS.
          </p>
        )}

        <div className="flex flex-col gap-2 w-full">
          {paymentMethod === 'MORBIUS' && (
            <>
              {needsApproval ? (
                <GameTransactionButton
                  type="button"
                  disabled={!address || approveClicked || isApproving || wagerWei <= 0n}
                  onClick={() => {
                    setApproveClicked(true)
                    approve()
                  }}
                  isLoading={approveClicked || isApproving}
                  variant="approve"
                >
                  {(approveClicked || isApproving) ? (approveTxHash ? 'Confirming…' : 'Confirm in wallet…') : 'Approve MORBIUS'}
                </GameTransactionButton>
              ) : null}
              <GameTransactionButton
                type="button"
                disabled={!canPlayMorbius || buttonBusy}
                onClick={handlePlayMorbius}
                isLoading={isPending || isPlayConfirming || apiPlaying}
              >
                {apiPlaying ? 'Playing…' : isPending ? 'Confirm in wallet…' : isPlayConfirming ? 'Confirming…' : isPlayConfirmed ? 'Success!' : (
                  <>
                    Play <img src="/morbius/OfficialMorbiusLogo.png" alt="MORBIUS" className="h-9 w-auto object-contain inline-block align-middle" />
                  </>
                )}
              </GameTransactionButton>
            </>
          )}
          {paymentMethod === 'PLS' && (
            <GameTransactionButton
              type="button"
              disabled={!canPlayPLS || buttonBusy}
              onClick={handlePlayPLS}
              isLoading={isPending || isPlayConfirming}
            >
              {isPending ? 'Confirm in wallet…' : isPlayConfirming ? 'Confirming…' : isPlayConfirmed ? 'Success!' : (
                <>
                  Play <img src="/Pulse Branding/Logo/ball.png" alt="PLS" className="h-9 w-auto object-contain inline-block align-middle" />
                </>
              )}
            </GameTransactionButton>
          )}
        </div>
      </div>

      {showPayoutModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: Theme.modal.overlay }}
          onClick={() => setShowPayoutModal(false)}
        >
          <div
            className={cn('rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden', Theme.modal.container)}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={cn('px-4 py-3 text-white font-semibold', Theme.modal.header)}>
              Payout structure
            </div>
            <div className="p-4 space-y-1">
              <p className="text-white/70 text-sm mb-3">Matches = multiplier on wager (InstantLottery6of55).</p>
              <div className="rounded-lg overflow-hidden" style={Theme.panel.base}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-2 px-3 text-white/70 font-medium">Matches</th>
                      <th className="text-right py-2 px-3 text-white/70 font-medium">Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PAYOUT_ROWS.map(({ matches, mult }) => (
                      <tr key={matches} className="border-b border-white/5 last:border-0">
                        <td className="py-2 px-3 text-white">{matches}</td>
                        <td className="py-2 px-3 text-right font-semibold text-cyan-300">{mult}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="p-4 pt-0">
              <Button
                type="button"
                variant="outline"
                className={cn('w-full', Theme.cyan.border.primary)}
                onClick={() => setShowPayoutModal(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
