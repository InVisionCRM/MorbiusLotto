'use client';

/**
 * CrashFairnessModal — provably-fair panel for chips Crash (/crash).
 *
 * Same conventions as the limbo/dice/keno modals: set or randomize your
 * client seed (used for the next round), and verify any settled round by id.
 * Verification recomputes EVERYTHING locally with WebCrypto:
 *   1. sha256(serverSeed) === serverSeedHash          (pre-round commitment)
 *   2. HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:0`) → first 4 bytes →
 *      r ∈ [0,1) → crashX100 = max(100, floor(((1 − edge) / r) × 100))
 *   3. payout reconciles with bet × cashout multiplier
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  verifyCrash,
  formatCrashMultiplier,
  type CrashVerifyResult,
} from '@/lib/crash-client';

const RESULT_CAP_X100 = 100_000_000;

interface CrashFairnessModalProps {
  open: boolean;
  onClose: () => void;
  clientSeed: string;
  onClientSeedChange: (seed: string) => void;
  /** When set (and the modal is open), the id is filled in and verified immediately. */
  requestVerifyId: string | null;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-[#848ca1]">{label}</div>
      <div className="break-all rounded-md bg-[#10121a] px-2 py-1 font-mono text-xs text-slate-300">
        {value}
      </div>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? 'text-[#00ffa3]' : 'text-[#ff3e3e]'}>{ok ? '✓' : '✗'}</span>
      <span className="text-slate-300">{label}</span>
    </div>
  );
}

/** sha256 hex via WebCrypto. */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Recompute the crash point from the revealed seeds (mirrors the server). */
async function recomputeCrashX100(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  houseEdgeBp: number,
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
  const r = uint32 / 2 ** 32;
  const safe = Math.max(r, 1e-12);
  const houseFactor = 1 - houseEdgeBp / 10_000;
  const x100 = Math.max(100, Math.floor((houseFactor / safe) * 100));
  return Math.min(RESULT_CAP_X100, x100);
}

/** 16 random bytes → 32-char hex, generated locally with WebCrypto. */
function randomClientSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function CrashFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: CrashFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('');
  const [result, setResult] = useState<CrashVerifyResult | null>(null);
  const [hashMatches, setHashMatches] = useState<boolean | null>(null);
  const [crashMatches, setCrashMatches] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runVerify(id: string) {
    const trimmed = id.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setHashMatches(null);
    setCrashMatches(null);
    try {
      const r = await verifyCrash(trimmed);
      setResult(r);
      setHashMatches((await sha256Hex(r.serverSeed)) === r.serverSeedHash);
      const recomputed = await recomputeCrashX100(
        r.serverSeed,
        r.clientSeed,
        r.nonce,
        r.houseEdgeBp,
      );
      setCrashMatches(recomputed === r.crashX100);
    } catch {
      setError('No settled round found with that ID.');
    } finally {
      setLoading(false);
    }
  }

  // Auto-verify when opened pointed at a specific round.
  useEffect(() => {
    if (open && requestVerifyId) {
      setVerifyId(requestVerifyId);
      void runVerify(requestVerifyId);
    }
  }, [open, requestVerifyId]);

  const payoutMatches =
    result == null
      ? null
      : result.won && result.cashoutX100 != null
        ? result.payout === Math.floor((result.bet * result.cashoutX100) / 100)
        : result.payout === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto border-white/10 bg-[#0a0c14] text-slate-200">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-wider text-[#00ffa3]">
            Provably Fair
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Client seed */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Your client seed</h3>
            <p className="text-xs text-[#848ca1]">
              Mixed into every round&apos;s crash point. Change it any time — the next round uses
              the new value.
            </p>
            <div className="flex gap-2">
              <Input
                value={clientSeed}
                onChange={(e) => onClientSeedChange(e.target.value.slice(0, 128))}
                placeholder="Leave blank for a random seed each round"
                className="border-white/10 bg-[#10121a] font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => onClientSeedChange(randomClientSeed())}
                className="shrink-0 border-white/10 bg-transparent text-[#00ffa3] hover:bg-[#00ffa3]/10"
              >
                New seed
              </Button>
            </div>
          </section>

          {/* Verify */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Verify a round</h3>
            <p className="text-xs text-[#848ca1]">
              The crash point is committed (hashed) before your bet and revealed when the round
              settles — verify it was never moved.
            </p>
            <div className="flex gap-2">
              <Input
                value={verifyId}
                onChange={(e) => setVerifyId(e.target.value)}
                placeholder="Round ID"
                className="border-white/10 bg-[#10121a] font-mono text-xs"
              />
              <Button
                onClick={() => runVerify(verifyId)}
                disabled={loading}
                className="shrink-0 bg-[#00b372] text-[#06070a] hover:bg-[#00ffa3]"
              >
                {loading ? 'Checking…' : 'Verify'}
              </Button>
            </div>
          </section>

          {error && <p className="text-sm text-[#ff3e3e]">{error}</p>}

          {result && (
            <section className="space-y-3 rounded-lg border border-white/5 bg-[#10121a]/60 p-3">
              <div className="space-y-1.5">
                {hashMatches !== null && (
                  <Check
                    ok={hashMatches}
                    label="Server seed matches its committed hash (checked locally)"
                  />
                )}
                {crashMatches !== null && (
                  <Check
                    ok={crashMatches}
                    label="Crash point re-derives from the seeds (checked locally)"
                  />
                )}
                {payoutMatches !== null && (
                  <Check ok={payoutMatches} label="Payout reconciles with bet × cashout" />
                )}
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Field label="Server seed hash (committed)" value={result.serverSeedHash} />
                <Field label="Server seed (revealed)" value={result.serverSeed} />
                <Field label="Client seed" value={result.clientSeed} />
                <Field label="Nonce" value={String(result.nonce)} />
                <Field label="Recipe" value={result.recipe} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#848ca1]">
                <span>
                  Crash:{' '}
                  <span className="font-mono text-[#ff9d00]">
                    {formatCrashMultiplier(result.crashX100)}
                  </span>
                </span>
                <span>
                  Cashout:{' '}
                  <span className={`font-mono ${result.won ? 'text-[#00ffa3]' : 'text-[#ff3e3e]'}`}>
                    {result.cashoutX100 != null
                      ? formatCrashMultiplier(result.cashoutX100)
                      : 'no cashout'}
                  </span>
                </span>
                <span>
                  Payout:{' '}
                  {result.won ? (
                    <span className="font-mono text-[#00ffa3]">
                      {result.payout.toLocaleString()} MORBIUS
                    </span>
                  ) : (
                    <span className="font-mono text-[#ff3e3e]">lost</span>
                  )}
                </span>
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
