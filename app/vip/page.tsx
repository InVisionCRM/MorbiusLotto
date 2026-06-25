'use client'

import { useMemo } from 'react'
import { useAccount } from 'wagmi'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Crown, Gift, Sparkles, Loader2, Coins, CalendarDays, Wallet, Percent } from 'lucide-react'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { useSiwe } from '@/contexts/siwe-context'
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

/** Compact form (1.2K / 3.4M) for dense spots like the tier ladder. */
function fmtCompact(v: string | number | undefined): string {
  if (v == null) return '0'
  let n: number
  try {
    n = Number(BigInt(typeof v === 'number' ? Math.trunc(v) : v))
  } catch {
    return String(v)
  }
  if (n < 1000) return n.toLocaleString('en-US')
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

function TierMedallion({ tier, size = 'md' }: { tier: VipTier; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-16 w-16' : size === 'sm' ? 'h-9 w-9' : 'h-11 w-11'
  const icon = size === 'lg' ? 'h-8 w-8' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  return (
    <div
      className={`${box} relative flex items-center justify-center rounded-2xl`}
      style={{
        background: `linear-gradient(145deg, ${tier.color}33, ${tier.color}0a)`,
        boxShadow: `inset 0 0 0 1.5px ${tier.color}80, 0 8px 24px -8px ${tier.color}80`,
      }}
      title={tier.tierName}
    >
      <Crown className={icon} style={{ color: tier.color }} />
    </div>
  )
}

function StatChip({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/40">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums" style={{ color: accent ?? '#fff' }}>
        {value}
      </div>
    </div>
  )
}

export default function VipPage() {
  const { address, isConnected } = useAccount()
  const { signIn } = useSiwe()
  const { tiers, status, loading, claiming, error, authRequired, claim, refresh } = useVipStatus(address)

  const claimable = useMemo(() => {
    if (!status) return 0n
    try {
      return BigInt(status.claimableRakebackChips) + BigInt(status.pendingTierBonusChips)
    } catch {
      return 0n
    }
  }, [status])

  const lifetimeEarned = useMemo(() => {
    if (!status) return '0'
    try {
      return (BigInt(status.lifetimeRakebackChips) + BigInt(status.lifetimeBonusChips)).toString()
    } catch {
      return '0'
    }
  }, [status])

  const accent = status?.currentTier.color ?? '#f5c542'

  async function handleClaim() {
    const result = await claim()
    if (result && BigInt(result.totalCredited) > 0n) {
      toast.success(
        `Claimed ${fmtChips(result.totalCredited)} MORBIUS` +
          (BigInt(result.bonusCredited) > 0n ? ' — tier bonus included!' : ''),
      )
    } else {
      toast.error('Nothing to claim yet — keep playing to earn rakeback.')
    }
  }

  return (
    <GlobalMainNav>
      <div className="relative min-h-screen w-full overflow-hidden">
        {/* ── Background: midnight aurora (deep gradient + soft orbs + grid + vignette) ── */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[#070a12]" />
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage:
              'radial-gradient(70% 50% at 50% -8%, rgba(245,197,66,0.12), transparent 60%),' +
              'radial-gradient(45% 45% at 12% 18%, rgba(124,92,255,0.14), transparent 60%),' +
              `radial-gradient(50% 45% at 88% 80%, ${accent}26, transparent 62%)`,
          }}
        />
        {/* faint grid */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)',
          }}
        />
        {/* slow-drifting accent orbs */}
        <div
          className="pointer-events-none absolute -left-24 top-32 -z-10 h-80 w-80 animate-pulse rounded-full blur-[120px]"
          style={{ background: 'rgba(245,197,66,0.10)', animationDuration: '7s' }}
        />
        <div
          className="pointer-events-none absolute -right-20 bottom-10 -z-10 h-80 w-80 animate-pulse rounded-full blur-[120px]"
          style={{ background: `${accent}1f`, animationDuration: '9s' }}
        />
        {/* bottom vignette */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,transparent_55%,rgba(0,0,0,0.55))]" />

        <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
          {/* Header */}
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-yellow-400/10 ring-1 ring-yellow-400/30">
              <Crown className="h-6 w-6 text-yellow-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white sm:text-3xl">VIP Club</h1>
              <p className="text-sm text-white/55">Wager, level up, and claim rakeback in MORBIUS.</p>
            </div>
          </div>

          {!isConnected ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/60">
              Connect your wallet to see your VIP tier and rewards.
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-16">
              <Loader2 className="h-6 w-6 animate-spin text-white/50" />
            </div>
          ) : !status ? (
            authRequired ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
                <p className="text-white/60">Sign in with your wallet to view your VIP status.</p>
                <button
                  onClick={() => {
                    void signIn().then(refresh).catch(() => undefined)
                  }}
                  className="rounded-xl bg-cyan-500 px-5 py-2.5 font-semibold text-slate-950 transition hover:bg-cyan-400"
                >
                  Sign in
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-10 text-center">
                <p className="font-medium text-white/80">VIP rewards aren’t available right now.</p>
                <p className="max-w-md text-xs text-white/45">
                  The rewards service didn’t respond. This usually means it’s still being set up — please
                  check back shortly.
                </p>
                {error && <p className="text-[11px] text-white/30">{error}</p>}
                <button
                  onClick={() => void refresh()}
                  className="mt-1 rounded-xl border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:bg-white/5"
                >
                  Try again
                </button>
              </div>
            )
          ) : (
            <>
              {/* HERO — tier identity + progress + claim, all in one panel */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="relative overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-7"
                style={{
                  background: `radial-gradient(120% 140% at 0% 0%, ${accent}1f, rgba(255,255,255,0.02) 55%)`,
                }}
              >
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  {/* Left: identity + progress */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-4">
                      <TierMedallion tier={status.currentTier} size="lg" />
                      <div>
                        <div className="text-[11px] uppercase tracking-widest text-white/40">Your tier</div>
                        <div className="text-2xl font-extrabold text-white sm:text-3xl">
                          {status.currentTier.tierName}
                        </div>
                        <div
                          className="mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold"
                          style={{ background: `${accent}22`, color: accent }}
                        >
                          <Percent className="h-3 w-3" />
                          {(status.currentTier.rakebackBps / 100).toFixed(2)}% rakeback
                        </div>
                      </div>
                    </div>

                    <div className="mt-6">
                      <div className="mb-1.5 flex items-end justify-between text-xs">
                        <span className="text-white/70">
                          <span className="font-semibold text-white">{fmtChips(status.lifetimeWagerChips)}</span>{' '}
                          wagered
                        </span>
                        {status.nextTier ? (
                          <span className="text-white/50">
                            {fmtChips(status.wagerToNextChips)} to{' '}
                            <span style={{ color: status.nextTier.color }}>{status.nextTier.tierName}</span>
                          </span>
                        ) : (
                          <span style={{ color: accent }}>Top tier reached 👑</span>
                        )}
                      </div>
                      <div className="h-3 w-full overflow-hidden rounded-full bg-black/40 ring-1 ring-white/10">
                        <motion.div
                          className="h-full rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${status.progressPct}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          style={{
                            background: `linear-gradient(90deg, ${accent}, ${status.nextTier?.color ?? accent})`,
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Right: claim */}
                  <div className="shrink-0 rounded-2xl border border-white/10 bg-black/30 p-5 lg:w-64">
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/50">
                      <Gift className="h-3.5 w-3.5" /> Available to claim
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold tabular-nums text-white">
                        {fmtChips(claimable.toString())}
                      </span>
                      <span className="text-xs text-white/40">MORBIUS</span>
                    </div>
                    <div className="mt-2 flex gap-1.5 text-[11px]">
                      <span className="rounded-md bg-white/5 px-2 py-1 text-white/60">
                        Rakeback {fmtCompact(status.claimableRakebackChips)}
                      </span>
                      {BigInt(status.pendingTierBonusChips) > 0n && (
                        <span
                          className="rounded-md px-2 py-1 font-medium"
                          style={{ background: `${accent}22`, color: accent }}
                        >
                          +Bonus {fmtCompact(status.pendingTierBonusChips)}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={handleClaim}
                      disabled={claiming || claimable <= 0n}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 font-semibold text-black transition disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ background: claimable > 0n ? accent : '#6b7280' }}
                    >
                      {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {claiming ? 'Claiming…' : 'Claim'}
                    </button>
                  </div>
                </div>
              </motion.div>

              {/* STAT CHIPS — rolling context, not repeated from the hero */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatChip
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                  label="7-day volume"
                  value={fmtChips(status.wager7dChips)}
                />
                <StatChip
                  icon={<CalendarDays className="h-3.5 w-3.5" />}
                  label="30-day volume"
                  value={fmtChips(status.wager30dChips)}
                />
                <StatChip
                  icon={<Coins className="h-3.5 w-3.5" />}
                  label="Lifetime earned"
                  value={fmtChips(lifetimeEarned)}
                  accent={accent}
                />
                <StatChip
                  icon={<Wallet className="h-3.5 w-3.5" />}
                  label="Rakeback rate"
                  value={`${(status.currentTier.rakebackBps / 100).toFixed(2)}%`}
                />
              </div>
            </>
          )}

          {/* TIER LADDER — visual, perks shown once per rung */}
          <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wider text-white/50">
            Tier ladder
          </h2>
          <div className="space-y-2">
            {tiers.map((t) => {
              const isCurrent = status?.currentTier.tierLevel === t.tierLevel
              const reached =
                status != null &&
                (() => {
                  try {
                    return BigInt(status.lifetimeWagerChips) >= BigInt(t.minLifetimeWagerChips)
                  } catch {
                    return false
                  }
                })()
              return (
                <motion.div
                  key={t.tierLevel}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: t.tierLevel * 0.03 }}
                  className="flex items-center gap-4 rounded-2xl border p-3.5 sm:p-4"
                  style={{
                    borderColor: isCurrent ? `${t.color}99` : 'rgba(255,255,255,0.08)',
                    background: isCurrent ? `${t.color}12` : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <TierMedallion tier={t} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{t.tierName}</span>
                      {isCurrent && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                          style={{ background: `${t.color}33`, color: t.color }}
                        >
                          YOU
                        </span>
                      )}
                      {!isCurrent && reached && (
                        <span className="text-[10px] font-medium text-emerald-400/80">✓ unlocked</span>
                      )}
                    </div>
                    <div className="text-xs text-white/45">{fmtCompact(t.minLifetimeWagerChips)} wagered</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold" style={{ color: t.color }}>
                      {(t.rakebackBps / 100).toFixed(2)}%
                    </div>
                    <div className="text-[11px] text-white/40">rakeback</div>
                  </div>
                  <div className="hidden text-right sm:block">
                    <div className="text-sm font-semibold text-white/80">
                      {BigInt(t.levelUpBonusChips || '0') > 0n ? `+${fmtCompact(t.levelUpBonusChips)}` : '—'}
                    </div>
                    <div className="text-[11px] text-white/40">bonus</div>
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* HOW IT WORKS — three concise steps, no wall of text */}
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { icon: <Coins className="h-4 w-4" />, t: 'Wager', d: 'Every bet across all games counts toward your tier.' },
              { icon: <Percent className="h-4 w-4" />, t: 'Earn', d: 'Rakeback accrues on turnover at your tier rate.' },
              { icon: <Sparkles className="h-4 w-4" />, t: 'Claim', d: 'Cash out rakeback + tier bonuses to chips anytime.' },
            ].map((s) => (
              <div key={s.t} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-2 text-white" style={{ color: accent }}>
                  {s.icon}
                  <span className="text-sm font-semibold text-white">{s.t}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-white/50">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlobalMainNav>
  )
}
