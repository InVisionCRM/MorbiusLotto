'use client'

/**
 * DragonTigerFairnessModal — provably-fair panel for chips Dragon Tiger.
 *
 * Same conventions as the dicex2/baccarat modals: set or randomize your client
 * seed (used for the next round), and verify any past round by id. Dragon Tiger
 * settles instantly, so the server seed is published with every round. Locally
 * we recompute, with WebCrypto:
 *   • the committed-hash check — sha256(serverSeed) === serverSeedHash, and
 *   • the deck — an HMAC-SHA256 Fisher-Yates shuffle identical to the server's
 *     pfService.fisherYatesShuffle — to confirm deck[0] === dragonCard and
 *     deck[1] === tigerCard (so both cards were fixed before the bet).
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
import { ArcadeSeedControls } from '@/components/shared/ArcadeSeedControls'
import {
  verifyDragonTiger,
  cardRank,
  cardRankLabel,
  cardSuitGlyph,
  cardIsRed,
  resultLabel,
  type DragonTigerVerifyResult,
} from '@/lib/dragon-tiger-client'

interface DragonTigerFairnessModalProps {
  open: boolean
  onClose: () => void
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

function MiniCard({ cardIdx }: { cardIdx: number }) {
  return (
    <span
      className={`arc-mono inline-flex h-[42px] w-[30px] flex-col items-center justify-center rounded-[5px] text-[13px] font-semibold ${
        cardIsRed(cardIdx) ? 'text-[#b3261e]' : 'text-[#1f2937]'
      }`}
      style={{ background: '#f2efe6', border: '0.5px solid rgba(0,0,0,.3)' }}
    >
      {cardRankLabel(cardIdx)}
      <span>{cardSuitGlyph(cardIdx)}</span>
    </span>
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

/** HMAC-SHA256(serverSeed, message) → bytes — mirrors pfService.hmacByteStream's HMAC. */
async function hmacSha256(serverSeed: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(serverSeed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return new Uint8Array(sig)
}

/**
 * Re-derive the 52-card deck exactly like ProvablyFairService.fisherYatesShuffle:
 * a cursor-based HMAC byte stream (4 bytes per swap) drives a Fisher-Yates pass
 * from i = 51 down to 1. message = `${clientSeed}:${nonce}:${roundIndex}`,
 * roundIndex = floor(cursor / 32); each 4-byte slice → float in [0,1).
 */
async function reDeriveDeck(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): Promise<number[]> {
  const deck = Array.from({ length: 52 }, (_, i) => i)
  // Cache HMAC rounds so we don't recompute the same 32-byte block repeatedly.
  const rounds = new Map<number, Uint8Array>()
  const blockAt = async (roundIndex: number): Promise<Uint8Array> => {
    const cached = rounds.get(roundIndex)
    if (cached) return cached
    const buf = await hmacSha256(serverSeed, `${clientSeed}:${nonce}:${roundIndex}`)
    rounds.set(roundIndex, buf)
    return buf
  }
  const bytesAt = async (cursor: number): Promise<number[]> => {
    const roundIndex = Math.floor(cursor / 32)
    const byteOffset = cursor % 32
    const cur = await blockAt(roundIndex)
    if (byteOffset + 4 <= 32) {
      return [cur[byteOffset], cur[byteOffset + 1], cur[byteOffset + 2], cur[byteOffset + 3]]
    }
    const next = await blockAt(roundIndex + 1)
    const out: number[] = []
    for (let k = byteOffset; k < 32; k++) out.push(cur[k])
    for (let k = 0; out.length < 4; k++) out.push(next[k])
    return out
  }
  let cursor = 0
  for (let i = 51; i >= 1; i--) {
    const b = await bytesAt(cursor)
    cursor += 4
    const float =
      b[0] / 256 + b[1] / (256 * 256) + b[2] / (256 * 256 * 256) + b[3] / (256 * 256 * 256 * 256)
    const j = Math.floor(float * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

export function DragonTigerFairnessModal({
  open,
  onClose,
  requestVerifyId,
}: DragonTigerFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('')
  const [result, setResult] = useState<DragonTigerVerifyResult | null>(null)
  const [hashMatches, setHashMatches] = useState<boolean | null>(null)
  const [cardsMatch, setCardsMatch] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function runVerify(id: string) {
    const trimmed = id.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    setResult(null)
    setHashMatches(null)
    setCardsMatch(null)
    try {
      const r = await verifyDragonTiger(trimmed)
      setResult(r)
      // Seed only revealed after rotation; until then we can't check the hash or deck.
      if (r.serverSeed) {
        setHashMatches((await sha256Hex(r.serverSeed)) === r.serverSeedHash)
        try {
          const deck = await reDeriveDeck(r.serverSeed, r.clientSeed, r.nonce)
          setCardsMatch(deck[0] === r.dragonCard && deck[1] === r.tigerCard)
        } catch {
          setCardsMatch(null)
        }
      }
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

  const resultMatches =
    result != null &&
    ((): boolean => {
      const d = cardRank(result.dragonCard)
      const t = cardRank(result.tigerCard)
      const expected = d > t ? 'dragon' : t > d ? 'tiger' : 'tie'
      return expected === result.result
    })()

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="arcade2-scope max-h-[85vh] max-w-lg overflow-y-auto border-cyan-950 bg-[#050E16] text-slate-200">
        <DialogHeader>
          <DialogTitle className="arc-display uppercase tracking-wider">
            Provably Fair
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Persistent commitment + client-seed controls */}
          <ArcadeSeedControls open={open} />

          {/* Verify */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Verify a round</h3>
            <p className="text-xs text-slate-500">
              The deck is sealed from the server-seed hash above, committed before your bet.
              Rotate your seed to reveal it, then re-shuffle any past round here yourself.
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
                {cardsMatch !== null && (
                  <Check ok={cardsMatch} label="Both cards re-derive from the shuffled deck" />
                )}
                <Check ok={resultMatches} label="Higher card (ace low) decides the result" />
                {!result.seedRevealed && (
                  <p className="text-xs text-amber-300/80">
                    Server seed still committed — rotate your seed above to reveal it and
                    confirm the deck.
                  </p>
                )}
              </div>

              {/* The deal, re-derived */}
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                  The deal (re-derived)
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-14 text-[11px] text-slate-500">Dragon</span>
                  <MiniCard cardIdx={result.dragonCard} />
                  <span className="ml-1.5 text-[11px]" style={{ color: '#7be9fb' }}>
                    rank {cardRank(result.dragonCard) + 1}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="w-14 text-[11px] text-slate-500">Tiger</span>
                  <MiniCard cardIdx={result.tigerCard} />
                  <span className="ml-1.5 text-[11px]" style={{ color: '#fbd36b' }}>
                    rank {cardRank(result.tigerCard) + 1}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Field label="Server seed hash (committed)" value={result.serverSeedHash} />
                <Field
                  label="Server seed (revealed)"
                  value={result.serverSeed ?? 'Hidden until you rotate your seed'}
                />
                <Field label="Client seed" value={result.clientSeed} />
                <Field label="Nonce" value={String(result.nonce)} />
                <Field label="Recipe" value={result.recipe} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>
                  Result:{' '}
                  <span className="arc-mono capitalize text-cyan-300">
                    {resultLabel(result.result)}
                  </span>
                </span>
                <span>
                  Returned:{' '}
                  <span className={`arc-mono ${result.totalPayout > 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                    {result.totalPayout.toLocaleString()} MORBIUS
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
