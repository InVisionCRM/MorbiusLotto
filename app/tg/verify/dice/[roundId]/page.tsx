'use client';

/**
 * /tg/verify/dice/[roundId] — Telegram-friendly provably-fair Dice verifier.
 *
 * Public (no auth, no session) view of a single completed Dice round. Pulls
 * the verification payload from `GET /api/arcade/dice/verify/:id`, then
 * independently recomputes both steps in the browser via WebCrypto:
 *
 *   1. sha256(serverSeed) === serverSeedHash  (the pre-round commitment)
 *   2. HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:0`) → first 4 bytes
 *      → float r ∈ [0,1) → rollX100 = floor(r × 10000)   — and that equals
 *      the published rollX100.
 *
 * If both checks pass, the round was honest: the dice face was fixed before
 * the round began. Visual style mirrors `/tg/verify/limbo/[roundId]` so the
 * two pages feel like a matched pair.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

const SCREEN_BG = 'linear-gradient(165deg,#0c1c30 0%,#050a14 72%)';
const CARD_BG = '#0b1a2c';
const BORDER = 'rgba(34,211,238,0.15)';

interface VerifyPayload {
  ok: true;
  roundId: string;
  bet: number;
  targetX100: number;
  rollX100: number;
  multiplierX100: number;
  recomputedMultiplierX100: number;
  won: boolean;
  payout: number;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  createdAt: string;
  recipe: string;
}

interface ApiError {
  ok?: false;
  error?: string;
  message?: string;
}

type LoadState = 'loading' | 'error' | 'ready';
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

// Re-derive the round's float and roll from the revealed seeds. Mirrors
// `pfService.hmacByteStream(serverSeed, clientSeed, nonce, 0)` +
// `pfService.bytesToFloat(bytes)` + `rollX100FromFloat` on the server.
async function deriveRollX100(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): Promise<{ float: number; rollX100: number; bytesHex: string } | null> {
  try {
    const keyBytes = new TextEncoder().encode(serverSeed);
    const msgBytes = new TextEncoder().encode(`${clientSeed}:${nonce}:0`);
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, msgBytes));
    const b0 = sig[0]!;
    const b1 = sig[1]!;
    const b2 = sig[2]!;
    const b3 = sig[3]!;
    const float =
      b0 / 256 + b1 / (256 * 256) + b2 / (256 * 256 * 256) + b3 / (256 * 256 * 256 * 256);
    const rollX100 = Math.min(9999, Math.max(0, Math.floor(float * 10_000)));
    const bytesHex = `${b0.toString(16).padStart(2, '0')} ${b1
      .toString(16)
      .padStart(2, '0')} ${b2.toString(16).padStart(2, '0')} ${b3
      .toString(16)
      .padStart(2, '0')}`;
    return { float, rollX100, bytesHex };
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

function formatRoll(x100: number): string {
  return (x100 / 100).toFixed(2);
}

function formatMultiplierX100(x100: number): string {
  const v = x100 / 100;
  return `${v.toFixed(2)}x`;
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

export default function TgVerifyDiceRoundPage() {
  const params = useParams<{ roundId: string }>();
  const roundId = typeof params?.roundId === 'string' ? params.roundId : '';

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [payload, setPayload] = useState<VerifyPayload | null>(null);

  const [localHash, setLocalHash] = useState<string | null>(null);
  const [hashState, setHashState] = useState<CheckState>('pending');

  const [derived, setDerived] = useState<{
    float: number;
    rollX100: number;
    bytesHex: string;
  } | null>(null);
  const [rollState, setRollState] = useState<CheckState>('pending');

  const [showRawJson, setShowRawJson] = useState(false);

  // Minimal Telegram SDK touch — never gate on it (this view works fine
  // outside Telegram too).
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
        const res = await fetch(`/api/arcade/dice/verify/${encodeURIComponent(roundId)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
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
  }, [roundId]);

  // Step 1 — independent SHA-256(serverSeed) check.
  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    (async () => {
      const h = await sha256Hex(payload.serverSeed);
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

  // Step 2 — independent roll re-derivation.
  useEffect(() => {
    if (!payload) return;
    let cancelled = false;
    (async () => {
      const d = await deriveRollX100(payload.serverSeed, payload.clientSeed, payload.nonce);
      if (cancelled) return;
      if (!d) {
        setRollState('no-crypto');
        return;
      }
      setDerived(d);
      setRollState(d.rollX100 === payload.rollX100 ? 'verified' : 'mismatch');
    })();
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const overall: CheckState = useMemo(() => {
    if (hashState === 'no-crypto' || rollState === 'no-crypto') return 'no-crypto';
    if (hashState === 'mismatch' || rollState === 'mismatch') return 'mismatch';
    if (hashState === 'verified' && rollState === 'verified') return 'verified';
    return 'pending';
  }, [hashState, rollState]);

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
            Dice Round Verifier
          </h1>
          <p className="text-[13px] text-white/60">
            Independently confirm that this Dice round&apos;s face was fixed before the roll.
            Both the seed commitment and the roll math are re-derived in your browser — no need
            to trust the server.
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
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}
                  >
                    {shortId(payload.roundId)}
                  </span>
                </div>
                <StatusBadge state={overall} label={overallLabel} />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                <dt className="text-white/50">Completed</dt>
                <dd className="text-right text-white/90">{formatTimestamp(payload.createdAt)}</dd>
                <dt className="text-white/50">Bet</dt>
                <dd className="text-right font-semibold text-white/90 tabular-nums">
                  {payload.bet.toLocaleString('en-US')}
                </dd>
                <dt className="text-white/50">Roll-under target</dt>
                <dd className="text-right font-semibold text-cyan-300 tabular-nums">
                  {formatRoll(payload.targetX100)}
                </dd>
                <dt className="text-white/50">Multiplier on win</dt>
                <dd className="text-right font-semibold text-cyan-300 tabular-nums">
                  {formatMultiplierX100(payload.multiplierX100)}
                </dd>
                <dt className="text-white/50">Dice roll</dt>
                <dd
                  className="text-right font-semibold tabular-nums"
                  style={{ color: payload.won ? '#34d399' : '#fca5a5' }}
                >
                  {formatRoll(payload.rollX100)}
                </dd>
                <dt className="text-white/50">Outcome</dt>
                <dd
                  className="text-right font-semibold"
                  style={{ color: payload.won ? '#34d399' : '#fca5a5' }}
                >
                  {payload.won
                    ? `Won +${(payload.payout - payload.bet).toLocaleString('en-US')}`
                    : `Lost −${payload.bet.toLocaleString('en-US')}`}
                </dd>
                <dt className="text-white/50">House edge</dt>
                <dd className="text-right text-white/90">
                  {(payload.houseEdgeBp / 100).toFixed(2)}%
                </dd>
              </dl>
              <p className="border-t border-cyan-500/10 pt-3 text-[12px] leading-snug text-white/55">
                Before each round the server publishes <span className="text-cyan-300">sha256(serverSeed)</span>.
                After the round the seed itself is revealed — your browser re-hashes it, re-runs
                the HMAC roll, and recomputes the dice face.
              </p>
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
              <HashRow label="server seed (revealed after round)" value={payload.serverSeed} />
              {localHash && (
                <HashRow label="your browser computed sha256(serverSeed)" value={localHash} />
              )}
              <HashRow label="client seed" value={payload.clientSeed || '(empty)'} />
              <div
                className="rounded-xl border p-3 text-[12px] text-white/70"
                style={{ background: CARD_BG, borderColor: BORDER }}
              >
                <span className="text-white/50">nonce </span>
                <code
                  className="text-cyan-300"
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                >
                  {payload.nonce}
                </code>
              </div>
            </Section>

            <Section title="Step 2 · Roll re-derivation">
              <div className="flex items-center justify-end">
                <StatusBadge
                  state={rollState}
                  label={
                    rollState === 'verified'
                      ? `Matches ${formatRoll(payload.rollX100)}`
                      : rollState === 'mismatch'
                        ? 'Roll mismatch'
                        : rollState === 'no-crypto'
                          ? 'Crypto API unavailable'
                          : 'Re-deriving…'
                  }
                />
              </div>
              <div
                className="flex flex-col gap-2 rounded-xl border p-3 text-[12px] text-white/80"
                style={{ background: CARD_BG, borderColor: BORDER }}
              >
                <div className="flex justify-between gap-3">
                  <span className="text-white/50">HMAC bytes [0..3]</span>
                  <code
                    className="text-cyan-200"
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                  >
                    {derived ? derived.bytesHex : '…'}
                  </code>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-white/50">derived float r</span>
                  <code
                    className="text-cyan-200 tabular-nums"
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                  >
                    {derived ? derived.float.toFixed(12) : '…'}
                  </code>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-white/50">derived roll</span>
                  <code
                    className="text-cyan-200 tabular-nums"
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                  >
                    {derived ? formatRoll(derived.rollX100) : '…'}
                  </code>
                </div>
                <div className="flex justify-between gap-3 border-t border-cyan-500/10 pt-2">
                  <span className="text-white/50">server published</span>
                  <code
                    className="text-white tabular-nums"
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                  >
                    {formatRoll(payload.rollX100)}
                  </code>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-white/50">multiplier check</span>
                  <code
                    className="text-cyan-200 tabular-nums"
                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                  >
                    {formatMultiplierX100(payload.recomputedMultiplierX100)}
                  </code>
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
                GET /api/arcade/dice/verify/{shortId(payload.roundId)}
              </code>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
