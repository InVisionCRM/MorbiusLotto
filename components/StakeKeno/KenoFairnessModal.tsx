'use client'

/**
 * KenoFairnessModal — provably-fair panel.
 *
 * Keno's server seed is now a PERSISTENT per-wallet commitment (see
 * ArcadeSeedControls): its hash is published before you bet and revealed only
 * when you rotate. This modal shows that commitment + client seed controls, and
 * verifies any past round by id — fetching /api/keno/verify/:id and re-deriving
 * the 10 drawn numbers from the published seeds. Until the round's seed has been
 * rotated-revealed the round shows only its commitment.
 *
 * `requestVerifyId` lets callers (the "Verify last round" link, history rows)
 * open the modal already pointed at a round — it auto-runs once per change.
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
import { verifyKeno, formatMultiplier, type KenoVerifyResult } from '@/lib/keno-client'

interface KenoFairnessModalProps {
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

export function KenoFairnessModal({
  open,
  onClose,
  requestVerifyId,
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

  // Auto-verify when opened pointed at a specific round (last round / history row).
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
          {/* Persistent commitment + client-seed controls */}
          <ArcadeSeedControls open={open} />

          {/* Verify */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Verify a round</h3>
            <p className="text-xs text-slate-500">
              Every draw is fixed by the server-seed hash above, committed before you bet.
              Rotate your seed to reveal it, then we re-derive the draw from the published
              seeds so you can confirm nothing moved.
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
                {result.serverSeed && (
                  <>
                    <Check ok={result.verification.hashMatches} label="Server seed matches its committed hash" />
                    <Check ok={result.verification.drawMatches} label="Drawn numbers re-derive exactly" />
                    <Check ok={result.verification.payoutMatches} label="Hits & payout reconcile" />
                  </>
                )}
                {!result.seedRevealed && (
                  <p className="text-xs text-amber-300/80">
                    Server seed still committed — rotate your seed above to reveal it and
                    confirm the draw.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                <Field
                  label="Server seed (revealed)"
                  value={result.serverSeed ?? 'Hidden until you rotate your seed'}
                />
                <Field label="Server seed hash (committed)" value={result.serverSeedHash} />
                <Field label="Client seed" value={result.clientSeed} />
                <Field label="Nonce" value={String(result.nonce)} />
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>
                  Drawn: <span className="arc-mono text-slate-200">{result.drawn.join(', ')}</span>
                </span>
                <span>
                  Hits: <span className="arc-mono text-slate-200">{result.hits}</span>
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
