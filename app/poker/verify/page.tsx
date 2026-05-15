'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, AlertTriangle, Hash, Eye, Shield, Spade } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CopyButton } from '@/components/ui/copy-button';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { CardDisplay } from '@/components/poker/CardDisplay';

// ─────────────────────────────────────────────────────────────────────────────
// Client-side Fisher-Yates shuffle — bit-for-bit identical to the server's
// pfService.fisherYatesShuffle (HMAC-SHA256 byte stream, 4-byte cursor, unbiased
// float mapping). Lives here so verification runs purely in the browser; the
// server is just the source of the data being verified.
// ─────────────────────────────────────────────────────────────────────────────

async function hmacByteStream(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  cursor: number,
): Promise<Uint8Array> {
  const roundIndex = Math.floor(cursor / 32);
  const byteOffset = cursor % 32;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(serverSeed);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sign = async (msg: string) =>
    new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(msg)));

  const hmacBuf = await sign(`${clientSeed}:${nonce}:${roundIndex}`);
  if (byteOffset + 4 <= 32) return hmacBuf.subarray(byteOffset, byteOffset + 4);

  const bytesFromCurrent = 32 - byteOffset;
  const nextHmac = await sign(`${clientSeed}:${nonce}:${roundIndex + 1}`);
  const result = new Uint8Array(4);
  result.set(hmacBuf.subarray(byteOffset, 32), 0);
  result.set(nextHmac.subarray(0, 4 - bytesFromCurrent), bytesFromCurrent);
  return result;
}

function bytesToFloat(bytes: Uint8Array): number {
  return (
    bytes[0] / 256 +
    bytes[1] / (256 * 256) +
    bytes[2] / (256 * 256 * 256) +
    bytes[3] / (256 * 256 * 256 * 256)
  );
}

