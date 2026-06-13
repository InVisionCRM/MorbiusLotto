'use client';

/**
 * HiLoFairnessModal — provably-fair panel for chips Hi-Lo (/hilo).
 * Recomputes everything locally:
 *   1. sha256(serverSeed) === serverSeedHash (commitment) — once the round is
 *      finished and the seed is revealed (active rounds hide it).
 *   2. the multiplier ladder re-walks from the revealed card ranks + picks
 *   3. the payout reconciles with floor(bet × multiplier)
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  verifyHiLo,
  hiLoMultiplierWalkX100,
  hiLoPayoutPreview,
  hiLoRankLabel,
  hiLoSuitGlyph,
  hiLoSuitIsRed,
  formatMultiplier,
  type HiLoVerifyResult,
} from '@/lib/hilo-client';

interface HiLoFairnessModalProps {
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
      <div className="break-all rounded-md bg-[#081420] px-2 py-1 font-mono text-xs text-slate-300">
        {value}
      </div>
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

export function HiLoFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: HiLoFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('');
  const [result, setResult] = useState<HiLoVerifyResult | null>(null);
  const [hashMatches, setHashMatches] = useState<boolean | null>(null);
  const [multMatches, setMultMatches] = useState<boolean | null>(null);
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
    setMultMatches(null);
    setPayoutMatches(null);
    try {
      const r = await verifyHiLo(trimmed);
      setResult(r);
      setHashMatches(r.serverSeed ? (await sha256Hex(r.serverSeed)) === r.serverSeedHash : null);
      const walk = hiLoMultiplierWalkX100(r.cards.map((c) => c.rank), r.picks, r.houseEdgeBp);
      const finalMult = walk.length > 0 ? walk[walk.length - 1] : 100;
      setMultMatches(finalMult === r.multiplierX100);
      const expected = r.status === 'cashed_out' ? hiLoPayoutPreview(r.bet, r.multiplierX100) : 0;
      setPayoutMatches(expected === r.payout);
    } catch {
      setError('No round found with that ID.');
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
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto border-cyan-950 bg-[#050E16] text-slate-200">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-wider text-cyan-300">Provably Fair</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
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
                className="border-cyan-950 bg-[#081420] font-mono text-xs"
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
              Cards come from a deck shuffled with a server seed committed (hashed) before your bet —
              the seed is revealed once the round ends.
            </p>
            <div className="flex gap-2">
              <Input
                value={verifyId}
                onChange={(e) => setVerifyId(e.target.value)}
                placeholder="Round ID"
                className="border-cyan-950 bg-[#081420] font-mono text-xs"
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
                {hashMatches !== null ? (
                  <Check ok={hashMatches} label="Server seed matches its committed hash (checked locally)" />
                ) : (
                  <p className="text-xs text-slate-500">Server seed is revealed once the round ends.</p>
                )}
                {multMatches !== null && (
                  <Check ok={multMatches} label="Multiplier ladder re-walks from the revealed cards" />
                )}
                {payoutMatches !== null && (
                  <Check ok={payoutMatches} label="Payout reconciles with floor(bet × multiplier)" />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {result.cards.map((c, i) => (
                  <span
                    key={i}
                    className={`arc-mono rounded bg-slate-100 px-1 text-xs font-bold ${
                      hiLoSuitIsRed(c.suit) ? 'text-red-600' : 'text-slate-900'
                    }`}
                  >
                    {hiLoRankLabel(c.rank)}
                    {hiLoSuitGlyph(c.suit)}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Field label="Server seed hash (committed)" value={result.serverSeedHash} />
                <Field label="Server seed (revealed)" value={result.serverSeed ?? '— hidden until the round ends'} />
                <Field label="Client seed" value={result.clientSeed} />
                <Field label="Nonce" value={String(result.nonce)} />
                <Field label="Recipe" value={result.recipe} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  Result:{' '}
                  <span className="font-mono font-bold text-slate-200">
                    {result.status === 'cashed_out' ? 'Cashed out' : result.status === 'busted' ? 'Busted' : 'Active'}
                  </span>
                </span>
                <span>
                  Multiplier: <span className="font-mono text-cyan-300">{formatMultiplier(result.multiplierX100)}</span>
                </span>
                <span>
                  Returned:{' '}
                  <span className={`font-mono ${result.payout > 0 ? 'text-amber-300' : 'text-rose-400'}`}>
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
