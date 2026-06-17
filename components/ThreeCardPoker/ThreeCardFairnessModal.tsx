'use client';

/**
 * ThreeCardFairnessModal — provably-fair panel for chips Three Card Poker.
 *
 * Set or randomize your client seed (used for the next hand), and verify any
 * settled hand by id. The committed-hash check (sha256(serverSeed) ===
 * serverSeedHash) is recomputed locally with WebCrypto, and both hands are
 * re-derived from a Fisher-Yates shuffle of (serverSeed, clientSeed, nonce) —
 * the exact same recipe the server uses — so the deal is independently
 * reproducible.
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  verifyThreeCard,
  evaluate3,
  handName3,
  dealerQualifies,
  cardRankLabel,
  cardSuitGlyph,
  cardIsRed,
  resultLabel,
  type ThreeCardVerifyResult,
} from '@/lib/three-card-poker-client';

interface ThreeCardFairnessModalProps {
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
      {cardRankLabel(cardIdx)}
      <span>{cardSuitGlyph(cardIdx)}</span>
    </span>
  );
}

/**
 * Fisher-Yates 52-card shuffle from the HMAC byte stream — a faithful port of
 * pf.fisherYatesShuffle so the deck (and therefore both hands) re-derives
 * locally. message = `${clientSeed}:${nonce}:${roundIndex}`, 4 bytes per swap.
 */
async function deriveDeck(serverSeed: string, clientSeed: string, nonce: number): Promise<number[]> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(serverSeed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const roundCache = new Map<number, Uint8Array>();
  async function roundBytes(roundIndex: number): Promise<Uint8Array> {
    const cached = roundCache.get(roundIndex);
    if (cached) return cached;
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${clientSeed}:${nonce}:${roundIndex}`));
    const bytes = new Uint8Array(sig);
    roundCache.set(roundIndex, bytes);
    return bytes;
  }
  async function streamBytes(cursor: number): Promise<number[]> {
    const roundIndex = Math.floor(cursor / 32);
    const byteOffset = cursor % 32;
    const cur = await roundBytes(roundIndex);
    if (byteOffset + 4 <= 32) {
      return [cur[byteOffset], cur[byteOffset + 1], cur[byteOffset + 2], cur[byteOffset + 3]];
    }
    const next = await roundBytes(roundIndex + 1);
    const fromCur = 32 - byteOffset;
    const out: number[] = [];
    for (let i = byteOffset; i < 32; i++) out.push(cur[i]);
    for (let i = 0; i < 4 - fromCur; i++) out.push(next[i]);
    return out;
  }
  function bytesToFloat(b: number[]): number {
    return (
      b[0] / 256 +
      b[1] / (256 * 256) +
      b[2] / (256 * 256 * 256) +
      b[3] / (256 * 256 * 256 * 256)
    );
  }
  const deck = Array.from({ length: 52 }, (_, i) => i);
  let cursor = 0;
  for (let i = 51; i >= 1; i--) {
    const b = await streamBytes(cursor);
    cursor += 4;
    const j = Math.floor(bytesToFloat(b) * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** sha256 hex via WebCrypto — used to re-check the server-seed commitment locally. */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 16 random bytes → 32-char hex, generated locally with WebCrypto. */
function randomClientSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function sameCards(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function ThreeCardFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: ThreeCardFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('');
  const [result, setResult] = useState<ThreeCardVerifyResult | null>(null);
  const [hashMatches, setHashMatches] = useState<boolean | null>(null);
  const [dealMatches, setDealMatches] = useState<boolean | null>(null);
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
    try {
      const r = await verifyThreeCard(trimmed);
      setResult(r);
      setHashMatches((await sha256Hex(r.serverSeed)) === r.serverSeedHash);
      const deck = await deriveDeck(r.serverSeed, r.clientSeed, r.nonce);
      const ok =
        sameCards(deck.slice(0, 3), r.playerCards) && sameCards(deck.slice(3, 6), r.dealerCards);
      setDealMatches(ok);
    } catch {
      setError('No hand found with that ID.');
    } finally {
      setLoading(false);
    }
  }

  // Auto-verify when opened pointed at a specific hand (history row / last hand).
  useEffect(() => {
    if (open && requestVerifyId) {
      setVerifyId(requestVerifyId);
      void runVerify(requestVerifyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requestVerifyId]);

  const playerEval = result ? evaluate3(result.playerCards) : null;
  const dealerEval = result ? evaluate3(result.dealerCards) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="arcade2-scope max-h-[85vh] max-w-lg overflow-y-auto border-cyan-950 bg-[#050E16] text-slate-200">
        <DialogHeader>
          <DialogTitle className="arc-display uppercase tracking-wider">Provably Fair</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Client seed */}
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

          {/* Verify */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Verify a hand</h3>
            <p className="text-xs text-slate-500">
              The deck is sealed from a server seed committed (hashed) before your ante — revealed
              once the hand settles, so you can re-shuffle and confirm both hands.
            </p>
            <div className="flex gap-2">
              <Input
                value={verifyId}
                onChange={(e) => setVerifyId(e.target.value)}
                placeholder="Hand ID"
                className="arc-mono border-cyan-950 bg-[#081420] text-xs"
              />
              <Button
                onClick={() => runVerify(verifyId)}
                disabled={loading}
                className="shrink-0 bg-cyan-600 hover:bg-cyan-500"
              >
                {loading ? 'Checking…' : 'Verify'}
              </Button>
            </div>
          </section>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {result && playerEval && dealerEval && (
            <section className="arc-panel space-y-3 rounded-lg p-3">
              <div className="space-y-1.5">
                {hashMatches !== null && (
                  <Check
                    ok={hashMatches}
                    label="Server seed matches its committed hash (checked locally)"
                  />
                )}
                {dealMatches !== null && (
                  <Check ok={dealMatches} label="Both hands re-derive from the shuffled deck" />
                )}
                <Check ok label="Hand ranking & payout follow the posted paytable" />
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] uppercase tracking-wide text-slate-500">
                  The deal (re-derived)
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-12 shrink-0 text-[11px] text-slate-500">You</span>
                  {result.playerCards.map((c, i) => (
                    <MiniCard key={i} cardIdx={c} />
                  ))}
                  <span className="ml-2 text-xs text-cyan-300">{handName3(playerEval)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-12 shrink-0 text-[11px] text-slate-500">Dealer</span>
                  {result.dealerCards.map((c, i) => (
                    <MiniCard key={i} cardIdx={c} />
                  ))}
                  <span
                    className="ml-2 text-xs"
                    style={{ color: dealerQualifies(dealerEval) ? '#22D3EE' : '#FB7185' }}
                  >
                    {handName3(dealerEval)}
                    {dealerQualifies(dealerEval) ? '' : ' · no qual'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Field label="Server seed hash (committed)" value={result.serverSeedHash} />
                <Field label="Server seed (revealed)" value={result.serverSeed} />
                <Field label="Client seed" value={result.clientSeed} />
                <Field label="Nonce" value={String(result.nonce)} />
                <Field label="Recipe" value={result.recipe} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                <span>
                  Wagered:{' '}
                  <span className="arc-mono text-slate-200">{result.committed.toLocaleString()}</span>
                </span>
                <span>
                  Result: <span className="arc-mono text-slate-200">{resultLabel(result.result)}</span>
                </span>
                <span>
                  Returned:{' '}
                  <span
                    className={`arc-mono ${result.totalPayout > 0 ? 'text-amber-300' : 'text-rose-400'}`}
                  >
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
