'use client'

/**
 * ReferralAbuseControls — admin anti-abuse tools for the referral program,
 * rendered on the /activity dashboard's Referrals tab.
 *
 * Two things live here:
 *   1. A program-wide PAUSE. While paused no new codes can be bound, so no more
 *      welcome bonuses are paid and no new rewards accrue. Existing bindings are
 *      untouched — this is a kill switch, not a delete.
 *   2. A per-referrer INSPECTOR: every wallet they referred with that wallet's
 *      current balance and lifetime wager, so a farm (many referees that took the
 *      welcome bonus and never wagered) is obvious at a glance — plus a blacklist
 *      button that revokes their referral privileges and claws back the referral
 *      rewards they earned.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Ban, Loader2, Pause, Play, Search, ShieldOff, Undo2, X } from 'lucide-react'

interface Referee {
  address: string
  boundAt: string
  welcomeBonusChips: string
  rewardChips: string
  chipBalance: string
  lifetimeWager: string
}

interface ReferrerDetail {
  referrer: string
  blacklisted: boolean
  blacklistReason: string | null
  clawedBackChips: string
  totals: { referees: number; neverWagered: number; welcomePaid: string; earned: string }
  referees: Referee[]
}

const fmt = (v: string | number) => {
  try {
    return Math.floor(Number(v)).toLocaleString()
  } catch {
    return String(v)
  }
}
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export default function ReferralAbuseControls() {
  const [paused, setPaused] = useState<boolean>(false)
  const [toggling, setToggling] = useState(false)
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<ReferrerDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmBlacklist, setConfirmBlacklist] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmClaw, setConfirmClaw] = useState(false)
  const [banInput, setBanInput] = useState('')
  const [banList, setBanList] = useState<Array<{ address: string; reason: string | null; clawedBackChips: string }>>([])

  // Read the live program state so the button reflects reality on load.
  useEffect(() => {
    let cancelled = false
    fetch('/api/referrals/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!cancelled && c && typeof c.enabled === 'boolean') setPaused(!c.enabled)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const loadBanList = useCallback(async () => {
    try {
      const res = await fetch('/api/admin-ops/referrals/blacklist?limit=200')
      if (!res.ok) return
      const d = await res.json()
      setBanList(Array.isArray(d.entries) ? d.entries : [])
    } catch {
      /* non-fatal: the list is informational */
    }
  }, [])

  useEffect(() => {
    loadBanList()
  }, [loadBanList])

  // Accepts a pasted list — commas, spaces or newlines — so a whole farm goes in at once.
  const addToBlacklist = useCallback(async () => {
    const addresses = banInput.split(/[^0-9a-zA-Z]+/).filter((t) => /^0x[a-fA-F0-9]{40}$/.test(t))
    if (addresses.length === 0) {
      setError('Paste one or more full wallet addresses (0x…).')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin-ops/referrals/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses, reason: 'Referral abuse' }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Blacklist failed')
      setNotice(`Blacklisted ${d.added} wallet(s) from the referral program.`)
      setBanInput('')
      await loadBanList()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Blacklist failed')
    } finally {
      setLoading(false)
    }
  }, [banInput, loadBanList])

  const removeFromBlacklist = useCallback(
    async (addr: string) => {
      setLoading(true)
      try {
        await fetch(`/api/admin-ops/referrals/referrer/${addr}/blacklist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ undo: true }),
        })
        await loadBanList()
      } finally {
        setLoading(false)
      }
    },
    [loadBanList],
  )

  const togglePause = useCallback(async () => {
    setToggling(true)
    setError(null)
    try {
      const next = paused // paused -> we are turning it back ON
      const res = await fetch('/api/admin-ops/referrals/enabled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not change the program state')
      setPaused(!next)
      setNotice(next ? 'Referrals resumed.' : 'Referrals paused — no new codes can be bound.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the program state')
    } finally {
      setToggling(false)
    }
  }, [paused])

  const lookup = useCallback(async (addr: string) => {
    const a = addr.trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(a)) {
      setError('Enter a full wallet address (0x…).')
      return
    }
    setLoading(true)
    setError(null)
    setNotice(null)
    setConfirmBlacklist(false)
    setConfirmClaw(false)
    setSelected(new Set())
    try {
      const res = await fetch(`/api/admin-ops/referrals/referrer/${a}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Lookup failed')
      setDetail(data as ReferrerDetail)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed')
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const applyBlacklist = useCallback(
    async (undo: boolean) => {
      if (!detail) return
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/admin-ops/referrals/referrer/${detail.referrer}/blacklist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(undo ? { undo: true } : { clawback: true, reason: 'Referral farming' }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Action failed')
        setNotice(
          undo
            ? 'Referral privileges restored (clawed-back chips were not returned).'
            : `Blacklisted — ${fmt(data.clawedBack ?? '0')} MORBIUS of referral rewards clawed back.`,
        )
        setConfirmBlacklist(false)
        await lookup(detail.referrer)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Action failed')
      } finally {
        setLoading(false)
      }
    },
    [detail, lookup],
  )

  const toggleOne = useCallback((addr: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(addr)) next.delete(addr)
      else next.add(addr)
      return next
    })
  }, [])

  // "Select never-played" is the one-click version of the farm heuristic.
  const selectIdle = useCallback(() => {
    if (!detail) return
    setSelected(new Set(detail.referees.filter((r) => BigInt(r.lifetimeWager || '0') === 0n).map((r) => r.address)))
  }, [detail])

  // What we can actually recover: min(welcome bonus, that wallet's balance).
  const recoverable = detail
    ? detail.referees
        .filter((r) => selected.has(r.address))
        .reduce((sum, r) => {
          const owed = BigInt(r.welcomeBonusChips || '0')
          const bal = BigInt(r.chipBalance || '0')
          return sum + (bal < owed ? bal : owed)
        }, 0n)
    : 0n

  const clawbackWelcome = useCallback(async () => {
    if (!detail || selected.size === 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin-ops/referrals/referrer/${detail.referrer}/clawback-welcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referees: Array.from(selected) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Clawback failed')
      setNotice(
        `Recovered ${fmt(data.totalRecovered ?? '0')} MORBIUS from ${selected.size} wallet(s)` +
          (BigInt(data.totalShortfall ?? '0') > 0n
            ? ` · ${fmt(data.totalShortfall)} unrecoverable (already spent or withdrawn)`
            : ''),
      )
      setConfirmClaw(false)
      setSelected(new Set())
      await lookup(detail.referrer)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Clawback failed')
    } finally {
      setLoading(false)
    }
  }, [detail, selected, lookup])

  return (
    <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      {/* Program pause */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white/90">Referral program</div>
          <div className="text-xs text-white/50">
            {paused
              ? 'Paused — no new codes can be bound, no welcome bonuses or rewards are being paid.'
              : 'Live — new players can bind codes and receive the welcome bonus.'}
          </div>
        </div>
        <button
          onClick={togglePause}
          disabled={toggling}
          className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
            paused
              ? 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
              : 'bg-amber-500/15 text-amber-300 hover:bg-amber-500/25'
          }`}
        >
          {toggling ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : paused ? (
            <Play className="h-3.5 w-3.5" />
          ) : (
            <Pause className="h-3.5 w-3.5" />
          )}
          {paused ? 'Resume referrals' : 'Pause referrals'}
        </button>
      </div>

      {/* Direct blacklist — any wallet, not just referrers */}
      <div className="mt-4 border-t border-white/10 pt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
          Blacklist wallets
          {banList.length > 0 && <span className="ml-2 text-white/30">({banList.length})</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <textarea
            value={banInput}
            onChange={(e) => setBanInput(e.target.value)}
            rows={2}
            placeholder="Paste addresses — commas, spaces or new lines"
            className="min-w-[260px] flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-white/90 outline-none placeholder:text-white/25 focus:border-rose-400/50"
          />
          <button
            onClick={addToBlacklist}
            disabled={loading}
            className="inline-flex h-fit items-center gap-2 rounded-lg bg-rose-500/15 px-3.5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/25 disabled:opacity-50"
          >
            <Ban className="h-3.5 w-3.5" /> Blacklist
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-white/40">
          Blocks both directions: their code stops working and they can no longer collect a welcome bonus.
          Does not claw anything back — use the inspector below for that.
        </p>

        {banList.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {banList.map((b) => (
              <span
                key={b.address}
                title={`${b.address}${b.reason ? ` — ${b.reason}` : ''}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/25 bg-rose-500/10 px-2.5 py-1 font-mono text-[11px] text-rose-200"
              >
                {short(b.address)}
                <button
                  onClick={() => removeFromBlacklist(b.address)}
                  aria-label={`Remove ${b.address}`}
                  className="text-rose-300/60 hover:text-rose-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Referrer inspector */}
      <div className="mt-4 border-t border-white/10 pt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
          Inspect a referrer
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && lookup(query)}
              placeholder="Referrer wallet address (0x…)"
              className="w-full rounded-lg border border-white/10 bg-black/30 py-2 pl-8 pr-3 font-mono text-xs text-white/90 outline-none placeholder:text-white/25 focus:border-cyan-400/50"
            />
          </div>
          <button
            onClick={() => lookup(query)}
            disabled={loading}
            className="rounded-lg bg-white/10 px-3.5 py-2 text-xs font-semibold text-white/90 hover:bg-white/15 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Look up'}
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {notice}
          </div>
        )}

        {detail && (
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-mono text-white/80">{short(detail.referrer)}</span>
                <span className="text-white/50">
                  {detail.totals.referees.toLocaleString()} referees ·{' '}
                  <span className={detail.totals.neverWagered > 0 ? 'text-amber-300' : ''}>
                    {detail.totals.neverWagered.toLocaleString()} never wagered
                  </span>{' '}
                  · {fmt(detail.totals.welcomePaid)} welcome paid · {fmt(detail.totals.earned)} earned
                </span>
                {detail.blacklisted && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-300">
                    <ShieldOff className="h-3 w-3" /> Blacklisted
                  </span>
                )}
              </div>

              {detail.blacklisted ? (
                <button
                  onClick={() => applyBlacklist(true)}
                  disabled={loading}
                  className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3.5 py-2 text-xs font-semibold text-white/80 hover:bg-white/15 disabled:opacity-50"
                >
                  <Undo2 className="h-3.5 w-3.5" /> Restore privileges
                </button>
              ) : confirmBlacklist ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => applyBlacklist(false)}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-lg bg-rose-500/25 px-3.5 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/35 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                    Confirm — claw back {fmt(detail.totals.earned)}
                  </button>
                  <button
                    onClick={() => setConfirmBlacklist(false)}
                    className="rounded-lg px-2.5 py-2 text-xs text-white/50 hover:text-white/80"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmBlacklist(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-500/15 px-3.5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/25"
                >
                  <Ban className="h-3.5 w-3.5" /> Blacklist referrer
                </button>
              )}
            </div>

            {confirmBlacklist && !detail.blacklisted && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Their code stops working, they stop earning from existing referees, and{' '}
                  <strong>{fmt(detail.totals.earned)} MORBIUS</strong> of earned referral rewards is debited
                  from their balance. Welcome bonuses already paid to the referees are{' '}
                  <strong>not</strong> reversed — those chips sit in the referees&apos; wallets.
                </span>
              </div>
            )}

            {detail.referees.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={selectIdle}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/80 hover:bg-white/15"
                >
                  Select never-played ({detail.totals.neverWagered})
                </button>
                {selected.size > 0 && (
                  <button
                    onClick={() => setSelected(new Set())}
                    className="rounded-lg px-2.5 py-1.5 text-[11px] text-white/50 hover:text-white/80"
                  >
                    Clear ({selected.size})
                  </button>
                )}
                <div className="flex-1" />
                {selected.size > 0 &&
                  (confirmClaw ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={clawbackWelcome}
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-lg bg-rose-500/25 px-3.5 py-1.5 text-[11px] font-bold text-rose-200 hover:bg-rose-500/35 disabled:opacity-50"
                      >
                        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                        Confirm — take back {fmt(recoverable.toString())}
                      </button>
                      <button
                        onClick={() => setConfirmClaw(false)}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] text-white/50 hover:text-white/80"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmClaw(true)}
                      className="inline-flex items-center gap-2 rounded-lg bg-rose-500/15 px-3.5 py-1.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/25"
                    >
                      <Ban className="h-3.5 w-3.5" /> Claw back welcome bonuses ({fmt(recoverable.toString())})
                    </button>
                  ))}
              </div>
            )}

            {confirmClaw && selected.size > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Debits each selected wallet up to the welcome bonus it received. Chips already spent or
                  withdrawn on-chain cannot be recovered — those wallets are debited only down to zero and the
                  shortfall is reported.
                </span>
              </div>
            )}

            <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-white/10">
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 bg-[#0b1117]">
                  <tr className="text-left text-[10px] uppercase tracking-wider text-white/40">
                    <th className="w-8 px-3 py-2 font-medium" />
                    <th className="px-3 py-2 font-medium">Referred wallet</th>
                    <th className="px-3 py-2 text-right font-medium">Balance</th>
                    <th className="px-3 py-2 text-right font-medium">Lifetime wager</th>
                    <th className="px-3 py-2 text-right font-medium">Welcome</th>
                    <th className="px-3 py-2 text-right font-medium">Earned them</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.referees.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-6 text-center text-white/40">
                        This wallet has not referred anyone.
                      </td>
                    </tr>
                  ) : (
                    detail.referees.map((r) => {
                      const idle = BigInt(r.lifetimeWager || '0') === 0n
                      return (
                        <tr
                          key={r.address}
                          className={`border-t border-white/5 ${idle ? 'bg-amber-500/[0.06]' : ''}`}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selected.has(r.address)}
                              onChange={() => toggleOne(r.address)}
                              aria-label={`Select ${r.address}`}
                              className="h-3.5 w-3.5 cursor-pointer accent-rose-400"
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-white/80" title={r.address}>
                            {short(r.address)}
                            {idle && (
                              <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-300/80">
                                never played
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-white/70">{fmt(r.chipBalance)}</td>
                          <td className="px-3 py-2 text-right font-mono text-white/50">{fmt(r.lifetimeWager)}</td>
                          <td className="px-3 py-2 text-right font-mono text-white/50">{fmt(r.welcomeBonusChips)}</td>
                          <td className="px-3 py-2 text-right font-mono text-amber-300/80">{fmt(r.rewardChips)}</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
