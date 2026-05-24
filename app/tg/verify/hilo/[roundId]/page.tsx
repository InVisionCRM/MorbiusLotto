'use client';

/**
 * /tg/verify/hilo/[roundId] — Telegram-friendly provably-fair Hi-Lo verifier.
 *
 * Public view of a single finalized Hi-Lo round. Pulls the verification
 * payload from `GET /api/arcade/hilo/verify/:id`, then independently
 * recomputes both steps in the browser via WebCrypto:
 *
 *   1. sha256(serverSeed) === serverSeedHash  (the pre-round commitment).
 *   2. For each card N=0..cards.length-1, derive cardIndex from the HMAC
 *      stream at cursor = N*4:
 *        bytes = HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:${roundIdx}`)
 *                  .slice(byteOffset, byteOffset + 4)
 *        r     = bytes[0]/256 + bytes[1]/256² + bytes[2]/256³ + bytes[3]/256⁴
 *        index = min(51, floor(r × 52))
 *        rank  = (index % 13) + 1  (A=1, K=13)
 *        suit  = floor(index / 13) (0♥ 1♦ 2♣ 3♠)
 *      …and compare the full derived card array to the server's `cards`.
 *
 * If both checks pass, the entire 12-card deal of the round was fixed at
 * /start — the server didn't re-deal cards to dodge picks. Visual style
 * mirrors `/tg/verify/limbo/[roundId]` and `/tg/verify/mines/[roundId]` so
 * the three arcade verifiers feel like a matched set.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

const SCREEN_BG = 'linear-gradient(165deg,#0c1c30 0%,#050a14 72%)';
const CARD_BG = '#0b1a2c';
const BORDER = 'rgba(34,211,238,0.15)';

const SUIT_SYM = ['♥', '♦', '♣', '♠'];
const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

interface CardJson {
  index: number;
  rank: number;
  suit: number;
}

interface VerifyPayload {
  ok: true;
  roundId: string;
  bet: number;
  cards: CardJson[];
  picks: ('hi' | 'lo')[];
  multiplierX100: number;
  payout: number;
  status: 'active' | 'cashed_out' | 'busted';
  serverSeedHash: string;
  serverSeed: string | null;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  createdAt: string;
  finalizedAt: string | null;
  recipe: string;
}

interface ApiError {
  ok?: false;
  error?: string;
  message?: string;
}

type LoadState = 'loading' | 'error' | 'ready' | 'active';
type CheckState = 'pending' | 'verified' | 'mismatch' | 'no-crypto';

const hex = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

async function sha256Hex(input: string): Promise<string | null> {
  try {
    const enc = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return hex(buf);
  } catch {
    return null;
  }
}

// Mirror the server's `hmacByteStream(serverSeed, clientSeed, nonce, cursor)` →
// `bytesToFloat` → `floor(float * 52)` chain in the browser. Returns one card
// (with the consumed 4 bytes + derived float) per card slot in the round.
async function deriveCards(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  cardCount: number,
): Promise<Array<{ index: number; rank: number; suit: number; float: number; bytes: Uint8Array }> | null> {
  try {
    const keyBytes = new TextEncoder().encode(serverSeed);
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const roundCache = new Map<number, Uint8Array>();
    const hmacRound = async (roundIndex: number): Promise<Uint8Array> => {
      const cached = roundCache.get(roundIndex);
      if (cached) return cached;
      const msg = new TextEncoder().encode(`${clientSeed}:${nonce}:${roundIndex}`);
      const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
      roundCache.set(roundIndex, sig);
      return sig;
    };
    const byteStream = async (cursor: number): Promise<Uint8Array> => {
      const round = Math.floor(cursor / 32);
      const offset = cursor % 32;
      const a = await hmacRound(round);
      if (offset + 4 <= 32) return a.slice(offset, offset + 4);
      const b = await hmacRound(round + 1);
      const head = a.slice(offset, 32);
      const tail = b.slice(0, 4 - head.length);
      const out = new Uint8Array(4);
      out.set(head, 0);
      out.set(tail, head.length);
      return out;
    };
    const bytesToFloat = (bytes: Uint8Array): number =>
      bytes[0]! / 256 +
      bytes[1]! / (256 * 256) +
      bytes[2]! / (256 * 256 * 256) +
      bytes[3]! / (256 * 256 * 256 * 256);

    const out: Array<{ index: number; rank: number; suit: number; float: number; bytes: Uint8Array }> = [];
    for (let n = 0; n < cardCount; n++) {
      const bytes = await byteStream(n * 4);
      const f = bytesToFloat(bytes);
      const idx = Math.min(51, Math.floor(f * 52));
      out.push({
        index: idx,
        rank: (idx % 13) + 1,
        suit: Math.floor(idx / 13),
        float: f,
        bytes,
      });
    }
    return out;
  } catch {
    return null;
  }
}

function shortId(a: string): string {
  return a.length >= 12 ? `${a.slice(0, 8)}…${a.slice(-4)}` : a;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatMultiplierX100(x100: number): string {
  return `${(x100 / 100).toFixed(2)}x`;
}

function cardsEqual(a: CardJson[], b: { index: number }[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i]!.index !== b[i]!.index) return false;
  return true;
}

function HashRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — ignore */
    }
  };
  return (
    <div
      className="flex flex-col gap-1 rounded-xl border p-3"
      style={{ background: CARD_BG, borderColor: BORDER }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-cyan-300/80">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-md border border-cyan-500/30 px-2 py-0.5 text-[11px] text-cyan-200 hover:bg-cyan-500/10"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <code
        className="break-all text-[12px] leading-snug text-white/90"
        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
      >
        {value}
      </code>
    </div>
  );
}

