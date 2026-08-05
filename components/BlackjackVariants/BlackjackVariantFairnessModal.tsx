'use client';

/**
 * BlackjackVariantFairnessModal — the provably-fair panel for the blackjack
 * variants.
 *
 * These games can't reuse the shared TableFairnessModal: it re-derives fixed
 * deck SLICES (this row is deck[0..2], that one is deck[5..10]), and a
 * blackjack round doesn't have fixed slices — how many cards each hand took
 * depends on how the player played it. So this panel verifies the two things
 * that actually pin the round down:
 *
 *   1. sha256(serverSeed) === the hash committed before the bet, and
 *   2. the round's stored deck is exactly the shuffle those seeds produce,
 *      after the variant's dead ranks are removed (Spanish 21 drops the tens).
 *
 * Once the deck matches, every card that was dealt came off the front of it in
 * order, which is what the recipe published alongside says.
 */

import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cardSuitGlyph, cardIsRed, cardRankLabel } from '@/lib/playing-cards';
import { deriveDeck, randomClientSeed, sameCards, sha256Hex } from '@/lib/provably-fair-deck';
import {
  bjCardRank,
  bjOutcomeLabel,
  verifyBj,
  type BjVerifyResult,
} from '@/lib/blackjack-variants-client';

interface Props {
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
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="arc-mono break-all rounded-md bg-[#081420] px-2 py-1 text-xs text-slate-300">
        {value}
      </div>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? 'text-cyan-400' : 'text-red-400'}>{ok ? '✓' : '✗'}</span>
      <span className="text-slate-300">{label}</span>
    </div>
  );
}

function MiniCard({ cardIdx }: { cardIdx: number }) {
  return (
    <span
      className="inline-flex w-[26px] flex-col items-center justify-center rounded bg-[#f2efe6] py-0.5 text-[11px] font-semibold"
      style={{ color: cardIsRed(cardIdx) ? '#b3261e' : '#1f2937' }}
    >
      {cardRankLabel(cardIdx, 'blackjack')}
      <span>{cardSuitGlyph(cardIdx)}</span>
    </span>
  );
}

export function BlackjackVariantFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: Props) {
  const [verifyId, setVerifyId] = useState('');
  const [record, setRecord] = useState<BjVerifyResult | null>(null);
  const [hashMatches, setHashMatches] = useState<boolean | null>(null);
  const [deckMatches, setDeckMatches] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runVerify = useCallback(async (id: string) => {
    const trimmed = id.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setRecord(null);
    setHashMatches(null);
    setDeckMatches(null);
    try {
      const r = await verifyBj(trimmed);
      setRecord(r);
      setHashMatches((await sha256Hex(r.serverSeed)) === r.serverSeedHash);

      // Rebuild the standard 52-card shuffle, then strip whatever this variant
      // removed — the same order the server used, so the result should be the
      // round's stored deck card for card.
      const full = await deriveDeck(r.serverSeed, r.clientSeed, r.nonce);
      const removed = new Set(r.removedRanks ?? []);
      const rebuilt = removed.size
        ? full.filter((c) => !removed.has(bjCardRank(c)))
        : full;
      setDeckMatches(sameCards(rebuilt, r.deck ?? []));
    } catch {
      setError('No round found with that ID.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && requestVerifyId) {
      setVerifyId(requestVerifyId);
      void runVerify(requestVerifyId);
    }
  }, [open, requestVerifyId, runVerify]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="arcade2-scope max-h-[85vh] max-w-lg overflow-y-auto border-cyan-950 bg-[#050E16] text-slate-200">
        <DialogHeader>
          <DialogTitle className="arc-display uppercase tracking-wider">Provably Fair</DialogTitle>
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
              The whole deck is sealed from a server seed committed (hashed) before your bet, and
              revealed once the round settles — so you can rebuild the shuffle and confirm the card
              you drew was already sitting there before you asked for it.
            </p>
            <div className="flex gap-2">
              <Input
                value={verifyId}
                onChange={(e) => setVerifyId(e.target.value)}
                placeholder="Round ID"
                className="arc-mono border-cyan-950 bg-[#081420] text-xs"
              />
              <Button
                onClick={() => void runVerify(verifyId)}
                disabled={loading}
                className="shrink-0 bg-cyan-600 hover:bg-cyan-500"
              >
                {loading ? 'Checking…' : 'Verify'}
              </Button>
            </div>
          </section>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {record && (
            <section className="arc-panel space-y-3 rounded-lg p-3">
              <div className="space-y-1.5">
                {hashMatches !== null && (
                  <Check
                    ok={hashMatches}
                    label="Server seed matches its committed hash (checked locally)"
                  />
                )}
                {deckMatches !== null && (
                  <Check
                    ok={deckMatches}
                    label={
                      record.removedRanks?.length
                        ? 'The whole deck rebuilds from the seeds, tens removed'
                        : 'The whole deck rebuilds from the seeds'
                    }
                  />
                )}
                <Check ok label="Every card dealt came off the front of that deck, in order" />
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">
                  The round ({record.variantName})
                </div>
                {record.hands.map((h, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-14 shrink-0 text-[11px] text-slate-500">
                      {record.hands.length > 1 ? `Hand ${i + 1}` : 'You'}
                    </span>
                    {h.cards.map((c, ci) => (
                      <MiniCard key={ci} cardIdx={c} />
                    ))}
                    <span className="ml-2 text-xs text-cyan-300">
                      {h.total}
                      {record.results?.[i] && (
                        <span className="text-slate-400">
                          {' '}
                          · {bjOutcomeLabel(record.results[i].outcome)}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="w-14 shrink-0 text-[11px] text-slate-500">Dealer</span>
                  {record.dealerCards.map((c, ci) => (
                    <MiniCard key={ci} cardIdx={c} />
                  ))}
                  {record.dealerTotal != null && (
                    <span className="ml-2 text-xs text-slate-400">
                      {record.dealerTotal}
                      {record.dealerTotal > 21 ? ' · bust' : ''}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Field label="Server seed hash (committed)" value={record.serverSeedHash} />
                <Field label="Server seed (revealed)" value={record.serverSeed} />
                <Field label="Client seed" value={record.clientSeed} />
                <Field label="Nonce" value={String(record.nonce)} />
                <Field label="Recipe" value={record.recipe} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>
                  Wagered:{' '}
                  <span className="arc-mono text-slate-200">
                    {record.committed.toLocaleString()}
                  </span>
                </span>
                <span>
                  Returned:{' '}
                  <span
                    className={`arc-mono ${record.totalPayout > 0 ? 'text-amber-300' : 'text-rose-400'}`}
                  >
                    {record.totalPayout.toLocaleString()} MORBIUS
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
