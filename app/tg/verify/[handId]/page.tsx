'use client';

/**
 * /tg/verify/[handId] — Telegram-friendly provably-fair hand verifier.
 *
 * Public (no auth, no session) view of a single completed poker hand. Pulls
 * the verification payload from `GET /api/poker/verify/:handId`, then
 * independently recomputes `sha256(serverSeed)` in the browser via WebCrypto
 * and compares it to the published `serverSeedHash`. If they match, the
 * server's commitment was honest — the deck order was fixed *before* play.
 *
 * Visual style mirrors the main Mini App hub: navy gradient, cyan accents,
 * Mitr headings. Renders fine outside Telegram too (no SDK required).
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatPokerCardIndexLabel, pokerCardSuitIndex } from '@/components/poker/CardDisplay';

const SCREEN_BG = 'linear-gradient(165deg,#0c1c30 0%,#050a14 72%)';
const CARD_BG = '#0b1a2c';
const BORDER = 'rgba(34,211,238,0.15)';

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
  players: Array<{ address: string; seatPosition: number | null; holeCards: number[] }>;
  communityCards: number[];
  actions: Array<{ order: number; street: string; address: string; action: string; amount: string }>;
  result?: unknown;
}

interface ApiError {
  error: string;
  message?: string;
}

type LoadState = 'loading' | 'error' | 'ready';

async function sha256Hex(input: string): Promise<string | null> {
  try {
    const enc = new TextEncoder().encode(input);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

function shortAddr(a: string): string {
  return a.length >= 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
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

function CardChip({ idx }: { idx: number }) {
  const label = formatPokerCardIndexLabel(idx);
  const suit = pokerCardSuitIndex(idx);
  // Red for diamonds/hearts (suit 1, 2 in CardDisplay encoding).
  const red = suit === 1 || suit === 2;
  return (
    <span
      className="inline-flex h-8 min-w-[40px] items-center justify-center rounded-md border px-2 font-semibold"
      style={{
        background: '#0a1828',
        borderColor: BORDER,
        color: red ? '#f87171' : '#ffffff',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 14,
      }}
    >
      {label || '??'}
    </span>
  );
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

function StatusBadge({
  state,
}: {
  state: 'pending' | 'verified' | 'mismatch' | 'no-crypto';
}) {
  const map: Record<typeof state, { label: string; color: string; bg: string }> = {
    pending: { label: 'Verifying…', color: '#fcd34d', bg: 'rgba(252,211,77,0.10)' },
    verified: { label: '✓ Verified in your browser', color: '#34d399', bg: 'rgba(52,211,153,0.10)' },
    mismatch: { label: '✗ Hash mismatch', color: '#f87171', bg: 'rgba(248,113,113,0.10)' },
    'no-crypto': { label: 'Crypto API unavailable', color: '#9ca3af', bg: 'rgba(156,163,175,0.10)' },
  };
  const v = map[state];
  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1 text-[13px] font-semibold"
      style={{ color: v.color, borderColor: v.color, background: v.bg }}
    >
      {v.label}
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

export default function TgVerifyHandPage() {
  const params = useParams<{ handId: string }>();
  const handId = typeof params?.handId === 'string' ? params.handId : '';

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [payload, setPayload] = useState<VerifyPayload | null>(null);
  const [localHash, setLocalHash] = useState<string | null>(null);
  const [hashState, setHashState] = useState<'pending' | 'verified' | 'mismatch' | 'no-crypto'>(
    'pending',
  );
  const [showRawJson, setShowRawJson] = useState(false);

  // Minimal Telegram SDK touch — call ready() + expand() if available; never
  // gate the page on it (this view is useful outside Telegram too).
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
    if (!handId) {
      setErrorMsg('No hand ID in the URL.');
      setLoadState('error');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/poker/verify/${encodeURIComponent(handId)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          const apiErr = data as ApiError;
          setErrorMsg(apiErr.message || apiErr.error || 'Could not load verification data.');
          setLoadState('error');
          return;
        }
        setPayload(data as VerifyPayload);
        setLoadState('ready');
      } catch {
        if (cancelled) return;
        setErrorMsg('Could not reach the verifier. Check your connection.');
        setLoadState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handId]);

  // Independent client-side SHA-256 check.
  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    (async () => {
      const h = await sha256Hex(payload.reveal.serverSeed);
      if (cancelled) return;
      if (h == null) {
        setHashState('no-crypto');
        return;
      }
      setLocalHash(h);
      setHashState(
        h.toLowerCase() === payload.commitment.serverSeedHash.toLowerCase()
          ? 'verified'
          : 'mismatch',
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const actionsByStreet = useMemo(() => {
    if (!payload) return [] as Array<{ street: string; rows: VerifyPayload['actions'] }>;
    const order = ['preflop', 'flop', 'turn', 'river', 'showdown'];
    const buckets = new Map<string, VerifyPayload['actions']>();
    for (const a of payload.actions) {
      const key = a.street || 'other';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(a);
    }
    return order
      .filter((s) => buckets.has(s))
      .map((s) => ({ street: s, rows: buckets.get(s)! }))
      .concat(
        Array.from(buckets.keys())
          .filter((k) => !order.includes(k))
          .map((k) => ({ street: k, rows: buckets.get(k)! })),
      );
  }, [payload]);

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
            Hand Verifier
          </h1>
          <p className="text-[13px] text-white/60">
            Independently confirm that this poker hand&apos;s deck order was fixed before any cards
            were dealt. Verification runs in your browser — no need to trust the server.
          </p>
        </header>

        {loadState === 'loading' && (
          <div
            className="rounded-2xl border p-4 text-[14px] text-white/70"
            style={{ background: CARD_BG, borderColor: BORDER }}
          >
            Loading hand…
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

        {loadState === 'ready' && payload && (
          <>
            <div
              className="flex flex-col gap-3 rounded-2xl border p-4"
              style={{ background: CARD_BG, borderColor: BORDER }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-wider text-cyan-300/70">Hand</span>
                  <span
                    className="text-lg"
                    style={{ fontFamily: 'Mitr, system-ui, sans-serif' }}
                  >
                    #{payload.handNumber}
                  </span>
                </div>
                <StatusBadge state={hashState} />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                <dt className="text-white/50">Completed</dt>
                <dd className="text-right text-white/90">{formatTimestamp(payload.completedAt)}</dd>
                <dt className="text-white/50">Table</dt>
                <dd
                  className="text-right text-white/90"
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                >
                  {shortAddr(payload.tableId)}
                </dd>
                {payload.tournamentId && (
                  <>
                    <dt className="text-white/50">Tournament</dt>
                    <dd
                      className="text-right text-white/90"
                      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                    >
                      {shortAddr(payload.tournamentId)}
                    </dd>
                  </>
                )}
                <dt className="text-white/50">Server claim</dt>
                <dd className="text-right text-white/90">
                  {payload.verifiable ? 'verifiable' : 'unverifiable'}
                </dd>
              </dl>
              <p className="border-t border-cyan-500/10 pt-3 text-[12px] leading-snug text-white/55">
                The server commits to a <span className="text-cyan-300">serverSeed</span> before the
                hand by publishing its SHA-256 hash. After showdown the seed itself is revealed —
                your browser re-hashes it and compares against the commitment.
              </p>
            </div>

            <Section title="Commitment & reveal">
              <HashRow label="server seed hash (committed before deal)" value={payload.commitment.serverSeedHash} />
              <HashRow label="server seed (revealed at showdown)" value={payload.reveal.serverSeed} />
              {localHash && (
                <HashRow label="your browser computed sha256(serverSeed)" value={localHash} />
              )}
              <HashRow
                label="client seed"
                value={payload.reveal.clientSeed || '(empty)'}
              />
            </Section>

            <Section title="Community cards">
              <div
                className="flex flex-wrap gap-1.5 rounded-2xl border p-3"
                style={{ background: CARD_BG, borderColor: BORDER }}
              >
                {payload.communityCards.length === 0 && (
                  <span className="text-[13px] text-white/50">No community cards on this hand.</span>
                )}
                {payload.communityCards.map((c, i) => (
                  <CardChip key={`comm-${i}-${c}`} idx={c} />
                ))}
              </div>
            </Section>

            <Section title={`Players (${payload.players.length})`}>
              <div className="flex flex-col gap-2">
                {payload.players.map((p) => (
                  <div
                    key={p.address}
                    className="flex items-center justify-between gap-3 rounded-xl border p-3"
                    style={{ background: CARD_BG, borderColor: BORDER }}
                  >
                    <div className="flex flex-col">
                      <span
                        className="text-[13px] text-white/90"
                        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                      >
                        {shortAddr(p.address)}
                      </span>
                      {p.seatPosition != null && (
                        <span className="text-[11px] text-white/40">seat {p.seatPosition}</span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      {p.holeCards.map((c, i) => (
                        <CardChip key={`${p.address}-${i}`} idx={c} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Action log">
              <div className="flex flex-col gap-2">
                {actionsByStreet.length === 0 && (
                  <div
                    className="rounded-xl border p-3 text-[13px] text-white/50"
                    style={{ background: CARD_BG, borderColor: BORDER }}
                  >
                    No actions recorded.
                  </div>
                )}
                {actionsByStreet.map(({ street, rows }) => (
                  <div
                    key={street}
                    className="rounded-xl border p-3"
                    style={{ background: CARD_BG, borderColor: BORDER }}
                  >
                    <div className="mb-1.5 text-[11px] uppercase tracking-wider text-cyan-300/70">
                      {street}
                    </div>
                    <ul className="flex flex-col gap-1">
                      {rows.map((a) => (
                        <li
                          key={a.order}
                          className="flex items-center justify-between gap-3 text-[12px]"
                        >
                          <span
                            className="text-white/70"
                            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                          >
                            {shortAddr(a.address)}
                          </span>
                          <span className="text-white/90">
                            {a.action}
                            {a.amount && a.amount !== '0' ? (
                              <span className="ml-2 text-cyan-300">{a.amount}</span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Deck (raw)">
              <div
                className="rounded-2xl border p-3 text-[11px] leading-relaxed text-white/65"
                style={{
                  background: CARD_BG,
                  borderColor: BORDER,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              >
                <div className="mb-1 text-cyan-300/80">deal order (first card → last)</div>
                <div className="break-words">{payload.deck.dealOrder.join(', ')}</div>
                <div className="mt-2 border-t border-cyan-500/10 pt-2 text-white/45">
                  {payload.deck.encoding}
                </div>
              </div>
            </Section>

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
                GET /api/poker/verify/{payload.handId.slice(0, 8)}…
              </code>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
