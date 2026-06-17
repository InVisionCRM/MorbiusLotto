'use client'

/**
 * CascadeFairnessModal — provably-fair panel for chips Cascade.
 *
 * Same conventions as the dice/keno/mines modals: set or randomize your client
 * seed (used for the next drop), and verify any past round by id. Cascade
 * settles instantly, so the server seed is published with every round — the
 * committed-hash check (sha256(serverSeed) === serverSeedHash) is recomputed
 * locally with WebCrypto, and the ENTIRE cascade is re-derived server-side from
 * the published seeds; we show the re-derived total + chain breakdown and
 * confirm it matches the stored result.
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
  verifyCascade,
  formatMultiplierX100,
  formatCombo,
  type CascadeVerifyResult,
} from '@/lib/cascade-client'

interface CascadeFairnessModalProps {
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

export function CascadeFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: CascadeFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('')
  const [result, setResult] = useState<CascadeVerifyResult | null>(null)
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
      const r = await verifyCascade(trimmed)
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

  const totalMatches =
    result != null &&
    result.recomputedMultiplierX100 != null &&
    result.recomputedMultiplierX100 === result.multiplierX100

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
              Mixed into every drop. Change it any time — the next round uses the new value.
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
              Every gem is drawn from a server seed committed (hashed) before your bet — the seed is
              revealed once the round settles, and the entire cascade re-derives from it.
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
                  ok={totalMatches}
                  label="Cascade re-runs from the seed to the same multiplier"
                />
                <Check
                  ok={result.payout === Math.floor((result.bet * result.multiplierX100) / 100)}
                  label="Payout reconciles with floor(bet × multiplier)"
                />
              </div>

              {/* Chain breakdown (re-derived) */}
              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                  Chain breakdown (re-derived)
                </div>
                {result.chainLog.length === 0 ? (
                  <p className="text-xs text-slate-500">No clusters formed — the drop fizzled.</p>
                ) : (
                  <div className="space-y-1">
                    {result.chainLog.map((t) => (
                      <div
                        key={t.chain}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="arc-mono w-16 shrink-0 text-slate-500">
                          chain {t.chain}
                        </span>
                        <span className="arc-mono w-14 shrink-0 text-cyan-300">
                          {formatCombo(t.comboX100)}
                        </span>
                        <span className="arc-mono ml-auto text-slate-300">
                          {formatMultiplierX100(t.winX100)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>
                  Volatility:{' '}
                  <span className="arc-mono capitalize text-slate-200">{result.volatility}</span>
                </span>
                <span>
                  Chains: <span className="arc-mono text-cyan-300">{result.clusters}</span>
                </span>
                <span>
                  Total:{' '}
                  <span className={`arc-mono ${result.won ? 'text-cyan-300' : 'text-rose-400'}`}>
                    {formatMultiplierX100(result.multiplierX100)}
                  </span>
                </span>
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
                  Returned:{' '}
                  {result.won ? (
                    <span className="arc-mono text-amber-300">
                      {result.payout.toLocaleString()} chips
                    </span>
                  ) : (
                    <span className="arc-mono text-rose-400">0 chips</span>
                  )}
                </span>
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
