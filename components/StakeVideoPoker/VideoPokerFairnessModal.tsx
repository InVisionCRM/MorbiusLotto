'use client';

/**
 * VideoPokerFairnessModal — provably-fair panel for chips Video Poker.
 * Recomputes locally from the revealed payload:
 *   1. sha256(serverSeed) === serverSeedHash (commitment)
 *   2. the dealt hand is deck[0..4] of the committed shuffle
 *   3. the final hand = your holds applied to deck (draws from deck[5..9])
 * The server seed + deck are revealed only once the hand is resolved.
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  verifyVideoPoker,
  applyVideoPokerHolds,
  vpRankLabel,
  vpSuitGlyph,
  vpCardIsRed,
  type VideoPokerVerifyResult,
} from '@/lib/video-poker-client';

interface VideoPokerFairnessModalProps {
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
      <div className="break-all rounded-md bg-[#081420] px-2 py-1 font-mono text-xs text-slate-300">{value}</div>
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

function HandChips({ cards }: { cards: number[] }) {
  return (
    <span className="inline-flex gap-0.5">
      {cards.map((c, i) => (
        <span
          key={i}
          className={`arc-mono rounded bg-slate-100 px-1 text-[11px] font-bold ${vpCardIsRed(c) ? 'text-red-600' : 'text-slate-900'}`}
        >
          {vpRankLabel(c)}
          {vpSuitGlyph(c)}
        </span>
      ))}
    </span>
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

function sameCards(a: number[] | null, b: number[] | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

export function VideoPokerFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: VideoPokerFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('');
  const [result, setResult] = useState<VideoPokerVerifyResult | null>(null);
  const [hashMatches, setHashMatches] = useState<boolean | null>(null);
  const [dealMatches, setDealMatches] = useState<boolean | null>(null);
  const [drawMatches, setDrawMatches] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runVerify(id: string) {
    const trimmed = id.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setHashMatches(null);
    setDealMatches(null);
    setDrawMatches(null);
    try {
      const r = await verifyVideoPoker(trimmed);
      setResult(r);
      setHashMatches(r.serverSeed ? (await sha256Hex(r.serverSeed)) === r.serverSeedHash : null);
      if (r.deck) {
        setDealMatches(sameCards(r.dealtHand, r.deck.slice(0, 5)));
        if (r.holds && r.finalHand) {
          setDrawMatches(sameCards(r.finalHand, applyVideoPokerHolds(r.deck, r.holds)));
        }
      }
    } catch {
      setError('No hand found with that ID.');
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
              Mixed into every shuffle. Change it any time — the next deal uses the new value.
            </p>
            <div className="flex gap-2">
              <Input
                value={clientSeed}
                onChange={(e) => onClientSeedChange(e.target.value.slice(0, 128))}
                placeholder="Leave blank for a random seed each hand"
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
            <h3 className="text-sm font-semibold text-slate-200">Verify a hand</h3>
            <p className="text-xs text-slate-500">
              The full deck is shuffled from a server seed committed (hashed) before your bet — the seed + deck are
              revealed once the hand is resolved.
            </p>
            <div className="flex gap-2">
              <Input
                value={verifyId}
                onChange={(e) => setVerifyId(e.target.value)}
                placeholder="Hand ID"
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
                  <p className="text-xs text-slate-500">Server seed is revealed once the hand resolves.</p>
                )}
                {dealMatches !== null && (
                  <Check ok={dealMatches} label="Dealt hand is the top of the committed deck" />
                )}
                {drawMatches !== null && (
                  <Check ok={drawMatches} label="Final hand = your holds applied to the deck" />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">Dealt <HandChips cards={result.dealtHand} /></span>
                {result.finalHand && (
                  <span className="flex items-center gap-1.5">Final <HandChips cards={result.finalHand} /></span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Field label="Server seed hash (committed)" value={result.serverSeedHash} />
                <Field label="Server seed (revealed)" value={result.serverSeed ?? '— hidden until the hand resolves'} />
                <Field label="Client seed" value={result.clientSeed} />
                <Field label="Nonce" value={String(result.nonce)} />
                <Field label="Recipe" value={result.recipe} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  Hand:{' '}
                  <span className="font-mono font-bold text-slate-200">{result.resultCategory ?? '—'}</span>
                </span>
                <span>
                  Returned:{' '}
                  <span className={`font-mono ${(result.payout ?? 0) > 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                    {(result.payout ?? 0).toLocaleString()} chips
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
