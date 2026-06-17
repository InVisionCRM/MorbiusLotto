'use client';

/**
 * FirewalkFairnessModal — provably-fair panel for chips Firewalk (/firewalk).
 * Mirrors ChickenFairnessModal. Recomputes locally what it can from the revealed
 * payload:
 *   1. sha256(serverSeed) === serverSeedHash (commitment)
 *   2. the revealed crumble stones are consistent with the recorded outcome
 *      (a win crossed only safe stones; a bust crossed safely then fell through
 *      the crumbling stone at `position`)
 *   3. the payout reconciles with floor(bet × multiplier) (0 on a bust)
 * The full crumble-derivation recipe is shown so anyone can reproduce it.
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { verifyFirewalk, formatMultiplier, type FirewalkVerifyResult } from '@/lib/firewalk-client';

interface FirewalkFairnessModalProps {
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

/** Stone strip of the finished round: crumbles amber (the killer rose), crossed cyan. */
function StoneMap({ result }: { result: FirewalkVerifyResult }) {
  const crumbles = new Set(result.crumbleStones);
  const fellAt = result.won ? -1 : result.position;
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from({ length: result.stones }, (_, i) => {
        const stone = i + 1;
        const isCrumble = crumbles.has(stone);
        const isHit = stone === fellAt;
        const crossed = stone <= result.position && !isHit;
        const cls = isHit
          ? 'bg-rose-500/30 text-rose-200 ring-rose-400/70'
          : isCrumble
            ? 'bg-amber-500/15 text-amber-300 ring-amber-500/45'
            : crossed
              ? 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/40'
              : 'bg-[#081420] text-slate-600 ring-cyan-950';
        return (
          <span
            key={stone}
            title={`Stone ${stone}`}
            className={`arc-mono inline-flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold ring-1 ${cls}`}
          >
            {isCrumble ? '✸' : crossed ? '✓' : ''}
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

/** A win crossed only safe stones; a bust crossed safely then fell at `position`. */
function outcomeConsistent(r: FirewalkVerifyResult): boolean {
  const crumbles = new Set(r.crumbleStones);
  if (r.won) {
    for (let s = 1; s <= r.position; s++) {
      if (crumbles.has(s)) return false;
    }
    return true;
  }
  // Bust: every stone before `position` was safe, and `position` crumbled.
  for (let s = 1; s < r.position; s++) {
    if (crumbles.has(s)) return false;
  }
  return crumbles.has(r.position);
}

export function FirewalkFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: FirewalkFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('');
  const [result, setResult] = useState<FirewalkVerifyResult | null>(null);
  const [hashMatches, setHashMatches] = useState<boolean | null>(null);
  const [stonesMatch, setStonesMatch] = useState<boolean | null>(null);
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
    setStonesMatch(null);
    setPayoutMatches(null);
    try {
      const r = await verifyFirewalk(trimmed);
      setResult(r);
      setHashMatches((await sha256Hex(r.serverSeed)) === r.serverSeedHash);
      setStonesMatch(outcomeConsistent(r));
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
              Mixed into every walk. Change it any time — the next round uses the new value.
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
            <h3 className="text-sm font-semibold text-slate-200">Verify a walk</h3>
            <p className="text-xs text-slate-500">
              Every stone is sealed from a server seed committed (hashed) before your bet — the seed
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
                {stonesMatch !== null && (
                  <Check ok={stonesMatch} label="Revealed crumbling stones match the recorded walk (checked locally)" />
                )}
                {payoutMatches !== null && (
                  <Check ok={payoutMatches} label="Payout reconciles with floor(bet × multiplier)" />
                )}
              </div>

              <div>
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">The path — amber = crumble</div>
                <StoneMap result={result} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  Heat: <span className="arc-mono capitalize text-slate-300">{result.heat}</span>
                </span>
                <span>
                  Stones crossed: <span className="arc-mono text-slate-300">{result.position} / {result.stones}</span>
                </span>
                <span>
                  Crumble stones: <span className="arc-mono text-amber-300">[{result.crumbleStones.join(', ')}]</span>
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
                  Result: <span className="arc-mono font-bold text-slate-200">{result.won ? 'Cashed' : 'Burned'}</span>
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
                    {result.payout.toLocaleString()} chips
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
