'use client';

/**
 * /tg/verify/crash/[roundId] — Telegram-friendly provably-fair Crash verifier.
 *
 * Public (no auth) view of a completed Crash round. Fetches the payload from
 * GET /api/arcade/crash/verify/:id and re-derives in the browser via WebCrypto:
 *
 *   1. sha256(serverSeed) === serverSeedHash  (pre-round commitment)
 *   2. r = bytesToFloat(HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}:0`)[0..3])
 *      crashX100 = max(100, floor(((1 - houseEdgeBp/10000) / r) × 100))
 *      and that equals the published crashX100.
 *
 * crash_x100 and server_seed are withheld while the round is still active —
 * this page shows a "round in progress" state in that case.
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
  autoCashoutX100: number | null;
  crashX100: number | null;
  cashoutX100: number | null;
  status: string;
  won: boolean;
  payout: number;
  serverSeedHash: string;
  serverSeed: string | null;
  clientSeed: string;
  nonce: number;
  houseEdgeBp: number;
  growthK: number;
  startedAt: string;
  finalizedAt: string | null;
  createdAt: string;
  recipe: string;
}

interface ApiError { ok?: false; error?: string; message?: string; }
type LoadState = 'loading' | 'error' | 'ready';
type CheckState = 'pending' | 'verified' | 'mismatch' | 'no-crypto' | 'active';

const hexBuf = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(input: string): Promise<string | null> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return hexBuf(buf);
  } catch { return null; }
}

async function deriveCrashX100(
  serverSeed: string, clientSeed: string, nonce: number, houseEdgeBp: number,
): Promise<{ float: number; crashX100: number; bytesHex: string } | null> {
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(serverSeed),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${clientSeed}:${nonce}:0`)),
    );
    const [b0, b1, b2, b3] = [sig[0]!, sig[1]!, sig[2]!, sig[3]!];
    const float = b0 / 256 + b1 / 65536 + b2 / 16777216 + b3 / 4294967296;
    const safe = Math.max(float, 1e-12);
    const crashX100 = Math.max(100, Math.floor(((1 - houseEdgeBp / 10_000) / safe) * 100));
    const bytesHex = `${b0.toString(16).padStart(2,'0')} ${b1.toString(16).padStart(2,'0')} ${b2.toString(16).padStart(2,'0')} ${b3.toString(16).padStart(2,'0')}`;
    return { float, crashX100, bytesHex };
  } catch { return null; }
}

function shortId(a: string) { return a.length >= 12 ? `${a.slice(0,8)}…${a.slice(-4)}` : a; }
function fmtTs(iso: string) {
  try { return new Date(iso).toLocaleString(undefined, { year:'numeric', month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit' }); }
  catch { return iso; }
}
function fmtX100(x100: number) {
  const v = x100 / 100;
  return v >= 100_000 ? `${Math.floor(v/1000).toLocaleString('en-US')}k×` : `${v.toFixed(2)}×`;
}

function HashRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1 rounded-xl border p-3" style={{ background: CARD_BG, borderColor: BORDER }}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-cyan-300/80">{label}</span>
        <button type="button"
          onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(()=>setCopied(false),1400); } catch {} }}
          className="rounded-md border border-cyan-500/30 px-2 py-0.5 text-[11px] text-cyan-200 hover:bg-cyan-500/10">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <code className="break-all text-[12px] leading-snug text-white/90" style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>{value}</code>
    </div>
  );
}

function Badge({ state, label }: { state: CheckState; label: string }) {
  const map: Record<CheckState, { color: string; bg: string; prefix: string }> = {
    pending:   { color: '#fcd34d', bg: 'rgba(252,211,77,0.10)',   prefix: '…' },
    verified:  { color: '#34d399', bg: 'rgba(52,211,153,0.10)',   prefix: '✓' },
    mismatch:  { color: '#f87171', bg: 'rgba(248,113,113,0.10)',  prefix: '✗' },
    'no-crypto':{ color:'#9ca3af', bg: 'rgba(156,163,175,0.10)', prefix: '⚠' },
    active:    { color: '#60a5fa', bg: 'rgba(96,165,250,0.10)',   prefix: '↻' },
  };
  const v = map[state];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-semibold"
      style={{ color: v.color, borderColor: v.color, background: v.bg }}>
      <span>{v.prefix}</span>{label}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[13px] uppercase tracking-[0.18em] text-cyan-200/70"
        style={{ fontFamily: 'Mitr, system-ui, sans-serif' }}>{title}</h2>
      {children}
    </section>
  );
}

export default function TgVerifyCrashRoundPage() {
  const params = useParams<{ roundId: string }>();
  const roundId = typeof params?.roundId === 'string' ? params.roundId : '';

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [payload, setPayload] = useState<VerifyPayload | null>(null);
  const [localHash, setLocalHash] = useState<string | null>(null);
  const [hashState, setHashState] = useState<CheckState>('pending');
  const [derived, setDerived] = useState<{ float: number; crashX100: number; bytesHex: string } | null>(null);
  const [crashState, setCrashState] = useState<CheckState>('pending');
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    const w = window as unknown as { Telegram?: { WebApp?: { ready:()=>void; expand:()=>void } } };
    try { w.Telegram?.WebApp?.ready(); w.Telegram?.WebApp?.expand(); } catch {}
  }, []);

  useEffect(() => {
    if (!roundId) { setErrorMsg('No round ID in URL.'); setLoadState('error'); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/arcade/crash/verify/${encodeURIComponent(roundId)}`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data?.ok) { setErrorMsg((data as ApiError).error ?? 'Could not load round.'); setLoadState('error'); return; }
        setPayload(data as VerifyPayload);
        setLoadState('ready');
      } catch { if (!cancelled) { setErrorMsg('Could not reach verifier.'); setLoadState('error'); } }
    })();
    return () => { cancelled = true; };
  }, [roundId]);

  useEffect(() => {
    if (!payload || !payload.serverSeed) { if (payload?.status === 'active') setHashState('active'); return; }
    let cancelled = false;
    (async () => {
      const h = await sha256Hex(payload.serverSeed!);
      if (cancelled) return;
      if (!h) { setHashState('no-crypto'); return; }
      setLocalHash(h);
      setHashState(h.toLowerCase() === payload.serverSeedHash.toLowerCase() ? 'verified' : 'mismatch');
    })();
    return () => { cancelled = true; };
  }, [payload]);

  useEffect(() => {
    if (!payload || !payload.serverSeed || payload.crashX100 == null) {
      if (payload?.status === 'active') setCrashState('active');
      return;
    }
    let cancelled = false;
    (async () => {
      const d = await deriveCrashX100(payload.serverSeed!, payload.clientSeed, payload.nonce, payload.houseEdgeBp);
      if (cancelled) return;
      if (!d) { setCrashState('no-crypto'); return; }
      setDerived(d);
      setCrashState(d.crashX100 === payload.crashX100 ? 'verified' : 'mismatch');
    })();
    return () => { cancelled = true; };
  }, [payload]);

  const overall: CheckState = useMemo(() => {
    if (hashState === 'active' || crashState === 'active') return 'active';
    if (hashState === 'no-crypto' || crashState === 'no-crypto') return 'no-crypto';
    if (hashState === 'mismatch' || crashState === 'mismatch') return 'mismatch';
    if (hashState === 'verified' && crashState === 'verified') return 'verified';
    return 'pending';
  }, [hashState, crashState]);

  const overallLabel = overall === 'verified' ? 'Verified in your browser'
    : overall === 'mismatch' ? 'Verification failed'
    : overall === 'no-crypto' ? 'Crypto API unavailable'
    : overall === 'active' ? 'Round in progress'
    : 'Verifying…';

  return (
    <main className="min-h-screen w-full text-white" style={{ background: SCREEN_BG, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 py-6 pb-16">
        <header className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-[0.22em] text-cyan-300/70">MORBIUS · provably fair</span>
          <h1 className="text-2xl" style={{ fontFamily: 'Mitr, system-ui, sans-serif', letterSpacing: '0.02em' }}>Crash Round Verifier</h1>
          <p className="text-[13px] text-white/60">
            Independently confirm the crash point was fixed before the bet was placed.
            The server seed is withheld until the round ends — reload this page after it completes.
          </p>
        </header>

        {loadState === 'loading' && (
          <div className="rounded-2xl border p-4 text-[14px] text-white/70" style={{ background: CARD_BG, borderColor: BORDER }}>Loading round…</div>
        )}
        {loadState === 'error' && (
          <div className="rounded-2xl border p-4 text-[14px]" style={{ background: 'rgba(248,113,113,0.06)', borderColor: 'rgba(248,113,113,0.35)', color: '#fca5a5' }}>{errorMsg}</div>
        )}

        {loadState === 'ready' && payload && (
          <>
            <div className="flex flex-col gap-3 rounded-2xl border p-4" style={{ background: CARD_BG, borderColor: BORDER }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-[11px] uppercase tracking-wider text-cyan-300/70">Round</span>
                  <span className="text-lg" style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>{shortId(payload.roundId)}</span>
                </div>
                <Badge state={overall} label={overallLabel} />
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px]">
                <dt className="text-white/50">Status</dt>
                <dd className="text-right font-semibold" style={{ color: payload.status === 'cashed_out' ? '#34d399' : payload.status === 'crashed' ? '#fca5a5' : '#60a5fa' }}>
                  {payload.status === 'cashed_out' ? 'Cashed out' : payload.status === 'crashed' ? 'Crashed' : 'In progress'}
                </dd>
                <dt className="text-white/50">Bet</dt>
                <dd className="text-right font-semibold tabular-nums text-white/90">{payload.bet.toLocaleString('en-US')}</dd>
                {payload.autoCashoutX100 != null && (<>
                  <dt className="text-white/50">Auto-cashout</dt>
                  <dd className="text-right font-semibold tabular-nums text-cyan-300">{fmtX100(payload.autoCashoutX100)}</dd>
                </>)}
                {payload.cashoutX100 != null && (<>
                  <dt className="text-white/50">Cashed out at</dt>
                  <dd className="text-right font-semibold tabular-nums text-cyan-300">{fmtX100(payload.cashoutX100)}</dd>
                </>)}
                {payload.crashX100 != null && (<>
                  <dt className="text-white/50">Crash point</dt>
                  <dd className="text-right font-semibold tabular-nums" style={{ color: payload.won ? '#34d399' : '#fca5a5' }}>{fmtX100(payload.crashX100)}</dd>
                </>)}
                {payload.status !== 'active' && (<>
                  <dt className="text-white/50">Outcome</dt>
                  <dd className="text-right font-semibold" style={{ color: payload.won ? '#34d399' : '#fca5a5' }}>
                    {payload.won ? `Won +${(payload.payout - payload.bet).toLocaleString('en-US')}` : `Lost −${payload.bet.toLocaleString('en-US')}`}
                  </dd>
                </>)}
                <dt className="text-white/50">House edge</dt>
                <dd className="text-right text-white/90">{(payload.houseEdgeBp / 100).toFixed(2)}%</dd>
                <dt className="text-white/50">Started</dt>
                <dd className="text-right text-white/90">{fmtTs(payload.startedAt)}</dd>
              </dl>

              {payload.status === 'active' && (
                <p className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-[12px] text-blue-200/80">
                  This round is still in progress. The server seed will be revealed once the round ends — come back then to complete verification.
                </p>
              )}
            </div>

            {payload.status !== 'active' && payload.serverSeed && (<>
              <Section title="Step 1 · Seed commitment">
                <div className="flex items-center justify-end">
                  <Badge state={hashState} label={hashState === 'verified' ? 'sha256 matches' : hashState === 'mismatch' ? 'Hash mismatch' : hashState === 'no-crypto' ? 'Crypto unavailable' : 'Hashing…'} />
                </div>
                <HashRow label="server seed hash (committed before round)" value={payload.serverSeedHash} />
                <HashRow label="server seed (revealed after round)" value={payload.serverSeed} />
                {localHash && <HashRow label="your browser computed sha256(serverSeed)" value={localHash} />}
                <HashRow label="client seed" value={payload.clientSeed || '(empty)'} />
                <div className="rounded-xl border p-3 text-[12px] text-white/70" style={{ background: CARD_BG, borderColor: BORDER }}>
                  <span className="text-white/50">nonce </span>
                  <code className="text-cyan-300" style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>{payload.nonce}</code>
                </div>
              </Section>

              <Section title="Step 2 · Crash-point re-derivation">
                <div className="flex items-center justify-end">
                  <Badge state={crashState} label={crashState === 'verified' ? `Matches ${payload.crashX100 != null ? fmtX100(payload.crashX100) : '—'}` : crashState === 'mismatch' ? 'Crash-point mismatch' : crashState === 'no-crypto' ? 'Crypto unavailable' : 'Re-deriving…'} />
                </div>
                <div className="flex flex-col gap-2 rounded-xl border p-3 text-[12px] text-white/80" style={{ background: CARD_BG, borderColor: BORDER }}>
                  {[
                    ['HMAC bytes [0..3]', derived?.bytesHex ?? '…'],
                    ['derived float r', derived ? derived.float.toFixed(12) : '…'],
                    ['derived crash point', derived ? fmtX100(derived.crashX100) : '…'],
                    ['server published', payload.crashX100 != null ? fmtX100(payload.crashX100) : '—'],
                  ].map(([label, value], i, arr) => (
                    <div key={label} className={`flex justify-between gap-3${i === arr.length - 1 ? ' border-t border-cyan-500/10 pt-2' : ''}`}>
                      <span className="text-white/50">{label}</span>
                      <code className={`tabular-nums ${i === arr.length - 1 ? 'text-white' : 'text-cyan-200'}`} style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>{value}</code>
                    </div>
                  ))}
                </div>
                <p className="rounded-xl border p-3 text-[11px] leading-relaxed text-white/55"
                  style={{ background: CARD_BG, borderColor: BORDER, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>
                  {payload.recipe}
                </p>
              </Section>
            </>)}

            <button type="button" onClick={() => setShowJson(v => !v)}
              className="self-start rounded-md border border-cyan-500/30 px-3 py-1.5 text-[12px] text-cyan-200 hover:bg-cyan-500/10">
              {showJson ? 'Hide raw JSON' : 'Show raw JSON'}
            </button>
            {showJson && (
              <pre className="overflow-x-auto rounded-2xl border p-3 text-[11px] leading-snug text-white/75"
                style={{ background: '#050d18', borderColor: BORDER, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>
                {JSON.stringify(payload, null, 2)}
              </pre>
            )}
            <footer className="pt-2 text-center text-[11px] text-white/40">
              Verifier source: <code style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }}>GET /api/arcade/crash/verify/{shortId(payload.roundId)}</code>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
