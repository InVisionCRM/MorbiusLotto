'use client'

/**
 * PachinkoFairnessModal — provably-fair panel for chips Pachinko.
 *
 * Same conventions as the dice/keno/plinko modals: set or randomize your client
 * seed (used for the next drop), and verify any past round by id. Pachinko
 * settles instantly, so the server seed is published with every round — the
 * committed-hash check (sha256(serverSeed) === serverSeedHash) is recomputed
 * locally with WebCrypto, and the landing pocket is re-checked against the
 * server's recomputed pocket. A pocket map highlights where the ball landed.
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
  verifyPachinko,
  formatMultiplier,
  PACHINKO_CENTER,
  type PachinkoVerifyResult,
} from '@/lib/pachinko-client'

interface PachinkoFairnessModalProps {
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

export function PachinkoFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: PachinkoFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('')
  const [result, setResult] = useState<PachinkoVerifyResult | null>(null)
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
      const r = await verifyPachinko(trimmed)
      setResult(r)
      setHashMatches((await sha256Hex(r.serverSeed)) === r.serverSeedHash)
    } catch {
      setError('No round found with that ID.')
    } finally {
      setLoading(false)
    }
  }

  // Auto-verify when opened pointed at a specific round (history row / last drop).
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
              Mixed into every drop. Change it any time — the next drop uses the new value.
            </p>
            <div className="flex gap-2">
              <Input
                value={clientSeed}
                onChange={(e) => onClientSeedChange(e.target.value.slice(0, 128))}
                placeholder="Leave blank for a random seed each drop"
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
            <h3 className="text-sm font-semibold text-slate-200">Verify a drop</h3>
            <p className="text-xs text-slate-500">
              The pocket is drawn from a server seed committed (hashed) before your bet, revealed once
              the round settles. Verify re-derives it from the seeds.
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
                <Check
                  ok={result.pocket === result.recomputedPocket}
                  label="The landing pocket re-derives from the seed"
                />
                <Check
                  ok={result.payout === Math.floor((result.bet * result.multiplierX100) / 100)}
                  label="Payout reconciles with floor(bet × pocket multiplier)"
                />
              </div>

              {/* Pocket map — amber = where it landed. */}
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                  Pockets — amber = where it landed
                </div>
                <div className="flex flex-wrap gap-1">
                  {result.multX100.map((m, i) => {
                    const hit = i === result.pocket
                    return (
                      <span
                        key={i}
                        className={[
                          'arc-mono rounded px-1.5 py-0.5 text-[11px] tabular-nums',
                          hit
                            ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/50'
                            : 'bg-[#081420] text-slate-400 ring-1 ring-cyan-500/10',
                        ].join(' ')}
                      >
                        {i === PACHINKO_CENTER ? 'JACK' : formatMultiplier(m)}
                      </span>
                    )
                  })}
                </div>
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
                  Bet: <span className="arc-mono text-slate-200">{result.bet.toLocaleString()}</span>
                </span>
                <span>
                  Pocket:{' '}
                  <span className="arc-mono text-cyan-300">
                    {result.pocket === PACHINKO_CENTER ? 'Jackpot' : formatMultiplier(result.multiplierX100)}
                  </span>
                </span>
                <span>
                  Returned:{' '}
                  <span className={`arc-mono ${result.payout >= result.bet ? 'text-amber-300' : 'text-rose-400'}`}>
                    {result.payout.toLocaleString()} chips
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
