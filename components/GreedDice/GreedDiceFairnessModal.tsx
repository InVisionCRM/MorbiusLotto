'use client';

/**
 * GreedDiceFairnessModal — provably-fair panel for chips Greed Dice. Mirrors
 * ChickenFairnessModal. Recomputes locally what it can from the revealed payload:
 *   1. sha256(serverSeed) === serverSeedHash (commitment)
 *   2. every die in the roll log re-derives from the HMAC byte stream
 *      (faces consumed in roll order at cursor = k*4)
 *   3. the recorded points & payout reconcile with the scoring rules + scale
 * The full roll-by-roll replay is shown (cyan = scored dice) so anyone can
 * reproduce the turn.
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  verifyGreedDice,
  formatMultiplier,
  type GreedDiceVerifyResult,
} from '@/lib/greed-dice-client';

interface GreedDiceFairnessModalProps {
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

/**
 * Client-side mirror of ProvablyFairService.hmacByteStream: 4 bytes from a
 * cursor-indexed HMAC-SHA256 stream keyed by serverSeed over
 * `${clientSeed}:${nonce}:${floor(cursor/32)}`, handling the 32-byte boundary.
 */
async function hmacByteStream(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  cursor: number,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(serverSeed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const round = async (roundIndex: number) =>
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, enc.encode(`${clientSeed}:${nonce}:${roundIndex}`)),
    );
  const roundIndex = Math.floor(cursor / 32);
  const byteOffset = cursor % 32;
  const buf = await round(roundIndex);
  if (byteOffset + 4 <= 32) return buf.subarray(byteOffset, byteOffset + 4);
  const next = await round(roundIndex + 1);
  const head = buf.subarray(byteOffset, 32);
  const tail = next.subarray(0, 4 - (32 - byteOffset));
  const out = new Uint8Array(4);
  out.set(head, 0);
  out.set(tail, head.length);
  return out;
}

function bytesToFloat(b: Uint8Array): number {
  return b[0] / 256 + b[1] / 65536 + b[2] / 16777216 + b[3] / 4294967296;
}

/** Re-derive every die face from the seed stream and compare to the roll log. */
async function diceReDerive(r: GreedDiceVerifyResult): Promise<boolean> {
  let k = 0;
  for (const roll of r.rollLog) {
    for (let i = 0; i < roll.dice.length; i++) {
      const bytes = await hmacByteStream(r.serverSeed, r.clientSeed, r.nonce, k * 4);
      const face = 1 + Math.min(5, Math.floor(bytesToFloat(bytes) * 6));
      if (face !== roll.dice[i]) return false;
      k++;
    }
  }
  return true;
}

export function GreedDiceFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: GreedDiceFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('');
  const [result, setResult] = useState<GreedDiceVerifyResult | null>(null);
  const [hashMatches, setHashMatches] = useState<boolean | null>(null);
  const [diceMatch, setDiceMatch] = useState<boolean | null>(null);
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
    setDiceMatch(null);
    setPayoutMatches(null);
    try {
      const r = await verifyGreedDice(trimmed);
      setResult(r);
      setHashMatches((await sha256Hex(r.serverSeed)) === r.serverSeedHash);
      setDiceMatch(await diceReDerive(r));
      const expectedMult = Math.round((r.points / r.scale) * 100);
      const expectedPayout = r.won ? Math.floor((r.bet * expectedMult) / 100) : 0;
      setPayoutMatches(expectedMult === r.multiplierX100 && expectedPayout === r.payout);
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
              Mixed into every roll. Change it any time — the next turn uses the new value.
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
              Every die face is drawn from a server seed committed (hashed) before your bet — the seed
              is revealed once the round settles, and the whole turn re-derives roll-for-roll.
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
                {diceMatch !== null && (
                  <Check ok={diceMatch} label="Every die re-derives from the seed stream (checked locally)" />
                )}
                {payoutMatches !== null && (
                  <Check ok={payoutMatches} label="Points & payout reconcile with the scoring rules" />
                )}
              </div>

              <div>
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">
                  Turn replay — cyan dice scored
                </div>
                <div className="space-y-1.5">
                  {result.rollLog.length === 0 ? (
                    <p className="text-xs text-slate-500">No rolls recorded.</p>
                  ) : (
                    result.rollLog.map((roll, i) => {
                      const kept = new Set(roll.kept);
                      return (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="arc-mono w-12 shrink-0 text-slate-500">roll {i + 1}</span>
                          <div className="flex flex-wrap gap-1">
                            {roll.dice.map((v, j) => (
                              <span
                                key={j}
                                className={`arc-mono inline-flex h-4 w-4 items-center justify-center rounded text-[10px] ${
                                  kept.has(j)
                                    ? 'text-cyan-300 ring-1 ring-cyan-500/40'
                                    : 'bg-[#081420] text-slate-400 ring-1 ring-cyan-950'
                                }`}
                              >
                                {v}
                              </span>
                            ))}
                          </div>
                          <span
                            className={`arc-mono ml-auto shrink-0 ${
                              roll.points > 0 ? 'text-cyan-300' : 'text-rose-400'
                            }`}
                          >
                            {roll.points > 0 ? `+${roll.points}${roll.hot ? ' ↻' : ''}` : 'farkle'}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  Dice: <span className="arc-mono text-slate-300">{result.diceCount}</span>
                </span>
                <span>
                  Rolls: <span className="arc-mono text-slate-300">{result.rollLog.length}</span>
                </span>
                <span>
                  Result:{' '}
                  <span className={`arc-mono font-bold ${result.won ? 'text-cyan-300' : 'text-slate-200'}`}>
                    {result.won ? `Banked ${result.points} pts` : 'Farkle'}
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

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  Bet: <span className="arc-mono text-slate-300">{result.bet.toLocaleString()}</span>
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
