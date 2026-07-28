'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount } from 'wagmi'
import { isAddress } from 'viem'
import { Loader2, Search, UserRound, Wallet, ShieldCheck, Plus, Minus, X, Check } from 'lucide-react'

// ── types ────────────────────────────────────────────────────────────────────
interface PlayerHit {
  address: string
  displayName: string | null
  profileImageUrl: string | null
  chipBalance: string
}

type Mode = 'credit' | 'debit'

// ── helpers ──────────────────────────────────────────────────────────────────
function fmt(s: string | undefined): string {
  if (s == null) return '0'
  try {
    return BigInt(s).toLocaleString('en-US')
  } catch {
    return s
  }
}
function short(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr
}

// ── panel ────────────────────────────────────────────────────────────────────
export default function AdminCreditPanel() {
  const { address: adminAddress } = useAccount()

  // search state
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerHit[]>([])
  const [searching, setSearching] = useState(false)
  const [target, setTarget] = useState<PlayerHit | null>(null)

  // credit form state
  const [mode, setMode] = useState<Mode>('credit')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  // flow state
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced search against the admin-only backend.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin-ops/users/search?q=${encodeURIComponent(q)}`)
        if (!res.ok) throw new Error('search failed')
        const data = (await res.json()) as { results?: PlayerHit[] }
        setResults(data.results ?? [])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  const typedIsAddress = useMemo(() => isAddress(query.trim(), { strict: false }), [query])

  const pick = useCallback((hit: PlayerHit) => {
    setTarget(hit)
    setResults([])
    setQuery('')
    setError(null)
    setSuccess(null)
  }, [])

  const amountBig = useMemo(() => {
    const s = amount.trim()
    if (!/^\d+$/.test(s)) return null
    try {
      const n = BigInt(s)
      return n > 0n ? n : null
    } catch {
      return null
    }
  }, [amount])

  const signedAmount = useMemo(() => {
    if (amountBig == null) return null
    return mode === 'debit' ? -amountBig : amountBig
  }, [amountBig, mode])

  const projected = useMemo(() => {
    if (!target || signedAmount == null) return null
    try {
      return (BigInt(target.chipBalance) + signedAmount).toString()
    } catch {
      return null
    }
  }, [target, signedAmount])

  const canSubmit = target != null && amountBig != null && !submitting

  const submit = useCallback(async () => {
    if (!target || signedAmount == null) return
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/admin-ops/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: target.address, amount: signedAmount.toString(), note: note.trim() }),
      })
      const data = (await res.json().catch(() => ({}))) as { balance?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'Adjustment failed')
      setTarget({ ...target, chipBalance: data.balance ?? target.chipBalance })
      setSuccess(
        `${mode === 'debit' ? 'Debited' : 'Credited'} ${fmt(amountBig!.toString())} MORBIUS · new balance ${fmt(data.balance)}`,
      )
      setAmount('')
      setNote('')
      setConfirming(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Adjustment failed')
      setConfirming(false)
    } finally {
      setSubmitting(false)
    }
  }, [target, signedAmount, note, mode, amountBig])

  return (
    <div className="mt-4 rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.07] via-white/[0.02] to-transparent p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-white">
          <ShieldCheck className="h-4 w-4 text-amber-300" /> Credit a player
        </h2>
        <span className="text-xs text-white/35">admin only</span>
      </div>

      {/* Search */}
      {!target && (
        <div className="relative">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by wallet address or display name…"
              className="w-full bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
              spellCheck={false}
              autoComplete="off"
            />
            {searching && <Loader2 className="h-4 w-4 animate-spin text-white/40" />}
          </div>

          {(results.length > 0 || typedIsAddress) && (
            <div className="mt-2 flex max-h-72 flex-col gap-1 overflow-y-auto rounded-xl border border-white/10 bg-[#0b0f18] p-1">
              {results.map((hit) => (
                <button
                  key={hit.address}
                  type="button"
                  onClick={() => pick(hit)}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/5"
                >
                  <Avatar hit={hit} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-white">
                      {hit.displayName || short(hit.address)}
                    </div>
                    <div className="truncate font-mono text-[11px] text-white/40">{hit.address}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-bold tabular-nums text-amber-300">{fmt(hit.chipBalance)}</div>
                    <div className="text-[10px] text-white/35">MORBIUS</div>
                  </div>
                </button>
              ))}
              {typedIsAddress && !results.some((r) => r.address.toLowerCase() === query.trim().toLowerCase()) && (
                <button
                  type="button"
                  onClick={() =>
                    pick({ address: query.trim(), displayName: null, profileImageUrl: null, chipBalance: '0' })
                  }
                  className="flex items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-white/5"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5">
                    <Wallet className="h-4 w-4 text-white/50" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-white">Use this address</div>
                    <div className="truncate font-mono text-[11px] text-white/40">{query.trim()}</div>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Selected target + credit form */}
      {target && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-3">
            <Avatar hit={target} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-white">
                {target.displayName || short(target.address)}
              </div>
              <div className="truncate font-mono text-[11px] text-white/40">{target.address}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-bold tabular-nums text-amber-300">{fmt(target.chipBalance)}</div>
              <div className="text-[10px] text-white/35">current MORBIUS</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setTarget(null)
                setAmount('')
                setNote('')
                setError(null)
                setSuccess(null)
              }}
              className="ml-1 rounded-lg p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white"
              aria-label="Change player"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Credit / Debit toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('credit')}
              className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-semibold transition ${
                mode === 'credit'
                  ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                  : 'border-white/10 bg-white/[0.02] text-white/50 hover:text-white'
              }`}
            >
              <Plus className="h-4 w-4" /> Credit
            </button>
            <button
              type="button"
              onClick={() => setMode('debit')}
              className={`flex items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-semibold transition ${
                mode === 'debit'
                  ? 'border-rose-400/40 bg-rose-400/10 text-rose-200'
                  : 'border-white/10 bg-white/[0.02] text-white/50 hover:text-white'
              }`}
            >
              <Minus className="h-4 w-4" /> Debit
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/40">
              Amount (MORBIUS)
            </label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              placeholder="0"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-lg font-bold tabular-nums text-white placeholder:text-white/25 focus:border-amber-400/40 focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {['1000', '10000', '100000', '1000000'].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(q)}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-white/60 transition hover:bg-white/10 hover:text-white"
                >
                  {fmt(q)}
                </button>
              ))}
            </div>
            {projected != null && amountBig != null && (
              <div className="mt-2 text-xs text-white/45">
                New balance:{' '}
                <span className={projected.startsWith('-') ? 'font-bold text-rose-300' : 'font-bold text-amber-300'}>
                  {fmt(projected)}
                </span>{' '}
                MORBIUS
              </div>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-white/40">
              Note (optional)
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Reason for this adjustment…"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/25 focus:border-amber-400/40 focus:outline-none"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              <Check className="h-4 w-4 shrink-0" /> {success}
            </div>
          )}

          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              setError(null)
              setSuccess(null)
              setConfirming(true)
            }}
            className="rounded-xl bg-amber-400 py-2.5 text-sm font-bold text-black transition enabled:hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {mode === 'debit' ? 'Debit' : 'Credit'} player
          </button>
        </div>
      )}

      {/* Confirmation modal */}
      {confirming && target && signedAmount != null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0b0f18] p-5 shadow-2xl">
            <h3 className="text-base font-bold text-white">Confirm {mode === 'debit' ? 'debit' : 'credit'}</h3>
            <p className="mt-1 text-sm text-white/50">This immediately adjusts the player’s spendable balance.</p>

            <div className="mt-4 space-y-2 rounded-xl border border-white/10 bg-black/30 p-3 text-sm">
              <Row label="Player" value={target.displayName || short(target.address)} />
              <Row label="Wallet" value={short(target.address)} mono />
              <Row
                label="Amount"
                value={`${mode === 'debit' ? '−' : '+'}${fmt(amountBig?.toString())} MORBIUS`}
                valueClass={mode === 'debit' ? 'text-rose-300' : 'text-emerald-300'}
              />
              <Row label="Current" value={`${fmt(target.chipBalance)} MORBIUS`} />
              {projected != null && <Row label="New balance" value={`${fmt(projected)} MORBIUS`} valueClass="text-amber-300" />}
              {note.trim() && <Row label="Note" value={note.trim()} />}
            </div>

            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-white/35">
              <UserRound className="h-3 w-3" /> Acting as {adminAddress ? short(adminAddress) : 'admin'} · logged to audit trail
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setConfirming(false)}
                className="rounded-xl border border-white/10 py-2.5 text-sm font-semibold text-white/70 transition hover:bg-white/5 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={submit}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-400 py-2.5 text-sm font-bold text-black transition enabled:hover:bg-amber-300 disabled:opacity-40"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── small pieces ─────────────────────────────────────────────────────────────
function Avatar({ hit }: { hit: PlayerHit }) {
  if (hit.profileImageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={hit.profileImageUrl} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
  }
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5">
      <UserRound className="h-4 w-4 text-white/40" />
    </div>
  )
}

function Row({ label, value, valueClass, mono }: { label: string; value: string; valueClass?: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-white/45">{label}</span>
      <span className={`text-right font-semibold text-white ${mono ? 'font-mono text-xs' : ''} ${valueClass ?? ''}`}>
        {value}
      </span>
    </div>
  )
}
