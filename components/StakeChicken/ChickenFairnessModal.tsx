'use client';

/**
 * ChickenFairnessModal — provably-fair panel for chips Chicken (/chicken).
 * Mirrors TowersFairnessModal. Recomputes locally what it can from the revealed
 * payload:
 *   1. sha256(serverSeed) === serverSeedHash (commitment)
 *   2. the revealed bumpers are consistent with the recorded outcome
 *      (a win avoided every bumper it crossed; a bust crossed safely then
 *      stepped into the bumper on its final lane)
 *   3. the payout reconciles with floor(bet × multiplier) (0 on a bust)
 * The full bumper-derivation recipe is shown so anyone can reproduce it.
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { verifyChicken, formatMultiplier, type ChickenVerifyResult } from '@/lib/chicken-client';

interface ChickenFairnessModalProps {
  open: boolean;
  onClose: () => void;
  clientSeed: string;
  onClientSeedChange: (seed: string) => void;
  requestVerifyId: string | null;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="arc-mono break-all rounded-md bg-[#081420] px-2 py-1 text-xs text-slate-300">{value}</div>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? 'text-cyan-300' : 'text-rose-400'}>{ok ? '✓' : '✗'}</span>
      <span className="text-slate-300">{label}</span>
    </div>
  );
}

/** Lane strip of the finished round: bumpers rose (the killer brightest), crossed lanes cyan. */
function LaneMap({ result }: { result: ChickenVerifyResult }) {
  const bumpers = new Set(result.bumperLanes);
  const bustLane = result.won ? -1 : result.lane;
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: result.lanes }, (_, i) => {
        const isBumper = bumpers.has(i);
        const isHit = i === bustLane;
        const crossed = i < result.lane;
        const cls = isHit
          ? 'bg-rose-500/30 text-rose-200 ring-rose-400/70'
          : isBumper
            ? 'bg-rose-500/10 text-rose-400 ring-rose-900/60'
            : crossed
              ? 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/40'
              : 'bg-[#081420] text-slate-600 ring-cyan-950';
        return (
          <span
            key={i}
            title={`Lane ${i + 1}`}
            className={`arc-mono inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold ring-1 ${cls}`}
          >
            {isBumper ? '✸' : crossed ? '✓' : ''}
          </span>
        );
      })}
    </div>
  );
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomClientSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A win avoided every bumper it crossed; a bust crossed safely then hit lane = bust. */
function outcomeConsistent(r: ChickenVerifyResult): boolean {
  const bumpers = new Set(r.bumperLanes);
  for (let i = 0; i < r.lane; i++) {
    if (bumpers.has(i)) return false;
  }
  return r.won ? true : bumpers.has(r.lane);
}

export function ChickenFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: ChickenFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('');
  const [result, setResult] = useState<ChickenVerifyResult | null>(null);
  const [hashMatches, setHashMatches] = useState<boolean | null>(null);
  const [bumpersMatch, setBumpersMatch] = useState<boolean | null>(null);
  const [payoutMatches, setPayoutMatches] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runVerify(id: string) {
    const trimmed = id.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setHashMatches(null);
    setBumpersMatch(null);
    setPayoutMatches(null);
    try {
      const r = await verifyChicken(trimmed);
      setResult(r);
      setHashMatches((await sha256Hex(r.serverSeed)) === r.serverSeedHash);
      setBumpersMatch(outcomeConsistent(r));
      const expected = r.won ? Math.floor((r.bet * r.multiplierX100) / 100) : 0;
      setPayoutMatches(expected === r.payout);
    } catch {
      setError('No settled round found with that ID.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && requestVerifyId) {
      setVerifyId(requestVerifyId);
      void runVerify(requestVerifyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requestVerifyId]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="arcade2-scope max-h-[85vh] max-w-lg overflow-y-auto border-cyan-950 bg-[#050E16] text-slate-200">
        <DialogHeader>
          <DialogTitle className="arc-display uppercase tracking-wider text-cyan-300">Provably Fair</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Your client seed</h3>
            <p className="text-xs text-slate-500">
              Mixed into every crossing. Change it any time — the next round uses the new value.
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

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Verify a round</h3>
            <p className="text-xs text-slate-500">
              Every lane is sealed from a server seed committed (hashed) before your bet — the seed
              is revealed once the round settles.
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
                className="shrink-0 bg-cyan-600 text-white hover:bg-cyan-400 hover:text-[#03121B]"
              >
                {loading ? 'Checking…' : 'Verify'}
              </Button>
            </div>
          </section>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          {result && (
            <section className="space-y-3 rounded-lg border border-cyan-950 bg-[#07131F]/70 p-3">
              <div className="space-y-1.5">
                {hashMatches !== null && (
                  <Check ok={hashMatches} label="Server seed matches its committed hash (checked locally)" />
                )}
                {bumpersMatch !== null && (
                  <Check ok={bumpersMatch} label="Revealed traffic matches the recorded outcome (checked locally)" />
                )}
                {payoutMatches !== null && (
                  <Check ok={payoutMatches} label="Payout reconciles with floor(bet × multiplier)" />
                )}
              </div>

              <div>
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">Outcome map</div>
                <LaneMap result={result} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  Difficulty: <span className="arc-mono capitalize text-slate-300">{result.difficulty}</span>
                </span>
                <span>
                  Lanes crossed: <span className="arc-mono text-slate-300">{result.lane} / {result.lanes}</span>
                </span>
                <span>
                  Bumper lanes: <span className="arc-mono text-rose-400">[{result.bumperLanes.join(', ')}]</span>
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Field label="Server seed hash (committed)" value={result.serverSeedHash} />
                <Field label="Server seed (revealed)" value={result.serverSeed} />
                <Field label="Client seed" value={result.clientSeed} />
                <Field label="Nonce" value={String(result.nonce)} />
                <Field label="Recipe" value={result.recipe} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  Bet: <span className="arc-mono text-slate-300">{result.bet.toLocaleString()}</span>
                </span>
                <span>
                  Result: <span className="arc-mono font-bold text-slate-200">{result.won ? 'Win' : 'Splat'}</span>
                </span>
                <span>
                  Multiplier:{' '}
                  <span className="arc-mono text-cyan-300">
                    {result.won ? formatMultiplier(result.multiplierX100) : '—'}
                  </span>
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
  );
}