function StatusBadge({ state, label }: { state: CheckState; label: string }) {
  const map: Record<CheckState, { color: string; bg: string; prefix: string }> = {
    pending: { color: '#fcd34d', bg: 'rgba(252,211,77,0.10)', prefix: '…' },
    verified: { color: '#34d399', bg: 'rgba(52,211,153,0.10)', prefix: '✓' },
    mismatch: { color: '#f87171', bg: 'rgba(248,113,113,0.10)', prefix: '✗' },
    'no-crypto': { color: '#9ca3af', bg: 'rgba(156,163,175,0.10)', prefix: '⚠' },
  };
  const v = map[state];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold"
      style={{ color: v.color, borderColor: v.color, background: v.bg }}
    >
      <span>{v.prefix}</span>
      {label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2
        className="text-[13px] uppercase tracking-[0.18em] text-cyan-200/70"
        style={{ fontFamily: 'Mitr, system-ui, sans-serif' }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function CardChip({ card, dim }: { card: CardJson; dim?: boolean }) {
  const red = card.suit === 0 || card.suit === 1;
  return (
    <div
      className="flex h-[58px] w-[40px] flex-col items-center justify-center rounded-md border text-[13px] font-extrabold"
      style={{
        background: dim ? 'rgba(255,255,255,0.04)' : 'linear-gradient(162deg,#ffffff,#dde6f1)',
        borderColor: dim ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.18)',
        color: dim ? 'rgba(255,255,255,0.5)' : red ? '#e5384f' : '#1b2436',
      }}
      aria-label={`${RANK_LABEL[card.rank]} of ${['hearts', 'diamonds', 'clubs', 'spades'][card.suit]}`}
    >
      <div>{RANK_LABEL[card.rank]}</div>
      <div className="text-[11px]">{SUIT_SYM[card.suit]}</div>
    </div>
  );
}

export default function TgVerifyHiLoRoundPage() {
  const params = useParams<{ roundId: string }>();
  const roundId = typeof params?.roundId === 'string' ? params.roundId : '';

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [payload, setPayload] = useState<VerifyPayload | null>(null);

  const [localHash, setLocalHash] = useState<string | null>(null);
  const [hashState, setHashState] = useState<CheckState>('pending');

  const [derived, setDerived] = useState<Array<{
    index: number;
    rank: number;
    suit: number;
    float: number;
    bytes: Uint8Array;
  }> | null>(null);
  const [cardsState, setCardsState] = useState<CheckState>('pending');

  const [showRawJson, setShowRawJson] = useState(false);

  // Minimal Telegram SDK touch — call ready() + expand() if available.
  useEffect(() => {
    const w = window as unknown as {
      Telegram?: { WebApp?: { ready: () => void; expand: () => void } };
    };
    try {
      w.Telegram?.WebApp?.ready();
      w.Telegram?.WebApp?.expand();
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    if (!roundId) {
      setErrorMsg('No round ID in the URL.');
      setLoadState('error');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/arcade/hilo/verify/${encodeURIComponent(roundId)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          const apiErr = data as ApiError;
          setErrorMsg(apiErr.message || apiErr.error || 'Could not load verification data.');
          setLoadState('error');
          return;
        }
        setPayload(data as VerifyPayload);
        setLoadState((data as VerifyPayload).status === 'active' ? 'active' : 'ready');
      } catch {
        if (cancelled) return;
        setErrorMsg('Could not reach the verifier. Check your connection.');
        setLoadState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId]);

  // Step 1 — sha256(serverSeed) check (only after the round has finalized).
  useEffect(() => {
    if (!payload || !payload.serverSeed) return;
    const seed = payload.serverSeed;
    let cancelled = false;
    (async () => {
      const h = await sha256Hex(seed);
      if (cancelled) return;
      if (h == null) {
        setHashState('no-crypto');
        return;
      }
      setLocalHash(h);
      setHashState(
        h.toLowerCase() === payload.serverSeedHash.toLowerCase() ? 'verified' : 'mismatch',
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  // Step 2 — re-derive every card and compare to the published `cards` array.
  useEffect(() => {
    if (!payload || !payload.serverSeed) return;
    const seed = payload.serverSeed;
    let cancelled = false;
    (async () => {
      const d = await deriveCards(seed, payload.clientSeed, payload.nonce, payload.cards.length);
      if (cancelled) return;
      if (!d) {
        setCardsState('no-crypto');
        return;
      }
      setDerived(d);
      setCardsState(cardsEqual(payload.cards, d) ? 'verified' : 'mismatch');
    })();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const overall: CheckState = useMemo(() => {
    if (hashState === 'no-crypto' || cardsState === 'no-crypto') return 'no-crypto';
    if (hashState === 'mismatch' || cardsState === 'mismatch') return 'mismatch';
    if (hashState === 'verified' && cardsState === 'verified') return 'verified';
    return 'pending';
  }, [hashState, cardsState]);

  const overallLabel =
    loadState === 'active'
      ? 'Round in progress'
      : overall === 'verified'
        ? 'Verified in your browser'
        : overall === 'mismatch'
          ? 'Verification failed'
          : overall === 'no-crypto'
            ? 'Crypto API unavailable'
            : 'Verifying…';

  return (
    <main
      className="min-h-screen w-full text-white"
      style={{ background: SCREEN_BG, fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 py-6 pb-16">
        <header className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.22em] text-cyan-300/70">
            MORBIUS · provably fair
          </span>
          <h1
            className="text-2xl"
            style={{ fontFamily: 'Mitr, system-ui, sans-serif', letterSpacing: '0.02em' }}
          >
            Hi-Lo Round Verifier
          </h1>
          <p className="text-[13px] text-white/60">
            Independently confirm that every card in this Hi-Lo round was fixed before the deal.
            Both the seed commitment and the full card sequence are re-derived in your browser —
            no need to trust the server.
          </p>
        </header>

        {loadState === 'loading' && (
          <div
            className="rounded-2xl border p-4 text-[14px] text-white/70"
            style={{ background: CARD_BG, borderColor: BORDER }}
          >
            Loading round…
          </div>
        )}

        {loadState === 'error' && (
          <div
            className="rounded-2xl border p-4 text-[14px]"
            style={{
              background: 'rgba(248,113,113,0.06)',
              borderColor: 'rgba(248,113,113,0.35)',
              color: '#fca5a5',
            }}
          >
            {errorMsg}
          </div>
        )}

        {(loadState === 'ready' || loadState === 'active') && payload && (
          <>
            <div
              className="flex flex-col gap-3 rounded-2xl border p-4"
              style={{ background: CARD_BG, borderColor: BORDER }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-wider text-cyan-300/70">
                    Round
                  </span>
                  <span
                    className="text-lg"
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  >
                    {shortId(payload.roundId)}
                  </span>
                </div>
                <StatusBadge state={loadState === 'active' ? 'pending' : overall} label={overallLabel} />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                <dt className="text-white/50">Started</dt>
                <dd className="text-right text-white/90">{formatTimestamp(payload.createdAt)}</dd>
                {payload.finalizedAt && (
                  <>
                    <dt className="text-white/50">Finalized</dt>
                    <dd className="text-right text-white/90">
                      {formatTimestamp(payload.finalizedAt)}
                    </dd>
                  </>
                )}
                <dt className="text-white/50">Bet</dt>
                <dd className="text-right font-semibold text-white/90 tabular-nums">
                  {payload.bet.toLocaleString('en-US')}
                </dd>
                <dt className="text-white/50">Multiplier</dt>
                <dd className="text-right font-semibold text-cyan-300 tabular-nums">
                  {formatMultiplierX100(payload.multiplierX100)}
                </dd>
                <dt className="text-white/50">Status</dt>
                <dd
                  className="text-right font-semibold"
                  style={{
                    color:
                      payload.status === 'cashed_out'
                        ? '#fbbf24'
                        : payload.status === 'busted'
                          ? '#fca5a5'
                          : '#fcd34d',
                  }}
                >
                  {payload.status === 'cashed_out'
                    ? `Cashed out +${(payload.payout - payload.bet).toLocaleString('en-US')}`
                    : payload.status === 'busted'
                      ? `Busted −${payload.bet.toLocaleString('en-US')}`
                      : 'Active'}
                </dd>
                <dt className="text-white/50">House edge</dt>
                <dd className="text-right text-white/90">
                  {(payload.houseEdgeBp / 100).toFixed(2)}%
                </dd>
              </dl>
              <p className="border-t border-cyan-500/10 pt-3 text-[12px] leading-snug text-white/55">
                Before the round the server published{' '}
                <span className="text-cyan-300">sha256(serverSeed)</span>. After the round the
                seed itself is revealed — your browser re-hashes it, re-runs the HMAC stream, and
                regenerates every card slot.
              </p>
            </div>

            {/* Card chain — server vs. derived. */}
            <Section title="Cards dealt">
              <div className="flex flex-col gap-3">
                <div
                  className="flex flex-col gap-2 rounded-xl border p-3"
                  style={{ background: CARD_BG, borderColor: BORDER }}
                >
                  <div className="text-[11px] uppercase tracking-wider text-cyan-300/80">
                    Server-published
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {payload.cards.map((c, i) => (
                      <CardChip key={`s-${i}-${c.index}`} card={c} />
                    ))}
                  </div>
                  {payload.picks.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-white/60">
                      {payload.picks.map((p, i) => (
                        <span
                          key={`p-${i}`}
                          className="rounded border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5"
                        >
                          pick {i + 1}: {p === 'hi' ? '≥ higher' : 'lower'}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div
                  className="flex flex-col gap-2 rounded-xl border p-3"
                  style={{ background: CARD_BG, borderColor: BORDER }}
                >
                  <div className="text-[11px] uppercase tracking-wider text-cyan-300/80">
                    Re-derived in your browser
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {derived ? (
                      derived.map((c, i) => (
                        <CardChip key={`d-${i}-${c.index}`} card={c} />
                      ))
                    ) : loadState === 'active' ? (
                      <span className="text-[12px] text-white/60">
                        Server seed is sealed until the round ends — cards stay un-verifiable here
                        in the meantime.
                      </span>
                    ) : (
                      <span className="text-[12px] text-white/60">Deriving…</span>
                    )}
                  </div>
                </div>
              </div>
            </Section>

            {loadState !== 'active' && payload.serverSeed && (
              <>
                <Section title="Step 1 · Seed commitment">
                  <div className="flex items-center justify-end">
                    <StatusBadge
                      state={hashState}
                      label={
                        hashState === 'verified'
                          ? 'sha256(serverSeed) matches'
                          : hashState === 'mismatch'
                            ? 'Hash mismatch'
                            : hashState === 'no-crypto'
                              ? 'Crypto API unavailable'
                              : 'Hashing…'
                      }
                    />
                  </div>
                  <HashRow
                    label="server seed hash (committed before round)"
                    value={payload.serverSeedHash}
                  />
                  <HashRow
                    label="server seed (revealed after round)"
                    value={payload.serverSeed}
                  />
                  {localHash && (
                    <HashRow
                      label="your browser computed sha256(serverSeed)"
                      value={localHash}
                    />
                  )}
                  <HashRow label="client seed" value={payload.clientSeed || '(empty)'} />
                  <div
                    className="rounded-xl border p-3 text-[12px] text-white/70"
                    style={{ background: CARD_BG, borderColor: BORDER }}
                  >
                    <span className="text-white/50">nonce </span>
                    <code
                      className="text-cyan-300"
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      }}
                    >
                      {payload.nonce}
                    </code>
                  </div>
                </Section>

                <Section title="Step 2 · Card re-derivation">
                  <div className="flex items-center justify-end">
                    <StatusBadge
                      state={cardsState}
                      label={
                        cardsState === 'verified'
                          ? `${payload.cards.length} cards match`
                          : cardsState === 'mismatch'
                            ? 'Card sequence mismatch'
                            : cardsState === 'no-crypto'
                              ? 'Crypto API unavailable'
                              : 'Re-deriving…'
                      }
                    />
                  </div>
                  <div
                    className="overflow-x-auto rounded-xl border"
                    style={{ background: CARD_BG, borderColor: BORDER }}
                  >
                    <table
                      className="w-full min-w-[440px] text-[11px]"
                      style={{ borderCollapse: 'collapse' }}
                    >
                      <thead>
                        <tr className="text-left text-white/55">
                          <th className="px-3 py-2 font-semibold">N</th>
                          <th className="px-3 py-2 font-semibold">bytes</th>
                          <th className="px-3 py-2 font-semibold">float r</th>
                          <th className="px-3 py-2 font-semibold">derived</th>
                          <th className="px-3 py-2 font-semibold">server</th>
                        </tr>
                      </thead>
                      <tbody>
                        {payload.cards.map((srv, i) => {
                          const drv = derived?.[i];
                          const match = drv ? drv.index === srv.index : null;
                          return (
                            <tr
                              key={i}
                              className="border-t"
                              style={{ borderColor: 'rgba(34,211,238,0.10)' }}
                            >
                              <td className="px-3 py-1.5 text-white/55 tabular-nums">{i}</td>
                              <td
                                className="px-3 py-1.5 text-cyan-200"
                                style={{
                                  fontFamily:
                                    'ui-monospace, SFMono-Regular, Menlo, monospace',
                                }}
                              >
                                {drv
                                  ? Array.from(drv.bytes)
                                      .map((b) => b.toString(16).padStart(2, '0'))
                                      .join(' ')
                                  : '…'}
                              </td>
                              <td
                                className="px-3 py-1.5 text-cyan-200 tabular-nums"
                                style={{
                                  fontFamily:
                                    'ui-monospace, SFMono-Regular, Menlo, monospace',
                                }}
                              >
                                {drv ? drv.float.toFixed(10) : '…'}
                              </td>
                              <td
                                className="px-3 py-1.5 font-semibold tabular-nums"
                                style={{
                                  color:
                                    match === false
                                      ? '#f87171'
                                      : match === true
                                        ? '#34d399'
                                        : '#e2e8f0',
                                }}
                              >
                                {drv
                                  ? `${RANK_LABEL[drv.rank]}${SUIT_SYM[drv.suit]} (#${drv.index})`
                                  : '…'}
                              </td>
                              <td className="px-3 py-1.5 text-white/90 font-semibold tabular-nums">
                                {RANK_LABEL[srv.rank]}
                                {SUIT_SYM[srv.suit]}{' '}
                                <span className="text-white/50">(#{srv.index})</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p
                    className="rounded-xl border p-3 text-[11px] leading-relaxed text-white/55"
                    style={{
                      background: CARD_BG,
                      borderColor: BORDER,
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  >
                    {payload.recipe}
                  </p>
                </Section>
              </>
            )}

            <button
              type="button"
              onClick={() => setShowRawJson((v) => !v)}
              className="self-start rounded-md border border-cyan-500/30 px-3 py-1.5 text-[12px] text-cyan-200 hover:bg-cyan-500/10"
            >
              {showRawJson ? 'Hide raw JSON' : 'Show raw JSON'}
            </button>

            {showRawJson && (
              <pre
                className="overflow-x-auto rounded-2xl border p-3 text-[11px] leading-snug text-white/75"
                style={{
                  background: '#050d18',
                  borderColor: BORDER,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              >
                {JSON.stringify(payload, null, 2)}
              </pre>
            )}

            <footer className="pt-2 text-center text-[11px] text-white/40">
              Verifier source:{' '}
              <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                GET /api/arcade/hilo/verify/{shortId(payload.roundId)}
              </code>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
