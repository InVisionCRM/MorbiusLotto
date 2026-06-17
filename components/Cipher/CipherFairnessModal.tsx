'use client';

/**
 * CipherFairnessModal — provably-fair panel for chips Cipher (/cipher).
 * Mirrors ChickenFairnessModal. Recomputes locally what it can from the revealed
 * payload:
 *   1. sha256(serverSeed) === serverSeedHash (commitment)
 *   2. every recorded guess's feedback re-scores against the revealed code
 *   3. the payout reconciles with the recorded ladder (crack[guessCount] on a
 *      crack, secure[bestExact] on a bank, 0 on a bust)
 * The full code-derivation + feedback recipe is shown so anyone can reproduce it.
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  verifyCipher,
  cipherFeedback,
  formatMultiplier,
  CIPHER_COLORS,
  type CipherVerifyResult,
} from '@/lib/cipher-client';

interface CipherFairnessModalProps {
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

/** A single code peg disc (colour + letter). */
function Peg({ symbol, size = 26 }: { symbol: number; size?: number }) {
  const c = CIPHER_COLORS[symbol] ?? CIPHER_COLORS[0];
  return (
    <span
      className="arc-mono inline-grid place-items-center rounded-full font-bold"
      style={{ width: size, height: size, fontSize: size * 0.5, background: c.c, color: '#04141b' }}
    >
      {c.l}
    </span>
  );
}

/** The revealed secret code, left → right. */
function CodeRow({ code }: { code: number[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {code.map((s, i) => (
        <Peg key={i} symbol={s} />
      ))}
    </div>
  );
}

/** Each recorded guess with its feedback. */
function GuessGrid({ guesses }: { guesses: CipherVerifyResult['guesses'] }) {
  if (guesses.length === 0) {
    return <p className="text-xs text-slate-500">No guesses were submitted.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      {guesses.map((g, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="arc-mono w-4 shrink-0 text-[10px] text-slate-500">{i + 1}</span>
          {g.guess.map((s, j) => (
            <Peg key={j} symbol={s} size={18} />
          ))}
          <span className="arc-mono ml-1.5 text-[11px] text-slate-400">
            {g.exact}● {g.partial}○
          </span>
        </div>
      ))}
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

/** Every recorded guess's feedback must re-score against the revealed code. */
function feedbackConsistent(r: CipherVerifyResult): boolean {
  for (const g of r.guesses) {
    const s = cipherFeedback(g.guess, r.code);
    if (s.exact !== g.exact || s.partial !== g.partial) return false;
  }
  return true;
}

/** Recompute the expected payout from the recorded ladder + outcome. */
function expectedPayout(r: CipherVerifyResult): number {
  if (r.cracked) return Math.floor((r.bet * (r.crack[r.guessCount] ?? 0)) / 100);
  if (r.won) return Math.floor((r.bet * (r.secure[r.bestExact] ?? 0)) / 100);
  return 0;
}

export function CipherFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: CipherFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('');
  const [result, setResult] = useState<CipherVerifyResult | null>(null);
  const [hashMatches, setHashMatches] = useState<boolean | null>(null);
  const [feedbackMatches, setFeedbackMatches] = useState<boolean | null>(null);
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
    setFeedbackMatches(null);
    setPayoutMatches(null);
    try {
      const r = await verifyCipher(trimmed);
      setResult(r);
      setHashMatches((await sha256Hex(r.serverSeed)) === r.serverSeedHash);
      setFeedbackMatches(feedbackConsistent(r));
      setPayoutMatches(expectedPayout(r) === r.payout);
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

  const resultLabel = result ? (result.cracked ? 'Cracked' : result.won ? 'Banked' : 'Bust') : '';

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
              Mixed into every code. Change it any time — the next round uses the new value.
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
              The secret code is sealed from a server seed committed (hashed) before your bet — the
              seed is revealed once the round settles.
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
                {feedbackMatches !== null && (
                  <Check ok={feedbackMatches} label="Every guess's feedback matches the revealed code" />
                )}
                {payoutMatches !== null && (
                  <Check ok={payoutMatches} label="Payout reconciles with the recorded ladder" />
                )}
              </div>

              <div>
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">Secret code (revealed)</div>
                <CodeRow code={result.code} />
              </div>

              <div>
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">Your guesses</div>
                <GuessGrid guesses={result.guesses} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  Difficulty: <span className="arc-mono capitalize text-slate-300">{result.difficulty}</span>
                </span>
                <span>
                  Tries used:{' '}
                  <span className="arc-mono text-slate-300">{result.guessCount} / {result.maxGuesses}</span>
                </span>
                <span>
                  Best exact:{' '}
                  <span className="arc-mono text-cyan-300">{result.bestExact} / {result.codeLen}</span>
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
                  Result: <span className="arc-mono font-bold text-slate-200">{resultLabel}</span>
                </span>
                <span>
                  Multiplier:{' '}
                  <span className="arc-mono text-cyan-300">
                    {result.multiplierX100 ? formatMultiplier(result.multiplierX100) : '—'}
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
