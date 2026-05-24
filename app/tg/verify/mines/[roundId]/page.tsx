'use client';

/**
 * /tg/verify/mines/[roundId] — Telegram-friendly provably-fair Mines verifier.
 *
 * Public view of a single finalized Mines round. Pulls the verification
 * payload from `GET /api/arcade/mines/verify/:id`, then independently
 * recomputes both steps in the browser via WebCrypto:
 *
 *   1. sha256(serverSeed) === serverSeedHash (the pre-round commitment).
 *   2. Partial Fisher-Yates over [0..24], driven by HMAC-SHA256 of
 *      `${clientSeed}:${nonce}:${roundIndex}` keyed by serverSeed. After
 *      `bombs` swaps from the back, the last `bombs` elements (sorted) form
 *      the committed bomb grid.
 *
 * If both checks pass, the bombs were fixed at /start — the server didn't
 * move them mid-round to dodge the player's picks.
 *
 * Visual style mirrors `/tg/verify/limbo/[roundId]` so the two arcade
 * verifiers feel like a matched pair.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

const SCREEN_BG = 'linear-gradient(165deg,#0c1c30 0%,#050a14 72%)';
const CARD_BG = '#0b1a2c';
const BORDER = 'rgba(34,211,238,0.15)';

const TOTAL_CELLS = 25;

interface VerifyPayload {
  ok: true;
  roundId: string;
  bet: number;
  bombs: number;
  picks: number[];
  multiplierX100: number;
  payout: number;
  status: 'active' | 'cashed_out' | 'busted';
  serverSeedHash: string;
  serverSeed: string | null;
  bombsGrid: number[] | null;
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
// `bytesToFloat` chain in the browser. Returns the floats consumed by the
// Fisher-Yates step (one per swap, `bombs` total).
async function deriveBombGrid(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  bombs: number,
): Promise<{ grid: number[]; floats: number[] } | null> {
  try {
    const keyBytes = new TextEncoder().encode(serverSeed);
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    // Memoize each HMAC round (32 bytes) so straddling cursors don't recompute.
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

    const pool = Array.from({ length: TOTAL_CELLS }, (_, i) => i);
    const floats: number[] = [];
    let cursor = 0;
    for (let i = TOTAL_CELLS - 1; i >= TOTAL_CELLS - bombs; i--) {
      const bytes = await byteStream(cursor);
      cursor += 4;
      const r = bytesToFloat(bytes);
      floats.push(r);
      const j = Math.floor(r * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const grid = pool.slice(TOTAL_CELLS - bombs).sort((a, b) => a - b);
    return { grid, floats };
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
  const v = x100 / 100;
  if (v >= 100_000) return `${Math.floor(v / 1000).toLocaleString('en-US')}kx`;
  return `${v.toFixed(2)}x`;
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
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

// Renders the 5×5 grid with three states per cell: bomb (red), revealed-safe
// (cyan dot), or empty (dim outline). Two grids are drawn side-by-side
// (server-published vs. browser-derived) so a mismatch is visually obvious.
function MiniGrid({
  bombs,
  picks,
  highlight,
}: {
  bombs: number[];
  picks: number[];
  highlight: 'server' | 'derived';
}) {
  const bombSet = new Set(bombs);
  const pickSet = new Set(picks);
  return (
    <div
      className="grid gap-1.5 rounded-xl border p-2.5"
      style={{ background: CARD_BG, borderColor: BORDER, gridTemplateColumns: 'repeat(5, 1fr)' }}
      aria-label={`${highlight} bomb grid`}
    >
      {Array.from({ length: TOTAL_CELLS }, (_, i) => {
        const isBomb = bombSet.has(i);
        const isPick = pickSet.has(i);
        const bg = isBomb
          ? highlight === 'derived'
            ? 'rgba(34,211,238,0.18)'
            : 'rgba(239,68,68,0.22)'
          : isPick
            ? 'rgba(52,211,153,0.18)'
            : 'rgba(34,211,238,0.04)';
        const border = isBomb
          ? highlight === 'derived'
            ? 'rgba(34,211,238,0.55)'
            : 'rgba(239,68,68,0.55)'
          : isPick
            ? 'rgba(52,211,153,0.4)'
            : 'rgba(34,211,238,0.15)';
        return (
          <div
            key={i}
            className="flex aspect-square items-center justify-center rounded-md text-[12px] font-bold"
            style={{ background: bg, border: `1px solid ${border}`, color: '#e2f5fb' }}
            aria-label={`Cell ${i + 1}${isBomb ? ' (bomb)' : isPick ? ' (revealed)' : ''}`}
          >
            {isBomb ? '✦' : isPick ? '◆' : ''}
          </div>
        );
      })}
    </div>
  );
}

export default function TgVerifyMinesRoundPage() {
  const params = useParams<{ roundId: string }>();
  const roundId = typeof params?.roundId === 'string' ? params.roundId : '';

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [payload, setPayload] = useState<VerifyPayload | null>(null);

  const [localHash, setLocalHash] = useState<string | null>(null);
  const [hashState, setHashState] = useState<CheckState>('pending');

  const [derived, setDerived] = useState<{ grid: number[]; floats: number[] } | null>(null);
  const [gridState, setGridState] = useState<CheckState>('pending');

  const [showRawJson, setShowRawJson] = useState(false);

  // Minimal Telegram SDK touch — call ready() + expand() if available; never
  // gate the page on it (this view works fine outside Telegram too).
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
        const res = await fetch(`/api/arcade/mines/verify/${encodeURIComponent(roundId)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          const apiErr = data as ApiError;
          setErrorMsg(apiErr.message || apiErr.error || 'Could not load verification data.');
          setLoadState('error');
          return;
        }
        const p = data as VerifyPayload;
        setPayload(p);
        // Active rounds don't reveal the seed yet — show a stub view that just
        // shows the commitment + picks-so-far without claiming verification.
        setLoadState(p.status === 'active' ? 'active' : 'ready');
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

  // Step 1 — independent SHA-256(serverSeed) check.
  useEffect(() => {
    if (!payload || !payload.serverSeed) return;
    let cancelled = false;
    (async () => {
      const h = await sha256Hex(payload.serverSeed!);
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

  // Step 2 — independent bomb-grid re-derivation.
  useEffect(() => {
    if (!payload || !payload.serverSeed || !payload.bombsGrid) return;
    let cancelled = false;
    (async () => {
      const d = await deriveBombGrid(
        payload.serverSeed!,
        payload.clientSeed,
        payload.nonce,
        payload.bombs,
      );
      if (cancelled) return;
      if (!d) {
        setGridState('no-crypto');
        return;
      }
      setDerived(d);
      setGridState(arraysEqual(d.grid, payload.bombsGrid!) ? 'verified' : 'mismatch');
    })();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const overall: CheckState = useMemo(() => {
    if (hashState === 'no-crypto' || gridState === 'no-crypto') return 'no-crypto';
    if (hashState === 'mismatch' || gridState === 'mismatch') return 'mismatch';
    if (hashState === 'verified' && gridState === 'verified') return 'verified';
    return 'pending';
  }, [hashState, gridState]);

  const overallLabel =
    overall === 'verified'
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
            Mines Round Verifier
          </h1>
          <p className="text-[13px] text-white/60">
            Independently confirm that this Mines round&apos;s bombs were fixed before the first
            pick. The seed commitment and the bomb-grid derivation are both recomputed in your
            browser — no need to trust the server.
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

        {loadState === 'active' && payload && (
          <div
            className="rounded-2xl border p-4 text-[13px] text-white/80"
            style={{ background: CARD_BG, borderColor: BORDER }}
          >
            <p>
              This round is still in progress. The server has committed to a bomb grid via
              <span className="text-cyan-300"> sha256(serverSeed)</span> but won&apos;t reveal the
              seed itself until the round is cashed out or busted. Come back after the round
              ends to verify.
            </p>
            <HashRow label="server seed hash (commitment)" value={payload.serverSeedHash} />
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
                  <span className="text-[11px] uppercase tracking-wider text-cyan-300/70">
                    Round
                  </span>
                  <span
                    className="text-lg"
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                  >
                    {shortId(payload.roundId)}
                  </span>
                </div>
                <StatusBadge state={overall} label={overallLabel} />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                <dt className="text-white/50">Finalized</dt>
                <dd className="text-right text-white/90">
                  {payload.finalizedAt ? formatTimestamp(payload.finalizedAt) : '—'}
                </dd>
                <dt className="text-white/50">Bet</dt>
                <dd className="text-right font-semibold text-white/90 tabular-nums">
                  {payload.bet.toLocaleString('en-US')}
                </dd>
                <dt className="text-white/50">Bombs</dt>
                <dd className="text-right font-semibold text-cyan-300 tabular-nums">
                  {payload.bombs} / {TOTAL_CELLS}
                </dd>
                <dt className="text-white/50">Picks</dt>
                <dd className="text-right font-semibold text-white/90 tabular-nums">
                  {payload.picks.length}
                </dd>
                <dt className="text-white/50">Final multiplier</dt>
                <dd className="text-right font-semibold text-cyan-300 tabular-nums">
                  {formatMultiplierX100(payload.multiplierX100)}
                </dd>
                <dt className="text-white/50">Outcome</dt>
                <dd
                  className="text-right font-semibold"
                  style={{ color: payload.status === 'cashed_out' ? '#34d399' : '#fca5a5' }}
                >
                  {payload.status === 'cashed_out'
                    ? `Banked +${(payload.payout - payload.bet).toLocaleString('en-US')}`
                    : `Busted −${payload.bet.toLocaleString('en-US')}`}
                </dd>
                <dt className="text-white/50">House edge</dt>
                <dd className="text-right text-white/90">
                  {(payload.houseEdgeBp / 100).toFixed(2)}%
                </dd>
              </dl>
            </div>

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
              {payload.serverSeed && (
                <HashRow label="server seed (revealed after round)" value={payload.serverSeed} />
              )}
              {localHash && (
                <HashRow label="your browser computed sha256(serverSeed)" value={localHash} />
              )}
              <HashRow label="client seed" value={payload.clientSeed || '(empty)'} />
            </Section>

            <Section title="Step 2 · Bomb-grid re-derivation">
              <div className="flex items-center justify-end">
                <StatusBadge
                  state={gridState}
                  label={
                    gridState === 'verified'
                      ? 'Derived grid matches'
                      : gridState === 'mismatch'
                        ? 'Bomb grid mismatch'
                        : gridState === 'no-crypto'
                          ? 'Crypto API unavailable'
                          : 'Re-deriving…'
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-wider text-cyan-300/70">
                    Server published
                  </span>
                  {payload.bombsGrid && (
                    <MiniGrid
                      bombs={payload.bombsGrid}
                      picks={payload.picks}
                      highlight="server"
                    />
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] uppercase tracking-wider text-cyan-300/70">
                    Your browser derived
                  </span>
                  {derived && (
                    <MiniGrid bombs={derived.grid} picks={payload.picks} highlight="derived" />
                  )}
                  {!derived && (
                    <div
                      className="flex aspect-square items-center justify-center rounded-xl border text-[11px] text-white/40"
                      style={{ background: CARD_BG, borderColor: BORDER }}
                    >
                      …
                    </div>
                  )}
                </div>
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
                GET /api/arcade/mines/verify/{shortId(payload.roundId)}
              </code>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
