'use client'

/**
 * AndarBaharFairnessModal — provably-fair panel for chips Andar Bahar.
 *
 * Ported from the prototype's fairness modal: set or randomize your client seed
 * (used for the next round), and verify any past round by id. Andar Bahar settles
 * instantly, so the server seed is published with every round — the committed-hash
 * check (sha256(serverSeed) === serverSeedHash) is recomputed locally with
 * WebCrypto, and the deal is re-derived server-side and echoed back so the joker,
 * both rows, and the winning side can be confirmed independently.
 */

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  verifyAndarBahar,
  cardRankLabel,
  cardSuitGlyph,
  cardIsRed,
  cardRank0,
  sideLabel,
  type AndarBaharVerifyResult,
} from '@/lib/andar-bahar-client'

interface AndarBaharFairnessModalProps {
  open: boolean
  onClose: () => void
  clientSeed: string
  onClientSeedChange: (seed: string) => void
  /** When set (and the modal is open), the id is filled in and verified immediately. */
  requestVerifyId: string | null
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="arc-mono break-all rounded-md bg-[#081420] px-2 py-1 text-xs text-slate-300">
        {value}
      </div>
    </div>
  )
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? 'text-cyan-400' : 'text-red-400'}>{ok ? '✓' : '✗'}</span>
      <span className="text-slate-300">{label}</span>
    </div>
  )
}

/** A tiny re-derived card chip, cyan-ringed when it's the matching rank. */
function MiniCard({ card, jokerRank0 }: { card: number; jokerRank0: number }) {
  const isMatch = cardRank0(card) === jokerRank0
  return (
    <span
      className={[
        'inline-flex h-8 w-6 flex-col items-center justify-center rounded bg-[#f2efe6] text-[10px] font-semibold leading-none',
        cardIsRed(card) ? 'text-[#b3261e]' : 'text-[#1f2937]',
        isMatch ? 'ring-2 ring-cyan-400' : '',
      ].join(' ')}
    >
      <span>{cardRankLabel(card)}</span>
      <span>{cardSuitGlyph(card)}</span>
    </span>
  )
}

function CardRow({ label, cards, jokerRank0 }: { label: string; cards: number[]; jokerRank0: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-12 shrink-0 text-[11px] text-slate-500">{label}</span>
      {cards.length === 0 ? (
        <span className="text-[11px] text-slate-600">—</span>
      ) : (
        cards.map((c, i) => <MiniCard key={i} card={c} jokerRank0={jokerRank0} />)
      )}
    </div>
  )
}

/** sha256 hex via WebCrypto — used to re-check the server-seed commitment locally. */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 16 random bytes → 32-char hex, generated locally with WebCrypto. */
function randomClientSeed(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

function sameSeq(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

export function AndarBaharFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: AndarBaharFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('')
  const [result, setResult] = useState<AndarBaharVerifyResult | null>(null)
  const [hashMatches, setHashMatches] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function runVerify(id: string) {
    const trimmed = id.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    setResult(null)
    setHashMatches(null)
    try {
      const r = await verifyAndarBahar(trimmed)
      setResult(r)
      setHashMatches((await sha256Hex(r.serverSeed)) === r.serverSeedHash)
    } catch {
      setError('No round found with that ID.')
    } finally {
      setLoading(false)
    }
  }

  // Auto-verify when opened pointed at a specific round (history row / last round).
  useEffect(() => {
    if (open && requestVerifyId) {
      setVerifyId(requestVerifyId)
      void runVerify(requestVerifyId)
    }
  }, [open, requestVerifyId])

  const dealMatches =
    result != null &&
    result.recomputedJoker === result.joker &&
    sameSeq(result.recomputedAndarCards, result.andarCards) &&
    sameSeq(result.recomputedBaharCards, result.baharCards)
  const winnerMatches = result != null && result.recomputedWinningSide === result.winningSide

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="arcade2-scope max-h-[85vh] max-w-lg overflow-y-auto border-cyan-950 bg-[#050E16] text-slate-200">
        <DialogHeader>
          <DialogTitle className="arc-display uppercase tracking-wider">Provably Fair</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Client seed */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Your client seed</h3>
            <p className="text-xs text-slate-500">
              Mixed into every shuffle. Change it any time — the next round uses the new value.
            </p>
            <div className="flex gap-2">
              <Input
                value={clientSeed}
                onChange={(e) => onClientSeedChange(e.target.value.slice(0, 128))}
                placeholder="Leave blank for a random seed each round"
                className="arc-mono border-cyan-950 bg-[#081420] text-xs"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => onClientSeedChange(randomClientSeed())}
                className="shrink-0 border-cyan-950 bg-transparent text-cyan-300 hover:bg-cyan-500/10"
              >
                New seed
              </Button>
            </div>
          </section>

          {/* Verify */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Verify a round</h3>
            <p className="text-xs text-slate-500">
              The deck is sealed from a server seed committed (hashed) before your bet — revealed once
              the round settles.
            </p>
            <div className="flex gap-2">
              <Input
                value={verifyId}
                onChange={(e) => setVerifyId(e.target.value)}
                placeholder="Round ID"
                className="arc-mono border-cyan-950 bg-[#081420] text-xs"
              />
              <Button
                onClick={() => runVerify(verifyId)}
                disabled={loading}
                className="shrink-0 bg-cyan-600 hover:bg-cyan-500"
              >
                {loading ? 'Checking…' : 'Verify'}
              </Button>
            </div>
          </section>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {result && (
            <section className="arc-panel space-y-3 rounded-lg p-3">
              <div className="space-y-1.5">
                {hashMatches !== null && (
                  <Check
                    ok={hashMatches}
                    label="Server seed matches its committed hash (checked locally)"
                  />
                )}
                <Check ok={dealMatches} label="Joker & both rows re-derive from the shuffled deck" />
                <Check ok={winnerMatches} label="First side to match the joker rank wins" />
              </div>

              <div className="space-y-2">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">
                  The deal (re-derived) — cyan = match
                </div>
                <CardRow label="Joker" cards={[result.joker]} jokerRank0={-1} />
                <CardRow label="Andar" cards={result.andarCards} jokerRank0={cardRank0(result.joker)} />
                <CardRow label="Bahar" cards={result.baharCards} jokerRank0={cardRank0(result.joker)} />
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Field label="Server seed hash (committed)" value={result.serverSeedHash} />
                <Field label="Server seed (revealed)" value={result.serverSeed} />
                <Field label="Client seed" value={result.clientSeed} />
                <Field label="Nonce" value={String(result.nonce)} />
                <Field label="Recipe" value={result.recipe} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>
                  Bet on:{' '}
                  <span className="arc-mono font-semibold text-slate-200">{sideLabel(result.side)}</span>
                </span>
                <span>
                  Winner:{' '}
                  <span className="arc-mono text-cyan-300">{sideLabel(result.winningSide)}</span>
                </span>
                <span>
                  Returned:{' '}
                  <span className={`arc-mono ${result.payout > 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                    {result.payout.toLocaleString()} MORBIUS
                  </span>
                </span>
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
