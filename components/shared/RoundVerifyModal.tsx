'use client'

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Copy, Check, ShieldCheck, ExternalLink, KeyRound, Loader2 } from 'lucide-react'
import { rotateArcadeSeed } from '@/lib/arcade-seed-client'

interface VerifyData {
  ok?: boolean
  serverSeed?: string
  serverSeedHash?: string
  clientSeed?: string
  nonce?: number
  recipe?: string
  result?: unknown
  won?: boolean
  /**
   * Present only on the shared-seed arcade games (Limbo, Dice, Keno, …), where
   * one server seed spans many bets. `false` means this round's seed is still
   * the live one and therefore still sealed. Absent on games that mint and
   * reveal a seed per round (blackjack), which are always verifiable.
   */
  seedRevealed?: boolean
  [k: string]: unknown
}

/** SHA-256 hex of a string (browser crypto.subtle; available on https/localhost). */
async function sha256Hex(input: string): Promise<string | null> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

function Field({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div className="rounded-lg border border-cyan-400/10 bg-black/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="mt-1 flex items-start gap-2">
        <code className="arc-mono min-w-0 flex-1 break-all text-[12.5px] text-white/85">{value || '—'}</code>
        {value ? (
          <button type="button" onClick={copy} className="flex-none text-white/40 hover:text-cyan-300">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </div>
    </div>
  )
}

interface RoundVerifyModalProps {
  url: string
  gameLabel: string
  onClose: () => void
}

export function RoundVerifyModal({ url, gameLabel, onClose }: RoundVerifyModalProps) {
  const queryClient = useQueryClient()
  const { data, isLoading, isError } = useQuery<VerifyData>({
    queryKey: ['roundVerify', url],
    queryFn: async () => {
      const res = await fetch(url)
      if (!res.ok) throw new Error('Failed to load verification')
      return res.json()
    },
    staleTime: 60_000,
  })

  const [commitMatch, setCommitMatch] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    setCommitMatch(null)
    if (data?.serverSeed && data?.serverSeedHash) {
      sha256Hex(data.serverSeed).then((h) => {
        if (alive && h) setCommitMatch(h.toLowerCase() === String(data.serverSeedHash).toLowerCase())
      })
    }
    return () => {
      alive = false
    }
  }, [data?.serverSeed, data?.serverSeedHash])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /* Rotating retires the live seed — which is what makes this round checkable —
     and immediately commits a fresh one, so nothing is exposed for future bets. */
  const [rotating, setRotating] = useState(false)
  const [rotateError, setRotateError] = useState<string | null>(null)
  const stillSealed = data?.ok === true && data.seedRevealed === false

  const revealNow = async () => {
    setRotating(true)
    setRotateError(null)
    try {
      await rotateArcadeSeed()
      await queryClient.invalidateQueries({ queryKey: ['roundVerify', url] })
      await queryClient.invalidateQueries({ queryKey: ['arcadeSeed'] })
    } catch (err) {
      setRotateError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not rotate the seed — make sure you are signed in.',
      )
    } finally {
      setRotating(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: 'rgba(2,6,12,0.72)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl"
        style={{
          background:
            'linear-gradient(rgba(255,255,255,0.04), rgba(255,255,255,0) 22%), rgba(8,20,31,0.96)',
          border: '1px solid rgba(34,211,238,0.18)',
          boxShadow: '0 24px 60px -24px rgba(0,0,0,0.9)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4.5 w-4.5 text-cyan-400" />
            <span className="arc-display text-[15px] font-bold tracking-wide text-white">
              Provably fair — {gameLabel}
            </span>
          </div>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-5">
          {isLoading ? (
            <div className="py-10 text-center">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
            </div>
          ) : isError || !data?.ok ? (
            <div className="py-8 text-center text-red-400">Couldn&apos;t load this round&apos;s verification.</div>
          ) : (
            <div className="space-y-3">
              {commitMatch !== null && (
                <div
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] ${
                    commitMatch
                      ? 'bg-emerald-400/10 text-emerald-300'
                      : 'bg-amber-400/10 text-amber-300'
                  }`}
                >
                  <ShieldCheck className="h-4 w-4" />
                  {commitMatch
                    ? 'SHA-256 of the revealed server seed matches the hash committed before the round.'
                    : 'Server-seed hash uses a different scheme — follow the recipe below to verify.'}
                </div>
              )}

              <Field label="Server seed hash (committed before round)" value={String(data.serverSeedHash ?? '')} />

              {stillSealed ? (
                <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3">
                  <div className="text-[10px] uppercase tracking-wider text-amber-300/70">
                    Server seed — sealed until you rotate
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/75">
                    This bet ran on the seed you are <b>still playing on</b>. Showing it now would let anyone
                    compute your next results, so it stays sealed — the hash above is what pins it down, and it
                    was published before you bet.
                  </p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-white/75">
                    Rotate to reveal it. That retires this seed — verifying this bet <b>and every other bet you
                    made on it</b> — and immediately commits a fresh sealed one for future play.
                  </p>
                  <button
                    type="button"
                    onClick={revealNow}
                    disabled={rotating}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[12.5px] font-semibold text-amber-200 transition hover:bg-amber-400/20 disabled:opacity-60"
                  >
                    {rotating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="h-3.5 w-3.5" />
                    )}
                    {rotating ? 'Rotating…' : 'Rotate & reveal'}
                  </button>
                  {rotateError ? (
                    <div className="mt-2 text-[12px] text-red-400">{rotateError}</div>
                  ) : null}
                </div>
              ) : (
                <Field label="Server seed (revealed)" value={String(data.serverSeed ?? '')} />
              )}
              <Field label="Client seed" value={String(data.clientSeed ?? '')} />
              <Field label="Nonce" value={String(data.nonce ?? '')} />

              {data.recipe ? (
                <div className="rounded-lg border border-cyan-400/10 bg-black/30 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-white/40">How the result is derived</div>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-white/70">{String(data.recipe)}</p>
                </div>
              ) : null}

              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] text-cyan-400 hover:text-cyan-300"
              >
                Open raw verification data
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default RoundVerifyModal
