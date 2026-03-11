'use client'

import { useAccount, useReadContract } from 'wagmi'
import { motion } from 'framer-motion'
import { Gift, CheckCircle2, Loader2, RefreshCw, AlertCircle, Clock } from 'lucide-react'
import { useMerkleClaims } from '@/hooks/use-merkle-claims'
import type { ClaimableEpoch } from '@/hooks/use-merkle-claims'
import { MERKLE_CLAIM_MORBIUS_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'
import { ERC20_ABI } from '@/abi/erc20'
import { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function fmtMorbius(raw: string): string {
  const n = Number(raw) / 1e18
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

function fmtMorbiusWei(wei: bigint): string {
  const n = Number(wei) / 1e18
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

/** Returns a live hh:mm:ss countdown string. For repeating countdowns, loops automatically. */
function useCountdown(targetDate: Date | null, repeatSeconds?: number): string {
  const [display, setDisplay] = useState('')

  useEffect(() => {
    if (!targetDate) { setDisplay(''); return }

    const tick = () => {
      let diff = targetDate.getTime() - Date.now()
      // If the countdown expired and we have a repeat interval, compute the next cycle
      if (diff <= 0 && repeatSeconds && repeatSeconds > 0) {
        const elapsed = -diff
        const remainder = repeatSeconds * 1000 - (elapsed % (repeatSeconds * 1000))
        diff = remainder === repeatSeconds * 1000 ? 0 : remainder
      }
      if (diff <= 0) { setDisplay('00:00:00'); return }
      const h = Math.floor(diff / 3_600_000)
      const m = Math.floor((diff % 3_600_000) / 60_000)
      const s = Math.floor((diff % 60_000) / 1_000)
      setDisplay(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetDate, repeatSeconds])

  return display
}

// ── Drop info bar (countdown + contract balance) ─────────────────────────────

function DropInfoBar() {
  const [nextDrop, setNextDrop] = useState<Date | null>(null)
  const [scheduleType, setScheduleType] = useState<string>('manual')
  const [countdownDuration, setCountdownDuration] = useState(0)
  const countdown = useCountdown(nextDrop, countdownDuration || undefined)

  // Fetch schedule from public endpoint
  useEffect(() => {
    fetch('/api/merkle/schedule')
      .then((r) => r.json())
      .then((d) => {
        setScheduleType(d.schedule_type ?? 'manual')
        setCountdownDuration(d.countdown_duration ?? 0)
        if (d.countdown_duration && d.countdown_duration > 0) {
          // Custom repeating countdown — start from now + duration
          setNextDrop(new Date(Date.now() + d.countdown_duration * 1000))
        } else {
          setNextDrop(d.next_drop_at ? new Date(d.next_drop_at) : null)
        }
      })
      .catch(() => {})
  }, [])

  // Read MORBIUS balance held by the contract
  const { data: contractBalance } = useReadContract({
    address: MORBIUS_TOKEN_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [MERKLE_CLAIM_MORBIUS_ADDRESS as `0x${string}`],
    query: { enabled: Boolean(MERKLE_CLAIM_MORBIUS_ADDRESS) },
  })
  const balanceWei = (contractBalance as bigint | undefined) ?? 0n

  if (scheduleType === 'manual' && balanceWei === 0n) return null

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap rounded-2xl border border-emerald-500/10 bg-emerald-950/10 px-4 py-3">
      {/* Contract balance */}
      {balanceWei > 0n && (
        <div className="flex items-center gap-2">
          <Gift className="w-3.5 h-3.5 text-emerald-400/60 shrink-0" />
          <div>
            <p className="text-[9px] uppercase tracking-wider text-white/25 font-poppins">Reward Pool</p>
            <p className="text-sm font-bold text-emerald-400 font-poppins">
              {fmtMorbiusWei(balanceWei)}
              <span className="text-[10px] text-white/30 font-normal ml-1">MORBIUS</span>
            </p>
          </div>
        </div>
      )}

      {/* Countdown */}
      {nextDrop && countdown && (
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-emerald-400/60 shrink-0" />
          <div>
            <p className="text-[9px] uppercase tracking-wider text-white/25 font-poppins">Next Drop In</p>
            <p className="text-sm font-bold text-white font-poppins tabular-nums">{countdown}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main panel ───────────────────────────────────────────────────────────────

export function MerkleClaimsPanel() {
  const { isConnected } = useAccount()
  const {
    claimableEpochs,
    totalClaimable,
    isLoading,
    error,
    claim,
    isClaiming,
    claimConfirmed,
    refetch,
  } = useMerkleClaims()

  const contractDeployed = Boolean(MERKLE_CLAIM_MORBIUS_ADDRESS)

  // ── Not connected ───────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <motion.div
        key="claims-disconnected"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="space-y-3"
      >
        <DropInfoBar />
        <div className="relative rounded-2xl border border-emerald-500/20 bg-[#050f0a]/90 backdrop-blur-sm p-8 text-center space-y-3">
          <Gift className="w-10 h-10 text-emerald-400/60 mx-auto" />
          <p className="text-white/50 font-poppins text-sm">Connect your wallet to see your holder rewards</p>
        </div>
      </motion.div>
    )
  }

  // ── Contract not deployed yet ────────────────────────────────────────
  if (!contractDeployed) {
    return (
      <motion.div
        key="claims-not-deployed"
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="relative rounded-2xl border border-emerald-500/20 bg-[#050f0a]/90 backdrop-blur-sm p-8 text-center space-y-3"
      >
        <AlertCircle className="w-10 h-10 text-yellow-400/60 mx-auto" />
        <p className="text-white/50 font-poppins text-sm">Holder Rewards are coming soon.</p>
        <p className="text-white/30 font-poppins text-xs">The first reward drop will be announced shortly.</p>
      </motion.div>
    )
  }

  // ── Loading ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-950/10 p-6 text-center">
        <p className="text-red-400 text-sm font-poppins">{error}</p>
      </div>
    )
  }

  // Find the latest claimable (non-superseded, non-claimed) epoch for the claim action
  const latestClaimable = claimableEpochs.find((e) => !e.claimed && e.supersededByEpochNumber === null)
  const allClaimed = claimConfirmed || (claimableEpochs.length > 0 && !latestClaimable)

  return (
    <motion.div
      key="claims"
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-3"
    >
      {/* ── Drop countdown + pool size ────────────────────────────── */}
      <DropInfoBar />

      {/* ── Rewards Card ─────────────────────────────────────────── */}
      <div className="relative rounded-2xl border border-emerald-500/20 bg-[#050f0a]/90 backdrop-blur-sm p-6 overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/5 to-transparent pointer-events-none"
          animate={{ x: ['-100%', '200%'] }}
          transition={{ repeat: Infinity, duration: 5, ease: 'linear' }}
        />
        <div className="relative flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Gift className="w-6 h-6 text-emerald-400" />
          </div>
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-white/30 font-poppins mb-1">Your Rewards</p>
            <p className="text-3xl font-bold text-white font-poppins">
              {fmtMorbius(totalClaimable.toString())}
              <span className="text-sm text-white/30 font-normal ml-1.5">MORBIUS</span>
            </p>
          </div>

          {/* Claim / Claimed / No rewards */}
          {claimableEpochs.length === 0 ? (
            <div className="text-center space-y-1 mt-1">
              <p className="text-white/40 font-poppins text-sm">No rewards available yet.</p>
              <p className="text-white/20 font-poppins text-xs">
                Hold MORBIUS — 2.5% of all game withdrawals are distributed to holders.
              </p>
            </div>
          ) : allClaimed ? (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4 text-emerald-400/70" />
              <span className="text-emerald-400/70 text-sm font-poppins font-semibold">All rewards claimed</span>
            </div>
          ) : latestClaimable ? (
            <button
              onClick={() => claim(latestClaimable.epoch.epoch_number, latestClaimable.amount, latestClaimable.proof)}
              disabled={isClaiming}
              className="px-8 py-3 rounded-xl font-semibold text-white text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-lg shadow-emerald-900/30 font-poppins flex items-center gap-2"
            >
              {isClaiming ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Claiming…</>
              ) : 'Claim Rewards'}
            </button>
          ) : null}

          {/* Refresh */}
          <button
            onClick={refetch}
            className="p-2 rounded-lg border border-emerald-500/10 text-emerald-400/40 hover:text-emerald-300 hover:bg-emerald-950/30 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Claim processing note ───────────────────────────────────── */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-950/10 px-4 py-2.5 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-400/80 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-200/90 font-poppins leading-relaxed">
          Claims take longer than usual to process. If your claim fails, try increasing the gas or send the failed tx hash to{' '}
          <a href="https://t.me/KyleCruise" target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 underline font-medium">
            @KyleCruise on Telegram
          </a>
          .
        </p>
      </div>

      {/* ── How it works footer ───────────────────────────────────── */}
      <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider text-white/20 font-poppins font-semibold">How it works</p>
        <p className="text-[11px] text-white/35 font-poppins leading-relaxed">
          <span className="text-white/50">1.25% of all wagers or withdraws</span> on MORBlotto is set aside for MORBIUS holders. Rewards are distributed proportionally — the more MORBIUS you hold, the larger your share. No staking or locking required.
        </p>
        <p className="text-[11px] text-white/25 font-poppins">
          Unclaimed rewards carry forward automatically — miss a drop and your share rolls into the next one so you never lose out.
        </p>
        <p className="text-[11px] text-white/20 font-poppins">
          Minimum holding: 1,000 MORBIUS · Snapshots taken at each reward drop.
        </p>
      </div>

      {/* ── Reward history table ───────────────────────────────────── */}
      {claimableEpochs.length > 0 && (() => {
        const PENDING_DAYS = 7
        const pendingCutoff = Date.now() - PENDING_DAYS * 24 * 60 * 60 * 1000
        return (
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-white/20 font-poppins font-semibold">Reward history</p>
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-white/40 font-poppins text-xs">Date & time</TableHead>
                  <TableHead className="text-white/40 font-poppins text-xs">Epoch</TableHead>
                  <TableHead className="text-white/40 font-poppins text-xs text-right">Added</TableHead>
                  <TableHead className="text-white/40 font-poppins text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...claimableEpochs]
                  .sort((a, b) => b.epoch.epoch_number - a.epoch.epoch_number)
                  .map((row: ClaimableEpoch) => {
                    const droppedAt = row.epoch.published_at ? new Date(row.epoch.published_at).getTime() : 0
                    const isOldPending = !row.claimed && row.supersededByEpochNumber === null && droppedAt > 0 && droppedAt < pendingCutoff
                    return (
                      <TableRow key={row.epoch.id} className="border-white/10 text-white/70">
                        <TableCell className="font-poppins text-xs">
                          {row.epoch.published_at
                            ? new Date(row.epoch.published_at).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })
                            : '—'}
                        </TableCell>
                        <TableCell className="font-poppins text-xs text-white/60">{row.epoch.epoch_number}</TableCell>
                        <TableCell className="font-poppins text-xs text-right text-white/80">
                          + {fmtMorbius(row.amount)} MORBIUS
                        </TableCell>
                        <TableCell className="font-poppins text-xs">
                          {row.claimed ? (
                            <span className="text-emerald-400/90 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Claimed
                            </span>
                          ) : row.supersededByEpochNumber !== null ? (
                            <span className="text-white/40">Rolled into later drop</span>
                          ) : isOldPending ? (
                            <span className="text-white/50">Unclaimed</span>
                          ) : (
                            <span className="text-amber-400/80">Pending</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          </div>
        )
      })()}
    </motion.div>
  )
}
