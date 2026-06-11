'use client'

/**
 * KenoFairnessModal — provably-fair panel.
 *
 * Two jobs:
 *   1. Let the player set their own client seed (used for the next round's draw).
 *   2. Verify any past round by id — fetches /api/keno/verify/:id, re-derives the
 *      10 drawn numbers from the published seeds, and shows whether the server's
 *      committed hash, draw, and payout all reconcile.
 *
 * The last played round's seeds are passed in so "Verify last round" is one tap.
 */

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { verifyKeno, formatMultiplier, type KenoVerifyResult } from '@/lib/keno-client'

interface KenoFairnessModalProps {
  open: boolean
  onClose: () => void
  clientSeed: string
  onClientSeedChange: (seed: string) => void
  lastRoundId: string | null
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="break-all rounded-md bg-slate-900/70 px-2 py-1 font-mono text-xs text-slate-300">
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

export function KenoFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  lastRoundId,
}: KenoFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('')
  const [result, setResult] = useState<KenoVerifyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function runVerify(id: string) {
    const trimmed = id.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await verifyKeno(trimmed))
    } catch {
      setError('No round found with that ID.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg border-slate-800 bg-slate-950 text-slate-200">
        <DialogHeader>
          <DialogTitle>Provably Fair</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Client seed */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Your client seed</h3>
            <p className="text-xs text-slate-500">
              Mixed into every draw. Change it any time — the next round uses the new value.
            </p>
            <Input
              value={clientSeed}
              onChange={(e) => onClientSeedChange(e.target.value.slice(0, 128))}
              placeholder="Leave blank for a random seed each round"
              className="border-slate-700 bg-slate-900 font-mono text-xs"
            />
          </section>

          {/* Verify */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Verify a round</h3>
            <p className="text-xs text-slate-500">
              Each round commits a hashed server seed up front and reveals it after. We
              re-derive the draw from the published seeds so you can confirm nothing moved.
            </p>
            <div className="flex gap-2">
              <Input
                value={verifyId}
                onChange={(e) => setVerifyId(e.target.value)}
                placeholder="Round ID"
                className="border-slate-700 bg-slate-900 font-mono text-xs"
              />
              <Button
                onClick={() => runVerify(verifyId)}
                disabled={loading}
                className="shrink-0 bg-cyan-600 hover:bg-cyan-500"
              >
                Verify
              </Button>
            </div>
            {lastRoundId && (
              <button
                type="button"
                onClick={() => {
                  setVerifyId(lastRoundId)
                  void runVerify(lastRoundId)
                }}
                className="text-xs text-cyan-400 hover:underline"
              >
                Verify last round
              </button>
            )}
          </section>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {result && (
            <section className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <div className="space-y-1.5">
                <Check ok={result.verification.hashMatches} label="Server seed matches its committed hash" />
                <Check ok={result.verification.drawMatches} label="Drawn numbers re-derive exactly" />
                <Check ok={result.verification.payoutMatches} label="Hits & payout reconcile" />
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Field label="Server seed" value={result.serverSeed} />
                <Field label="Server seed hash" value={result.serverSeedHash} />
                <Field label="Client seed" value={result.clientSeed} />
                <Field label="Nonce" value={String(result.nonce)} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>Drawn: <span className="font-mono text-slate-200">{result.drawn.join(', ')}</span></span>
                <span>Hits: <span className="text-slate-200">{result.hits}</span></span>
                <span>Payout: <span className="text-amber-300">{result.payout} chips</span> ({formatMultiplier(result.multiplierX100)})</span>
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
