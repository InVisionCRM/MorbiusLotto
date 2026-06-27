'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import Link from 'next/link'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Users, Gift, Sparkles, Loader2, Coins, Copy, Check, Share2, UserPlus } from 'lucide-react'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { useSiwe } from '@/contexts/siwe-context'
import { useReferrals } from '@/hooks/use-referrals'

const ACCENT = '#7c5cff'

/** Whole-chip decimal string → grouped display (chips are 1:1 MORBIUS). */
function fmtChips(v: string | number | undefined): string {
  if (v == null) return '0'
  try {
    return BigInt(typeof v === 'number' ? Math.trunc(v) : v).toLocaleString('en-US')
  } catch {
    return String(v)
  }
}

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

function StatCard({
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/40">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: accent ?? '#fff' }}>
        {value}
      </div>
    </div>
  )
}

export default function ReferralsPage() {
  const { address, isConnected } = useAccount()
  const { signIn } = useSiwe()
  const { config, summary, loading, binding, error, authRequired, bind, refresh } = useReferrals(address)

  const [codeInput, setCodeInput] = useState('')
  const [copied, setCopied] = useState(false)

  // Prefill the redeem field from a ?ref=CODE share link. Read straight from
  // the URL on the client (not next/navigation's useSearchParams) so the page
  // needs no Suspense boundary and stays fully static-prerenderable.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref) setCodeInput(ref.trim().toUpperCase())
  }, [])

  const shareLink = useMemo(() => {
    if (!summary?.code) return ''
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return `${origin}/referrals?ref=${summary.code}`
  }, [summary?.code])

  const rewardPct = useMemo(() => {
    const bps = summary?.rewardBps ?? config?.rewardBps ?? 0
    return (bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)
  }, [summary?.rewardBps, config?.rewardBps])

  const welcomeChips = summary?.welcomeBonusChips ?? config?.welcomeBonusChips ?? '0'

  async function handleCopy() {
    if (!shareLink) return
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      toast.success('Referral link copied')
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy — long-press to copy the link')
    }
  }

  async function handleShare() {
    if (!shareLink) return
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
          title: 'Join me on MORBlotto',
          text: 'Play MORBlotto with my referral link and grab a welcome bonus.',
          url: shareLink,
        })
        return
      } catch {
        /* user dismissed the share sheet — fall through to copy */
      }
    }
    void handleCopy()
  }

  async function handleBind() {
    const code = codeInput.trim().toUpperCase()
    if (!code) {
      toast.error('Enter a referral code')
      return
    }
    const result = await bind(code)
    if (result) {
      const welcome = BigInt(result.welcomeCredited || '0')
      toast.success(
        welcome > 0n
          ? `Code applied! +${fmtChips(result.welcomeCredited)} MORBIUS welcome bonus`
          : 'Referral code applied!',
      )
      setCodeInput('')
    }
  }

  return (
    <GlobalMainNav>
      <div className="relative min-h-screen w-full overflow-hidden">
        {/* ── Background: midnight aurora ── */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[#070a12]" />
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage:
              'radial-gradient(70% 50% at 50% -8%, rgba(124,92,255,0.16), transparent 60%),' +
              'radial-gradient(45% 45% at 14% 20%, rgba(94,160,255,0.12), transparent 60%),' +
              'radial-gradient(50% 45% at 88% 82%, rgba(124,92,255,0.16), transparent 62%)',
          }}
        />
        <div
          className="pointer-events-none absolute -left-24 top-32 -z-10 h-80 w-80 animate-pulse rounded-full blur-[120px]"
          style={{ background: 'rgba(124,92,255,0.12)', animationDuration: '7s' }}
        />
        <div
          className="pointer-events-none absolute -right-20 bottom-10 -z-10 h-80 w-80 animate-pulse rounded-full blur-[120px]"
          style={{ background: 'rgba(94,160,255,0.10)', animationDuration: '9s' }}
        />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,transparent_55%,rgba(0,0,0,0.55))]" />

        <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-500/10 ring-1 ring-purple-400/30">
                <Users className="h-6 w-6 text-purple-300" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white sm:text-3xl">Refer &amp; Earn</h1>
                <p className="text-sm text-white/55">
                  Invite friends — you earn {rewardPct}% of their rakeback, they get a welcome bonus.
                </p>
              </div>
            </div>
            <Link
              href="/vip"
              className="hidden shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white/70 transition hover:border-white/30 hover:text-white sm:inline-block"
            >
              VIP Club →
            </Link>
          </div>

          {!isConnected ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/60">
              Connect your wallet to get your referral link and start earning.
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-16">
              <Loader2 className="h-6 w-6 animate-spin text-white/50" />
            </div>
          ) : !summary ? (
            authRequired ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
                <p className="text-white/60">Sign in with your wallet to view your referral link.</p>
                <button
                  onClick={() => {
                    void signIn().then(refresh).catch(() => undefined)
                  }}
                  className="rounded-xl bg-purple-500 px-5 py-2.5 font-semibold text-white transition hover:bg-purple-400"
                >
                  Sign in
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-10 text-center">
                <p className="font-medium text-white/80">Referrals aren’t available right now.</p>
                <p className="max-w-md text-xs text-white/45">
                  The referral service didn’t respond. This usually means it’s still being set up — please
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
              {/* SHARE — your code + link */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="relative overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-7"
                style={{ background: `radial-gradient(120% 140% at 0% 0%, ${ACCENT}1f, rgba(255,255,255,0.02) 55%)` }}
              >
                <div className="text-[11px] uppercase tracking-widest text-white/40">Your referral code</div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <span className="font-mono text-3xl font-extrabold tracking-[0.2em] text-white sm:text-4xl">
                    {summary.code}
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <div className="flex min-w-0 flex-1 items-center rounded-xl border border-white/10 bg-black/30 px-3 py-2.5">
                    <span className="truncate text-sm text-white/60">{shareLink}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopy}
                      className="flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/5"
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={handleShare}
                      className="flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition"
                      style={{ background: ACCENT }}
                    >
                      <Share2 className="h-4 w-4" /> Share
                    </button>
                  </div>
                </div>

                <p className="mt-3 text-xs text-white/45">
                  Share your link. When a friend joins and plays, they get a{' '}
                  <span className="text-white/70">{fmtChips(welcomeChips)} MORBIUS</span> welcome bonus and you
                  earn <span className="text-white/70">{rewardPct}%</span> of all the rakeback they ever claim —
                  paid straight to your balance.
                </p>
              </motion.div>

              {/* STATS */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatCard
                  icon={<Users className="h-3.5 w-3.5" />}
                  label="Friends referred"
                  value={summary.refereeCount.toLocaleString('en-US')}
                />
                <StatCard
                  icon={<Coins className="h-3.5 w-3.5" />}
                  label="Earned from referrals"
                  value={fmtChips(summary.totalEarnedChips)}
                  accent={ACCENT}
                />
                <StatCard
                  icon={<Gift className="h-3.5 w-3.5" />}
                  label="Reward rate"
                  value={`${rewardPct}%`}
                />
              </div>

              {/* REDEEM / referred-by state */}
              {summary.referrer ? (
                <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-400/30">
                    <Check className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div className="text-sm text-white/70">
                    You were referred by{' '}
                    <span className="font-mono text-white">{shortAddr(summary.referrer)}</span>
                    {BigInt(summary.welcomeBonusReceivedChips || '0') > 0n && (
                      <>
                        {' '}
                        — welcome bonus of{' '}
                        <span className="font-semibold text-white">
                          {fmtChips(summary.welcomeBonusReceivedChips)} MORBIUS
                        </span>{' '}
                        credited.
                      </>
                    )}
                  </div>
                </div>
              ) : summary.canBind ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/40">
                    <UserPlus className="h-3.5 w-3.5" /> Got a referral code?
                  </div>
                  <p className="mt-1 text-sm text-white/55">
                    Enter a friend’s code to claim your {fmtChips(welcomeChips)} MORBIUS welcome bonus. You can
                    only do this once, while you’re still new.
                  </p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                      placeholder="e.g. 7KQ3MZ"
                      maxLength={12}
                      className="flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 font-mono text-lg tracking-[0.15em] text-white outline-none transition focus:border-purple-400/60"
                    />
                    <button
                      onClick={handleBind}
                      disabled={binding || !codeInput.trim()}
                      className="flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ background: ACCENT }}
                    >
                      {binding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {binding ? 'Applying…' : 'Apply code'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/50">
                  Referral codes can only be applied by new players — but you can still invite friends with your
                  own link above and earn from every one of them.
                </div>
              )}

              {/* HOW IT WORKS */}
              <div className="mt-10">
                <h2 className="text-lg font-bold text-white">How referrals work</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    {
                      icon: <Share2 className="h-4 w-4" />,
                      t: 'Share your link',
                      d: 'Every account gets a unique code. Send your link to friends — there’s no limit on how many you can refer.',
                    },
                    {
                      icon: <Gift className="h-4 w-4" />,
                      t: 'They get a welcome bonus',
                      d: `New players who apply your code receive a one-time ${fmtChips(welcomeChips)} MORBIUS bonus to start playing.`,
                    },
                    {
                      icon: <Coins className="h-4 w-4" />,
                      t: 'You earn forever',
                      d: `Whenever a friend claims VIP rakeback, you earn ${rewardPct}% of it on top — house-funded, paid straight to your chips. It never comes out of their reward.`,
                    },
                  ].map((s) => (
                    <div key={s.t} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-lg"
                        style={{ background: `${ACCENT}22`, color: ACCENT }}
                      >
                        {s.icon}
                      </div>
                      <div className="mt-2.5 font-semibold text-white">{s.t}</div>
                      <div className="mt-1 text-sm leading-relaxed text-white/55">{s.d}</div>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-white/35">
                  Referral earnings are tied to the VIP program — the more your friends play and claim, the more
                  you earn. Rates are set by the house and may change over time.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </GlobalMainNav>
  )
}
