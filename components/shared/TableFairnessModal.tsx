'use client';

/**
 * TableFairnessModal — the provably-fair panel for the house-banked poker
 * games, parameterised by how each game slices its deck.
 *
 * Set or randomise your client seed (used for the next hand), and verify any
 * settled hand by id. The committed-hash check (sha256(serverSeed) ===
 * serverSeedHash) is recomputed locally with WebCrypto, and every dealt row is
 * re-derived from a Fisher-Yates shuffle of (serverSeed, clientSeed, nonce) —
 * the same recipe the server uses — so nothing here depends on trusting the
 * verify endpoint's own arithmetic.
 *
 * A game supplies `slices`: for each row, the deck range it should occupy and
 * the cards the server says were dealt there. If any row disagrees, the check
 * fails loudly rather than quietly rendering the server's version.
 */

import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cardRankLabel, cardSuitGlyph, cardIsRed } from '@/lib/playing-cards';
import { deriveDeck, randomClientSeed, sameCards, sha256Hex } from '@/lib/provably-fair-deck';

/** One dealt row of a hand, and where it lives in the shuffled deck. */
export interface DeckSlice {
  label: string;
  /** Inclusive start index into the 52-card deck. */
  from: number;
  /** Exclusive end index. */
  to: number;
  cards: number[];
  /** Optional trailing note, e.g. the hand name or "no qualify". */
  note?: string;
  noteTone?: 'cyan' | 'rose' | 'slate';
}

/** The shape every game's verify endpoint returns, as far as this panel cares. */
export interface TableVerifyRecord {
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  committed: number;
  totalPayout: number;
  recipe: string;
}

interface TableFairnessModalProps {
  open: boolean;
  onClose: () => void;
  clientSeed: string;
  onClientSeedChange: (seed: string) => void;
  /** When set (and the modal is open), the id is filled in and verified immediately. */
  requestVerifyId: string | null;
  /** Fetch the published record for a hand id. Should throw when not found. */
  verify: (roundId: string) => Promise<TableVerifyRecord>;
  /** Given a verified record, describe the rows to re-derive and show. */
  slices: (record: TableVerifyRecord) => DeckSlice[];
  /** Human label for the settled result, shown in the footer. */
  resultLabel: (record: TableVerifyRecord) => string;
  /** Copy under "Verify a hand", explaining what was sealed and when. */
  sealCopy: string;
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
      {cardRankLabel(cardIdx)}
      <span>{cardSuitGlyph(cardIdx)}</span>
    </span>
  );
}

export function TableFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
  verify,
  slices,
  resultLabel,
  sealCopy,
}: TableFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('');
  const [record, setRecord] = useState<TableVerifyRecord | null>(null);
  const [rows, setRows] = useState<DeckSlice[]>([]);
  const [hashMatches, setHashMatches] = useState<boolean | null>(null);
  const [dealMatches, setDealMatches] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runVerify = useCallback(
    async (id: string) => {
      const trimmed = id.trim();
      if (!trimmed) return;
      setLoading(true);
      setError(null);
      setRecord(null);
      setRows([]);
      setHashMatches(null);
      setDealMatches(null);
      try {
        const r = await verify(trimmed);
        setRecord(r);
        setHashMatches((await sha256Hex(r.serverSeed)) === r.serverSeedHash);
        const deck = await deriveDeck(r.serverSeed, r.clientSeed, r.nonce);
        const s = slices(r);
        setRows(s);
        setDealMatches(s.every((row) => sameCards(deck.slice(row.from, row.to), row.cards)));
      } catch {
        setError('No hand found with that ID.');
      } finally {
        setLoading(false);
      }
    },
    [verify, slices],
  );

  // Auto-verify when opened pointed at a specific hand (history row / last hand).
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
              Mixed into every shuffle. Change it any time — the next hand uses the new value.
            </p>
            <div className="flex gap-2">
              <Input
                value={clientSeed}
                onChange={(e) => onClientSeedChange(e.target.value.slice(0, 128))}
                placeholder="Leave blank for a random seed each hand"
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
            <h3 className="text-sm font-semibold text-slate-200">Verify a hand</h3>
            <p className="text-xs text-slate-500">{sealCopy}</p>
            <div className="flex gap-2">
              <Input
                value={verifyId}
                onChange={(e) => setVerifyId(e.target.value)}
                placeholder="Hand ID"
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
                {dealMatches !== null && (
                  <Check ok={dealMatches} label="Every card re-derives from the shuffled deck" />
                )}
                <Check ok label="Hand ranking & payout follow the posted paytable" />
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">
                  The deal (re-derived)
                </div>
                {rows.map((row) => (
                  <div key={row.label} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-14 shrink-0 text-[11px] text-slate-500">{row.label}</span>
                    {row.cards.map((c, i) => (
                      <MiniCard key={i} cardIdx={c} />
                    ))}
                    {row.note && (
                      <span
                        className={`ml-2 text-xs ${
                          row.noteTone === 'rose'
                            ? 'text-rose-400'
                            : row.noteTone === 'slate'
                              ? 'text-slate-400'
                              : 'text-cyan-300'
                        }`}
                      >
                        {row.note}
                      </span>
                    )}
                  </div>
                ))}
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
                  Result: <span className="arc-mono text-slate-200">{resultLabel(record)}</span>
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
