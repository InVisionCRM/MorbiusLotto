'use client';

/**
 * RouletteFairnessModal2 — provably-fair panel for chips Roulette (/roulette2).
 * Recomputes everything locally with WebCrypto:
 *   1. sha256(serverSeed) === serverSeedHash (commitment)
 *   2. HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:0`) → first 4 bytes →
 *      r ∈ [0,1) → pocket = floor(r × 37)
 *   3. every bet's payout re-derived from the public payout table
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  verifyRoulette2,
  roulette2BetPayout,
  pocketColor,
  type Roulette2VerifyResult,
} from '@/lib/roulette2-client';

interface RouletteFairnessModal2Props {
  open: boolean;
  onClose: () => void;
  clientSeed: string;
  onClientSeedChange: (seed: string) => void;
  requestVerifyId: string | null;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-[#5E8273]">{label}</div>
      <div className="break-all rounded-md bg-[#0A2018] px-2 py-1 font-mono text-xs text-slate-300">
        {value}
      </div>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? 'text-[#34D399]' : 'text-rose-400'}>{ok ? '✓' : '✗'}</span>
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

async function recomputePocket(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): Promise<number> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(serverSeed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${clientSeed}:${nonce}:0`));
  const bytes = new Uint8Array(sig);
  const uint32 = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return Math.floor((uint32 / 2 ** 32) * 37);
}

function randomClientSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function RouletteFairnessModal2({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: RouletteFairnessModal2Props) {
  const [verifyId, setVerifyId] = useState('');
  const [result, setResult] = useState<Roulette2VerifyResult | null>(null);
  const [hashMatches, setHashMatches] = useState<boolean | null>(null);
  const [pocketMatches, setPocketMatches] = useState<boolean | null>(null);
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
    setPocketMatches(null);
    setPayoutMatches(null);
    try {
      const r = await verifyRoulette2(trimmed);
      setResult(r);
      setHashMatches((await sha256Hex(r.serverSeed)) === r.serverSeedHash);
      setPocketMatches((await recomputePocket(r.serverSeed, r.clientSeed, r.nonce)) === r.result);
      const expected = r.bets.reduce((sum, b) => sum + roulette2BetPayout(b, r.result), 0);
      setPayoutMatches(expected === r.totalPayout);
    } catch {
      setError('No spin found with that ID.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && requestVerifyId) {
      setVerifyId(requestVerifyId);
      void runVerify(requestVerifyId);
    }
  }, [open, requestVerifyId]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto border-[#0E3B28] bg-[#04130D] text-slate-200">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-wider text-[#34D399]">
            Provably Fair
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Your client seed</h3>
            <p className="text-xs text-[#5E8273]">
              Mixed into every spin. Change it any time — the next spin uses the new value.
            </p>
            <div className="flex gap-2">
              <Input
                value={clientSeed}
                onChange={(e) => onClientSeedChange(e.target.value.slice(0, 128))}
                placeholder="Leave blank for a random seed each spin"
                className="border-[#0E3B28] bg-[#0A2018] font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => onClientSeedChange(randomClientSeed())}
                className="shrink-0 border-[#0E3B28] bg-transparent text-[#34D399] hover:bg-[#34D399]/10"
              >
                New seed
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Verify a spin</h3>
            <p className="text-xs text-[#5E8273]">
              The pocket is derived from a server seed committed (hashed) before your bets were
              accepted — verify it was never moved.
            </p>
            <div className="flex gap-2">
              <Input
                value={verifyId}
                onChange={(e) => setVerifyId(e.target.value)}
                placeholder="Spin ID"
                className="border-[#0E3B28] bg-[#0A2018] font-mono text-xs"
              />
              <Button
                onClick={() => runVerify(verifyId)}
                disabled={loading}
                className="shrink-0 bg-[#059669] text-white hover:bg-[#34D399] hover:text-[#03150D]"
              >
                {loading ? 'Checking…' : 'Verify'}
              </Button>
            </div>
          </section>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          {result && (
            <section className="space-y-3 rounded-lg border border-[#0E3B28] bg-[#07271A]/60 p-3">
              <div className="space-y-1.5">
                {hashMatches !== null && (
                  <Check ok={hashMatches} label="Server seed matches its committed hash (checked locally)" />
                )}
                {pocketMatches !== null && (
                  <Check ok={pocketMatches} label="Winning pocket re-derives from the seeds (checked locally)" />
                )}
                {payoutMatches !== null && (
                  <Check ok={payoutMatches} label="Every payout reconciles with the public payout table" />
                )}
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Field label="Server seed hash (committed)" value={result.serverSeedHash} />
                <Field label="Server seed (revealed)" value={result.serverSeed} />
                <Field label="Client seed" value={result.clientSeed} />
                <Field label="Nonce" value={String(result.nonce)} />
                <Field label="Recipe" value={result.recipe} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#5E8273]">
                <span>
                  Pocket:{' '}
                  <span
                    className={`font-mono font-bold ${
                      pocketColor(result.result) === 'green'
                        ? 'text-[#34D399]'
                        : pocketColor(result.result) === 'red'
                          ? 'text-red-400'
                          : 'text-zinc-300'
                    }`}
                  >
                    {result.result}
                  </span>
                </span>
                <span>
                  Wagered: <span className="font-mono text-slate-300">{result.totalBet.toLocaleString()}</span>
                </span>
                <span>
                  Returned:{' '}
                  <span
                    className={`font-mono ${result.totalPayout > 0 ? 'text-[#FBBF24]' : 'text-rose-400'}`}
                  >
                    {result.totalPayout.toLocaleString()} chips
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
