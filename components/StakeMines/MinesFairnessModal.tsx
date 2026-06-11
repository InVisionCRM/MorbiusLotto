'use client'

/**
 * MinesFairnessModal — provably-fair panel for chips Mines.
 *
 * Two jobs:
 *   1. Let the player set their own client seed (used for the next round's
 *      bomb grid).
 *   2. Verify any past round by id — fetches /api/arcade/mines/verify/:id and
 *      shows the published seeds, the bomb grid, and the derivation recipe.
 *      The committed-hash check (sha256(serverSeed) === serverSeedHash) is
 *      recomputed locally with WebCrypto so the proof doesn't rely on the
 *      server grading its own homework.
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
import {
  verifyMines,
  formatMultiplier,
  MINES_TOTAL_CELLS,
  type MinesVerifyResult,
} from '@/lib/mines-client'

interface MinesFairnessModalProps {
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

/** Mini 5×5 map of the finalized round: bombs in rose, picked gems in cyan. */
function GridMap({ bombsGrid, picks }: { bombsGrid: number[]; picks: number[] }) {
  const bombSet = new Set(bombsGrid)
  const pickSet = new Set(picks)
  return (
    <div className="grid w-fit grid-cols-5 gap-1">
      {Array.from({ length: MINES_TOTAL_CELLS }, (_, i) => {
        const isBomb = bombSet.has(i)
        const isPick = pickSet.has(i)
        return (
          <span
            key={i}
            title={`Cell ${i + 1}`}
            className={[
              'arc-mono inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold ring-1',
              isBomb
                ? isPick
                  ? 'bg-rose-500/30 text-rose-200 ring-rose-400/70'
                  : 'bg-rose-500/10 text-rose-400 ring-rose-900/60'
                : isPick
                  ? 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/40'
                  : 'bg-[#081420] text-slate-600 ring-cyan-950',
            ].join(' ')}
          >
            {isBomb ? '✸' : isPick ? '◆' : ''}
          </span>
        )
      })}
    </div>
  )
}

export function MinesFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: MinesFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('')
  const [result, setResult] = useState<MinesVerifyResult | null>(null)
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
      const r = await verifyMines(trimmed)
      setResult(r)
      if (r.serverSeed) {
        setHashMatches((await sha256Hex(r.serverSeed)) === r.serverSeedHash)
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
              Mixed into the bomb grid of every round you start. Change it any time — the
              next round uses the new value.
            </p>
            <Input
              value={clientSeed}
              onChange={(e) => onClientSeedChange(e.target.value.slice(0, 128))}
              placeholder="Leave blank for a random seed each round"
              className="arc-mono border-cyan-950 bg-[#081420] text-xs"
            />
          </section>

          {/* Verify */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Verify a round</h3>
            <p className="text-xs text-slate-500">
              Each round commits a hashed server seed before your first pick and reveals
              the seed once the round ends, so you can confirm the bombs were fixed up
              front and never moved.
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
              {result.status === 'active' ? (
                <p className="text-sm text-slate-400">
                  This round is still active — the server seed and bomb grid stay sealed
                  until it ends. Only the commitment hash is published for now.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {hashMatches !== null && (
                    <Check
                      ok={hashMatches}
                      label="Server seed matches its committed hash (checked locally)"
                    />
                  )}
                </div>
              )}

              {result.bombsGrid && (
                <GridMap bombsGrid={result.bombsGrid} picks={result.picks} />
              )}

              <div className="grid grid-cols-1 gap-2">
                <Field label="Server seed hash (committed)" value={result.serverSeedHash} />
                {result.serverSeed && <Field label="Server seed (revealed)" value={result.serverSeed} />}
                <Field label="Client seed" value={result.clientSeed} />
                <Field label="Nonce" value={String(result.nonce)} />
                <Field label="Recipe" value={result.recipe} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>
                  Bet: <span className="arc-mono text-slate-200">{result.bet.toLocaleString()}</span>
                </span>
                <span>
                  Mines: <span className="arc-mono text-rose-300">{result.bombs}</span>
                </span>
                <span>
                  Result:{' '}
                  {result.status === 'cashed_out' ? (
                    <span className="arc-mono text-amber-300">
                      {result.payout.toLocaleString()} chips ({formatMultiplier(result.multiplierX100)})
                    </span>
                  ) : (
                    <span className="arc-mono text-rose-400">{result.status}</span>
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
