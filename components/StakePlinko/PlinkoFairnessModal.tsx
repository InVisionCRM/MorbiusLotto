'use client'

/**
 * PlinkoFairnessModal — provably-fair panel for chips Plinko.
 *
 * Two jobs:
 *   1. Let the player set their own client seed (used for the next ball's path).
 *   2. Verify any past ball by id — fetches /api/plinko/verify/:id, re-derives
 *      the 16 left/right steps from the published seeds, and shows whether the
 *      server's committed hash, path, and payout all reconcile.
 *
 * `requestVerifyId` lets callers (history rows, the controls-rail link) open
 * the modal already pointed at a round — it auto-runs once per change.
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
import { verifyPlinko, formatMultiplier, type PlinkoVerifyResult } from '@/lib/plinko-client'

interface PlinkoFairnessModalProps {
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

/** The 16 steps as compact L/R pips, ending at the bucket. */
function PathPips({ path, bucket }: { path: number[]; bucket: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {path.map((step, i) => (
        <span
          key={i}
          className={`arc-mono inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold ${
            step === 1
              ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/40'
              : 'bg-[#081420] text-slate-500 ring-1 ring-cyan-950'
          }`}
        >
          {step === 1 ? 'R' : 'L'}
        </span>
      ))}
      <span className="arc-mono ml-1 text-xs text-amber-300">→ bucket {bucket}</span>
    </div>
  )
}

/** 16 random bytes → 32-char hex, generated locally with WebCrypto. */
function randomClientSeed(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function PlinkoFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: PlinkoFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('')
  const [result, setResult] = useState<PlinkoVerifyResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function runVerify(id: string) {
    const trimmed = id.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      setResult(await verifyPlinko(trimmed))
    } catch {
      setError('No round found with that ID.')
    } finally {
      setLoading(false)
    }
  }

  // Auto-verify when opened pointed at a specific ball (history row / last ball).
  useEffect(() => {
    if (open && requestVerifyId) {
      setVerifyId(requestVerifyId)
      void runVerify(requestVerifyId)
    }
  }, [open, requestVerifyId])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="arcade2-scope max-h-[85vh] max-w-lg overflow-y-auto border-cyan-950 bg-[#050E16] text-slate-200">
        <DialogHeader>
          <DialogTitle className="arc-display uppercase tracking-wider">
            Provably Fair
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Client seed */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Your client seed</h3>
            <p className="text-xs text-slate-500">
              Mixed into every ball&apos;s path. Change it any time — the next ball uses the
              new value.
            </p>
            <div className="flex gap-2">
              <Input
                value={clientSeed}
                onChange={(e) => onClientSeedChange(e.target.value.slice(0, 128))}
                placeholder="Leave blank for a random seed each ball"
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
            <h3 className="text-sm font-semibold text-slate-200">Verify a ball</h3>
            <p className="text-xs text-slate-500">
              Each ball commits a hashed server seed up front and reveals it after. We
              re-derive the 16 left/right steps from the published seeds so you can confirm
              nothing moved.
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
                <Check ok={result.verification.hashMatches} label="Server seed matches its committed hash" />
                <Check ok={result.verification.pathMatches} label="Path re-derives exactly" />
                <Check ok={result.verification.payoutMatches} label="Bucket & payout reconcile" />
              </div>
              <PathPips path={result.path} bucket={result.bucket} />
              <div className="grid grid-cols-1 gap-2">
                <Field label="Server seed" value={result.serverSeed} />
                <Field label="Server seed hash" value={result.serverSeedHash} />
                <Field label="Client seed" value={result.clientSeed} />
                <Field label="Nonce" value={String(result.nonce)} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>
                  Bet: <span className="arc-mono text-slate-200">{result.bet.toLocaleString()}</span>
                </span>
                <span>
                  Payout:{' '}
                  <span className="arc-mono text-amber-300">{result.payout.toLocaleString()} MORBIUS</span>{' '}
                  ({formatMultiplier(result.multiplierX100)})
                </span>
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
