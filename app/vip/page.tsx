'use client'

import { useMemo } from 'react'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { Crown, Gift, Sparkles, TrendingUp, Loader2 } from 'lucide-react'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { DottedGlowBackground } from '@/components/ui/dotted-glow-background'
import { useVipStatus, type VipTier } from '@/hooks/use-vip-status'

/** Whole-chip decimal string → grouped display (chips are 1:1 MORBIUS). */
function fmtChips(v: string | number | undefined): string {
  if (v == null) return '0'
  try {
    return BigInt(typeof v === 'number' ? Math.trunc(v) : v).toLocaleString('en-US')
  } catch {
    return String(v)
  }
}

function TierBadge({ tier, size = 'md' }: { tier: VipTier; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'h-14 w-14 text-2xl' : size === 'sm' ? 'h-7 w-7 text-xs' : 'h-10 w-10 text-base'
  return (
    <div
      className={`${dim} flex items-center justify-center rounded-full font-bold shadow-lg`}
      style={{ background: `${tier.color}22`, color: tier.color, border: `2px solid ${tier.color}` }}
      title={tier.tierName}
    >
      <Crown className={size === 'lg' ? 'h-7 w-7' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5'} />
    </div>
  )
}

export default function VipPage() {
  const { address, isConnected } = useAccount()
  const { tiers, status, loading, claiming, claim } = useVipStatus(address)

  const claimable = useMemo(() => {
    if (!status) return 0n
    try {
      return BigInt(status.claimableRakebackChips) + BigInt(status.pendingTierBonusChips)
    } catch {
      return 0n
    }
  }, [status])

  async function handleClaim() {
    const result = await claim()
    if (result) {
      toast.success(
        `Claimed ${fmtChips(result.totalCredited)} MORBIUS` +
          (BigInt(result.bonusCredited) > 0n ? ` (incl. tier bonus)` : ''),
      )
    } else {
      toast.error('Nothing to claim right now.')
    }
  }

  return (
    <GlobalMainNav>
      <div className="relative min-h-screen w-full overflow-hidden">
        <DottedGlowBackground className="absolute inset-0 -z-10" />

        <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
          {/* Header */}
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-400/10 ring-1 ring-yellow-400/30">
              <Crown className="h-7 w-7 text-yellow-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">VIP Club</h1>
              <p className="text-sm text-white/60">
                Earn rakeback and tier bonuses on every wager — paid in MORBIUS chips.
              </p>
            </div>
          </div>

          {/* Personal status */}
          {!isConnected ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-white/70">
              Connect your wallet to see your VIP tier, rakeback and rewards.
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-12">
              <Loader2 className="h-6 w-6 animate-spin text-white/60" />
            </div>
          ) : status ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Tier + progress */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:col-span-2">
                <div className="flex items-center gap-4">
                  <TierBadge tier={status.currentTier} size="lg" />
                  <div className="flex-1">
                    <div className="text-lg font-bold text-white">{status.currentTier.tierName}</div>
                    <div className="text-xs text-white/50">
                      {(status.currentTier.rakebackBps / 100).toFixed(2)}% rakeback on wagers
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-1 flex justify-between text-xs text-white/60">
                    <span>{fmtChips(status.lifetimeWagerChips)} wagered</span>
                    {status.nextTier ? (
                      <span>
                        {fmtChips(status.wagerToNextChips)} to {status.nextTier.tierName}
                      </span>
                    ) : (
                      <span>Max tier reached</span>
                    )}
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${status.progressPct}%`,
                        background: status.nextTier?.color ?? status.currentTier.color,
                      }}
                    />
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-white/50">
                      <TrendingUp className="h-3.5 w-3.5" /> 7-day volume
                    </div>
                    <div className="mt-0.5 font-semibold text-white">{fmtChips(status.wager7dChips)}</div>
                  </div>
                  <div className="rounded-lg bg-white/5 p-3">
                    <div className="flex items-center gap-1.5 text-xs text-white/50">
                      <TrendingUp className="h-3.5 w-3.5" /> 30-day volume
                    </div>
                    <div className="mt-0.5 font-semibold text-white">{fmtChips(status.wager30dChips)}</div>
                  </div>
                </div>
              </div>

              {/* Claim card */}
              <div className="flex flex-col rounded-2xl border border-yellow-400/20 bg-yellow-400/5 p-5">
                <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-yellow-300/80">
                  <Gift className="h-3.5 w-3.5" /> Available to claim
                </div>
                <div className="mt-2 text-3xl font-bold text-white">{fmtChips(claimable.toString())}</div>
                <div className="text-xs text-white/50">MORBIUS</div>

                <div className="mt-3 space-y-1 text-xs text-white/60">
                  <div className="flex justify-between">
                    <span>Rakeback</span>
                    <span className="text-white/80">{fmtChips(status.claimableRakebackChips)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tier bonus</span>
                    <span className="text-white/80">{fmtChips(status.pendingTierBonusChips)}</span>
                  </div>
                </div>

                <button
                  onClick={handleClaim}
                  disabled={claiming || claimable <= 0n}
                  className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-yellow-400 py-2.5 font-semibold text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {claiming ? 'Claiming…' : 'Claim rewards'}
                </button>

                <div className="mt-3 text-[11px] leading-snug text-white/40">
                  Lifetime claimed: {fmtChips(status.lifetimeRakebackChips)} rakeback ·{' '}
                  {fmtChips(status.lifetimeBonusChips)} bonus
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-white/70">
              Sign in with your wallet to view your VIP status.
            </div>
          )}

          {/* Tier ladder */}
          <h2 className="mb-3 mt-10 text-lg font-bold text-white">Tier ladder</h2>
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3">Wager required</th>
                  <th className="px-4 py-3">Rakeback</th>
                  <th className="px-4 py-3">Level-up bonus</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((t) => {
                  const isCurrent = status?.currentTier.tierLevel === t.tierLevel
                  return (
                    <tr
                      key={t.tierLevel}
                      className={`border-b border-white/5 last:border-0 ${isCurrent ? 'bg-yellow-400/5' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <TierBadge tier={t} size="sm" />
                          <span className="font-medium text-white">{t.tierName}</span>
                          {isCurrent && (
                            <span className="rounded-full bg-yellow-400/20 px-2 py-0.5 text-[10px] font-semibold text-yellow-300">
                              YOU
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-white/70">{fmtChips(t.minLifetimeWagerChips)}</td>
                      <td className="px-4 py-3 text-white/70">{(t.rakebackBps / 100).toFixed(2)}%</td>
                      <td className="px-4 py-3 text-white/70">{fmtChips(t.levelUpBonusChips)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-white/40">
            Wager volume is tracked across all house games. Rakeback accrues on every bet you place after
            joining the VIP Club and is paid in MORBIUS chips when you claim. Reaching a new tier grants a
            one-time level-up bonus. All amounts shown in whole MORBIUS.
          </p>
        </div>
      </div>
    </GlobalMainNav>
  )
}