async function fisherYatesShuffleClient(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): Promise<number[]> {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  let cursor = 0;
  for (let i = 51; i >= 1; i--) {
    const bytes = await hmacByteStream(serverSeed, clientSeed, nonce, cursor);
    cursor += 4;
    const j = Math.floor(bytesToFloat(bytes) * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Types matching the server payload
// ─────────────────────────────────────────────────────────────────────────────

interface VerifyPayload {
  handId: string;
  handNumber: number;
  tableId: string;
  tournamentId: string | null;
  completedAt: string;
  verifiable: boolean;
  commitment: { serverSeedHash: string };
  reveal: { serverSeed: string; clientSeed: string; nonce: number };
  deck: { indices: number[]; dealOrder: number[]; encoding: string };
  players: { address: string; seatPosition: number | null; holeCards: number[] }[];
  communityCards: number[];
  actions: { order: number; street: string; address: string; action: string; amount: string }[];
  result: { winners?: { address: string; amount: string; handName?: string }[] } | null;
  howToVerify: string[];
}

interface VerificationResult {
  hashOk: boolean;
  deckOk: boolean;
  dealOk: boolean;
  recomputedDeck: number[];
  dealMismatches: { position: number; expected: number; actual: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

function VerifyPokerPageInner() {
  const searchParams = useSearchParams();
  const urlHandId = searchParams?.get('handId') ?? '';
  const [handId, setHandId] = useState(urlHandId);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<VerifyPayload | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);

  const verify = async (idToVerify: string) => {
    if (!idToVerify.trim()) {
      setError('Please enter a hand ID');
      return;
    }
    setIsVerifying(true);
    setError(null);
    setPayload(null);
    setResult(null);

    try {
      const res = await fetch(`/api/poker/verify/${idToVerify.trim()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to fetch verification data');
      }
      const p = data as VerifyPayload;
      setPayload(p);

      // 1. Hash check.
      const recomputedHash = await sha256Hex(p.reveal.serverSeed);
      const hashOk = recomputedHash === p.commitment.serverSeedHash;

      // 2. Recompute the deck and confirm it matches the server-published one.
      const recomputedDeck = await fisherYatesShuffleClient(
        p.reveal.serverSeed,
        p.reveal.clientSeed,
        p.reveal.nonce,
      );
      const deckOk =
        recomputedDeck.length === p.deck.indices.length &&
        recomputedDeck.every((v, i) => v === p.deck.indices[i]);

      // 3. Walk the deal sequence in pop order and confirm each card matches.
      //    Order: for each seat (ascending), 2 hole cards, then 3 community
      //    cards (flop), 1 (turn), 1 (river). Chevtek doesn't burn cards.
      const popOrder = recomputedDeck.slice().reverse();
      const expectedDealt: number[] = [];
      const sortedPlayers = [...p.players].sort((a, b) => {
        if (a.seatPosition == null && b.seatPosition == null) return 0;
        if (a.seatPosition == null) return 1;
        if (b.seatPosition == null) return -1;
        return a.seatPosition - b.seatPosition;
      });
      for (const pl of sortedPlayers) {
        expectedDealt.push(...pl.holeCards);
      }
      expectedDealt.push(...p.communityCards);

      const dealMismatches: { position: number; expected: number; actual: number }[] = [];
      for (let i = 0; i < expectedDealt.length; i++) {
        if (popOrder[i] !== expectedDealt[i]) {
          dealMismatches.push({ position: i, expected: expectedDealt[i], actual: popOrder[i] });
        }
      }
      const dealOk = dealMismatches.length === 0;

      setResult({ hashOk, deckOk, dealOk, recomputedDeck, dealMismatches });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  // Auto-verify when ?handId= is in the URL.
  useEffect(() => {
    if (urlHandId && urlHandId.trim() && urlHandId !== handId) {
      setHandId(urlHandId);
      const timer = setTimeout(() => void verify(urlHandId), 100);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlHandId]);

  const overallOk = result ? result.hashOk && result.deckOk && result.dealOk : false;
  const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

  return (
    <GlobalMainNav page="poker" showBackArrow backArrowHref="/poker" backArrowLabel="Back to Poker">
      <div className="min-h-screen bg-black text-white pt-4 md:pt-2">
        <main className="container mx-auto px-4 py-8 max-w-6xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Shield className="w-8 h-8 text-cyan-400" />
              <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                Poker Verifier
              </h1>
            </div>
            <p className="text-xl text-white/80 max-w-2xl mx-auto">
              Independently verify any completed hand. The server commits to a deck hash before the
              first card is dealt and reveals the seed afterwards — re-run the shuffle in your
              browser to prove the cards weren't rigged.
            </p>
          </div>

          {/* Input */}
          <Card className="p-6 mb-8 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Hash className="w-5 h-5 text-cyan-400" />
                <h2 className="text-xl font-semibold text-white">Verify a hand</h2>
              </div>
              <div>
                <Label htmlFor="handId" className="text-white/80">Hand ID</Label>
                <Input
                  id="handId"
                  type="text"
                  placeholder="Paste a hand ID from your hand history"
                  value={handId}
                  onChange={(e) => setHandId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && verify(handId)}
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50 mt-1"
                />
                <p className="text-sm text-white/60 mt-1">
                  Find hand IDs on your Poker → Stats panel, or click "Verify ↗" next to any hand
                  in your history.
                </p>
              </div>
              <Button
                onClick={() => verify(handId)}
                disabled={!handId.trim() || isVerifying}
                className="w-full bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700"
              >
                {isVerifying ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    Verifying…
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4 mr-2" />
                    Verify hand
                  </>
                )}
              </Button>
            </div>
          </Card>

          {error && (
            <Alert variant="destructive" className="mb-8">
              <AlertTriangle className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {payload && result && (
            <div className="space-y-6">
              {/* Overall status */}
              <Card className="p-6 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
                <div className="flex items-center gap-2 mb-4">
                  {overallOk ? (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-red-400" />
                  )}
                  <h3 className="text-xl font-semibold text-white">Verification result</h3>
                </div>
                <Alert
                  className={`mb-4 ${overallOk ? 'border-green-400/20 bg-green-950/20' : 'border-red-400/20 bg-red-950/20'}`}
                >
                  <AlertDescription className={overallOk ? 'text-green-200' : 'text-red-200'}>
                    {overallOk
                      ? '✅ Provably fair: the deck was committed before the deal and matches the revealed seed exactly.'
                      : '❌ Verification failed — see details below.'}
                  </AlertDescription>
                </Alert>
                <div className="grid md:grid-cols-3 gap-4">
                  <CheckCell
                    ok={result.hashOk}
                    title="Hash matches"
                    okLine="SHA-256 of revealed seed equals the published commitment."
                    failLine="Server revealed a seed that doesn't match the pre-deal commitment."
                  />
                  <CheckCell
                    ok={result.deckOk}
                    title="Deck reproducible"
                    okLine="Re-running fisher–yates with the seed produces the exact same 52-card permutation."
                    failLine="Server's published deck doesn't match the seed-derived deck."
                  />
                  <CheckCell
                    ok={result.dealOk}
                    title="Deal order matches"
                    okLine="Every dealt card (hole + community) is in the right position of the deck pop sequence."
                    failLine={`${result.dealMismatches.length} card position(s) don't match the deck pop sequence.`}
                  />
                </div>
              </Card>

              {/* Commitment / reveal */}
              <Card className="p-6 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
                <h3 className="text-xl font-semibold text-white mb-4">Commitment & reveal</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <KVRow label="Hand ID" value={payload.handId} mono copy />
                  <KVRow label="Hand number" value={String(payload.handNumber)} />
                  <KVRow label="Table ID" value={payload.tableId} mono copy />
                  <KVRow label="Completed at" value={new Date(payload.completedAt).toLocaleString()} />
                  <KVRow
                    label="Server seed hash (committed before deal)"
                    value={payload.commitment.serverSeedHash}
                    mono
                    copy
                    fullWidth
                  />
                  <KVRow
                    label="Server seed (revealed after showdown)"
                    value={payload.reveal.serverSeed}
                    mono
                    copy
                    fullWidth
                  />
                  <KVRow label="Client seed" value={payload.reveal.clientSeed} mono copy fullWidth />
                  <KVRow label="Nonce" value={String(payload.reveal.nonce)} />
                </div>
              </Card>

              {/* Hand */}
              <Card className="p-6 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
                <div className="flex items-center gap-2 mb-4">
                  <Spade className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-xl font-semibold text-white">Hand</h3>
                </div>
                <div className="mb-4">
                  <div className="text-sm text-white/60 mb-2">Community cards</div>
                  <div className="flex gap-2 flex-wrap">
                    {payload.communityCards.length === 0 ? (
                      <span className="text-white/40 text-sm">—</span>
                    ) : (
                      payload.communityCards.map((c, i) => <CardDisplay key={i} cardIndex={c} small />)
                    )}
                  </div>
                </div>
                <div className="space-y-3">
                  {payload.players.map((pl) => {
                    const winner = payload.result?.winners?.find(
                      (w) => w.address.toLowerCase() === pl.address.toLowerCase(),
                    );
                    return (
                      <div
                        key={pl.address}
                        className={`p-3 rounded border ${
                          winner ? 'border-yellow-400/40 bg-yellow-950/10' : 'border-white/10'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-mono text-sm text-white/90">
                            {pl.seatPosition != null ? `Seat ${pl.seatPosition} · ` : ''}
                            {shortAddr(pl.address)}
                          </div>
                          {winner && (
                            <div className="text-yellow-300 text-sm font-semibold">
                              +{winner.amount} {winner.handName ? `· ${winner.handName}` : ''}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {pl.holeCards.map((c, i) => (
                            <CardDisplay key={i} cardIndex={c} small />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Action log */}
              <Card className="p-6 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
                <h3 className="text-xl font-semibold text-white mb-4">Action log</h3>
                <div className="max-h-72 overflow-y-auto space-y-1 font-mono text-xs">
                  {payload.actions.length === 0 ? (
                    <div className="text-white/40">No actions recorded.</div>
                  ) : (
                    payload.actions.map((a) => (
                      <div key={a.order} className="text-white/80">
                        <span className="text-cyan-400/80 inline-block w-16">{a.street}</span>
                        <span className="inline-block w-32 text-white/60">{shortAddr(a.address)}</span>
                        <span className="inline-block w-20">{a.action}</span>
                        {Number(a.amount) > 0 && <span className="text-white/90">{a.amount}</span>}
                      </div>
                    ))
                  )}
                </div>
              </Card>

              {/* Recomputed deck */}
              <Card className="p-6 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
                <h3 className="text-xl font-semibold text-white mb-4">Deck (deal order)</h3>
                <p className="text-sm text-white/60 mb-3">
                  Computed in your browser from the revealed seed. Cards left-to-right is the order
                  chevtek would pop them from the deck.
                </p>
                <div className="flex flex-wrap gap-1">
                  {result.recomputedDeck
                    .slice()
                    .reverse()
                    .map((c, i) => (
                      <div key={i} className="flex flex-col items-center">
                        <CardDisplay cardIndex={c} small />
                        <span className="text-[10px] text-white/40 mt-0.5">{i + 1}</span>
                      </div>
                    ))}
                </div>
              </Card>

              {/* How to verify */}
              <Card className="p-6 bg-gradient-to-br from-slate-950 to-slate-900/20 backdrop-blur-lg border-white/10">
                <h3 className="text-xl font-semibold text-white mb-4">How to verify externally</h3>
                <ol className="list-decimal list-inside space-y-2 text-sm text-white/80">
                  {payload.howToVerify.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </Card>
            </div>
          )}
        </main>
      </div>
    </GlobalMainNav>
  );
}

function CheckCell({
  ok,
  title,
  okLine,
  failLine,
}: {
  ok: boolean;
  title: string;
  okLine: string;
  failLine: string;
}) {
  return (
    <div
      className={`p-4 rounded border ${
        ok ? 'border-green-400/30 bg-green-950/10' : 'border-red-400/30 bg-red-950/10'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        {ok ? (
          <CheckCircle className="w-4 h-4 text-green-400" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-red-400" />
        )}
        <span className="font-semibold">{title}</span>
      </div>
      <p className="text-sm text-white/70">{ok ? okLine : failLine}</p>
    </div>
  );
}

function KVRow({
  label,
  value,
  mono,
  copy,
  fullWidth,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copy?: boolean;
  fullWidth?: boolean;
}) {
  return (
    <div className={fullWidth ? 'md:col-span-2' : ''}>
      <div className="text-sm text-white/60 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <div
          className={`${mono ? 'font-mono text-xs' : 'text-sm'} text-white/90 break-all flex-1`}
        >
          {value}
        </div>
        {copy && <CopyButton text={value} />}
      </div>
    </div>
  );
}

export default function VerifyPokerPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <VerifyPokerPageInner />
    </Suspense>
  );
}
