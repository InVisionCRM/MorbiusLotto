'use client';

/**
 * BaccaratFairnessModal — provably-fair panel for chips Baccarat (/baccarat).
 * Recomputes everything locally with WebCrypto + the client math mirrors:
 *   1. sha256(serverSeed) === serverSeedHash (commitment)
 *   2. dealBaccaratFromDeck(deck) re-derives the exact hand (totals + result)
 *   3. every zone payout reconciles with the public payout table
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  verifyBaccarat,
  dealBaccaratFromDeck,
  resolveBaccaratPayouts,
  sumBaccaratZones,
  baccCardRankLabel,
  baccCardIsRed,
  baccCardSuit,
  BACC_SUIT_GLYPHS,
  type BaccaratVerifyResult,
} from '@/lib/baccarat-client';

interface BaccaratFairnessModalProps {
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

function CardChips({ cards }: { cards: number[] }) {
  return (
    <span className="inline-flex gap-1">
      {cards.map((c, i) => (
        <span
          key={i}
          className={`arc-mono rounded bg-slate-100 px-1 text-xs font-bold ${
            baccCardIsRed(c) ? 'text-red-600' : 'text-slate-900'
          }`}
        >
          {baccCardRankLabel(c)}
          {BACC_SUIT_GLYPHS[baccCardSuit(c)]}
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

export function BaccaratFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: BaccaratFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('');
  const [result, setResult] = useState<BaccaratVerifyResult | null>(null);
  const [hashMatches, setHashMatches] = useState<boolean | null>(null);
  const [dealMatches, setDealMatches] = useState<boolean | null>(null);
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
    setDealMatches(null);
    setPayoutMatches(null);
    try {
      const r = await verifyBaccarat(trimmed);
      setResult(r);
      setHashMatches((await sha256Hex(r.serverSeed)) === r.serverSeedHash);
      const hand = dealBaccaratFromDeck(r.deck);
      setDealMatches(
        hand.result === r.result &&
          hand.playerTotal === r.playerTotal &&
          hand.bankerTotal === r.bankerTotal,
      );
      const expected = sumBaccaratZones(resolveBaccaratPayouts(r.bets, hand));
      setPayoutMatches(expected === r.totalPayout);
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
              Mixed into every shuffle. Change it any time — the next hand uses the new value.
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
              The 52-card deck is shuffled from a server seed committed (hashed) before your bets
              were accepted — verify it was never moved.
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
                {hashMatches !== null && (
                  <Check ok={hashMatches} label="Server seed matches its committed hash (checked locally)" />
                )}
                {dealMatches !== null && (
                  <Check ok={dealMatches} label="Hand re-deals from the revealed deck (checked locally)" />
                )}
                {payoutMatches !== null && (
                  <Check ok={payoutMatches} label="Every payout reconciles with the public payout table" />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="text-cyan-300">Player {result.playerTotal}</span>
                  <CardChips cards={result.playerCards} />
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-amber-300">Banker {result.bankerTotal}</span>
                  <CardChips cards={result.bankerCards} />
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
                  Result:{' '}
                  <span className="font-mono font-bold text-slate-200">
                    {result.result === 'player'
                      ? 'Player'
                      : result.result === 'banker'
                        ? 'Banker'
                        : 'Tie'}
                  </span>
                </span>
                <span>
                  Wagered:{' '}
                  <span className="font-mono text-slate-300">{result.totalBet.toLocaleString()}</span>
                </span>
                <span>
                  Returned:{' '}
                  <span className={`font-mono ${result.totalPayout > 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                    {result.totalPayout.toLocaleString()} MORBIUS
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
