'use client';

/**
 * /tg/verify/roulette/[spinId] — Provably-fair Roulette verifier.
 *
 * Fetches GET /api/arcade/roulette/verify/:id and re-derives in the browser:
 *   1. sha256(serverSeed) === serverSeedHash  (pre-spin commitment)
 *   2. r = bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, 0)[0..3])
 *      result = Math.floor(r * 37) → should equal published result (0-36)
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

const SCREEN_BG = 'linear-gradient(165deg,#0c1c30 0%,#050a14 72%)';
const CARD_BG = '#0b1a2c';
const BORDER = 'rgba(34,211,238,0.15)';

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

function pocketColor(n: number): 'green' | 'red' | 'black' {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

interface VerifyPayload {
  ok: true;
  spinId: string;
  bets: Array<{ type: string; amount: number; numbers?: number[] }>;
  totalBet: number;
  result: number;
  payouts: number[];
  totalPayout: number;
  serverSeedHash: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
  recipe: string;
}

interface ApiError { ok?: false; error?: string; }
type LoadState = 'loading' | 'error' | 'ready';
type CheckState = 'pending' | 'verified' | 'mismatch' | 'no-crypto';

const hexBuf = (buf: ArrayBuffer): string =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(input: string): Promise<string | null> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return hexBuf(buf);
  } catch { return null; }
}

async function hmacSha256Buf(key: string, message: string): Promise<Uint8Array | null> {
  try {
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey(
      'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', k, enc.encode(message));
    return new Uint8Array(sig);
  } catch { return null; }
}

function bytesToFloat(bytes: Uint8Array): number {
  return (
    bytes[0] / 256 +
    bytes[1] / (256 * 256) +
    bytes[2] / (256 * 256 * 256) +
    bytes[3] / (256 * 256 * 256 * 256)
  );
}

function Field({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#e2e8f0', wordBreak: 'break-all', fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</div>
    </div>
  );
}

function CheckBadge({ state }: { state: CheckState }) {
  const map: Record<CheckState, { label: string; color: string; bg: string }> = {
    pending:   { label: 'Checking…', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
    verified:  { label: '✓ Verified', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
    mismatch:  { label: '✗ Mismatch', color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
    'no-crypto': { label: 'WebCrypto unavailable', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  };
  const s = map[state];
  return (
    <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
}

export default function VerifyRoulettePage() {
  const { spinId } = useParams<{ spinId: string }>();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [data, setData] = useState<VerifyPayload | null>(null);
  const [error, setError] = useState('');
  const [hashCheck, setHashCheck] = useState<CheckState>('pending');
  const [resultCheck, setResultCheck] = useState<CheckState>('pending');
  const [derivedResult, setDerivedResult] = useState<number | null>(null);

  useEffect(() => {
    if (!spinId) return;
    fetch(`/api/arcade/roulette/verify/${spinId}`)
      .then((r) => r.json())
      .then((d: VerifyPayload | ApiError) => {
        if (!d.ok) { setError((d as ApiError).error ?? 'Spin not found.'); setLoadState('error'); return; }
        setData(d as VerifyPayload);
        setLoadState('ready');
      })
      .catch(() => { setError('Network error.'); setLoadState('error'); });
  }, [spinId]);

  useEffect(() => {
    if (!data) return;
    if (!crypto?.subtle) {
      setHashCheck('no-crypto');
      setResultCheck('no-crypto');
      return;
    }
    (async () => {
      // 1. Verify seed commitment
      const computed = await sha256Hex(data.serverSeed);
      setHashCheck(computed === data.serverSeedHash ? 'verified' : 'mismatch');

      // 2. Derive result
      const message = `${data.clientSeed}:${data.nonce}:0`;
      const hmacBuf = await hmacSha256Buf(data.serverSeed, message);
      if (!hmacBuf) { setResultCheck('no-crypto'); return; }
      const r = bytesToFloat(hmacBuf);
      const computed2 = Math.floor(r * 37);
      setDerivedResult(computed2);
      setResultCheck(computed2 === data.result ? 'verified' : 'mismatch');
    })();
  }, [data]);

  const pcol = data ? pocketColor(data.result) : 'green';
  const pocketBg = pcol === 'green' ? '#16a34a' : pcol === 'red' ? '#dc2626' : '#1e293b';
  const net = data ? data.totalPayout - data.totalBet : 0;

  return (
    <div style={{ minHeight: '100dvh', background: SCREEN_BG, padding: '20px 16px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: 'Mitr, sans-serif', fontWeight: 700, fontSize: '1.25rem', color: '#fff', margin: 0 }}>
            Verify Roulette Spin
          </h1>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            MORBIUS Arcade · Provably Fair
          </p>
        </div>

        {loadState === 'loading' && (
          <div style={{ textAlign: 'center', color: '#94a3b8', paddingTop: 40 }}>Loading…</div>
        )}

        {loadState === 'error' && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 14, padding: 16, color: '#f87171' }}>
            {error}
          </div>
        )}

        {loadState === 'ready' && data && (
          <>
            {/* Result card */}
            <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', background: pocketBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Mitr,sans-serif', fontWeight: 700, fontSize: '1.4rem', color: '#fff',
                  flexShrink: 0,
                }}>
                  {data.result}
                </div>
                <div>
                  <div style={{ fontFamily: 'Mitr,sans-serif', fontWeight: 700, fontSize: '1rem', color: '#fff' }}>
                    {pcol.toUpperCase()} · {data.result === 0 ? 'ZERO' : data.result % 2 === 0 ? 'EVEN' : 'ODD'}
                  </div>
                  <div style={{ fontSize: 12, color: net >= 0 ? '#4ade80' : '#f87171', marginTop: 2 }}>
                    {net >= 0 ? `+${net.toLocaleString('en-US')}` : net.toLocaleString('en-US')} MORBIUS (payout {data.totalPayout.toLocaleString('en-US')})
                  </div>
                </div>
              </div>
              <Field label="Spin ID" value={data.spinId} />
              <Field label="Created at" value={new Date(data.createdAt).toLocaleString()} mono={false} />
              <Field label="Total bet" value={`${data.totalBet.toLocaleString('en-US')} MORBIUS`} mono={false} />
            </div>

            {/* Bets breakdown */}
            <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
              <h2 style={{ fontFamily: 'Mitr,sans-serif', fontWeight: 700, fontSize: '.9rem', color: '#22d3ee', margin: '0 0 12px' }}>Bets Placed</h2>
              {data.bets.map((b, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#cbd5e1', marginBottom: 6 }}>
                  <span>{b.type}{b.numbers ? ` [${b.numbers.join(',')}]` : ''}</span>
                  <span style={{ color: data.payouts[i] > 0 ? '#4ade80' : '#94a3b8' }}>
                    {b.amount} bet → {data.payouts[i] > 0 ? `+${data.payouts[i]}` : 'lost'}
                  </span>
                </div>
              ))}
            </div>

            {/* Provably fair verification */}
            <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16, marginBottom: 12 }}>
              <h2 style={{ fontFamily: 'Mitr,sans-serif', fontWeight: 700, fontSize: '.9rem', color: '#22d3ee', margin: '0 0 12px' }}>Provably Fair Checks</h2>

              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>Seed commitment</span>
                  <CheckBadge state={hashCheck} />
                </div>
                <div style={{ fontSize: 11, color: '#475569' }}>sha256(serverSeed) must equal serverSeedHash</div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>Result derivation</span>
                  <CheckBadge state={resultCheck} />
                </div>
                <div style={{ fontSize: 11, color: '#475569' }}>
                  r = bytesToFloat(HMAC-SHA256(serverSeed, &quot;{data.clientSeed}:{data.nonce}:0&quot;)[0..3])<br />
                  result = floor(r × 37) = {derivedResult !== null ? derivedResult : '…'}
                  {' '}(published: {data.result})
                </div>
              </div>

              <Field label="Server seed hash (committed before spin)" value={data.serverSeedHash} />
              <Field label="Server seed (revealed after spin)" value={data.serverSeed} />
              <Field label="Client seed" value={data.clientSeed} />
              <Field label="Nonce" value={String(data.nonce)} mono={false} />
            </div>

            {/* Recipe */}
            <div style={{ background: CARD_BG, border: `1px solid ${BORDER}`, borderRadius: 16, padding: 16 }}>
              <h2 style={{ fontFamily: 'Mitr,sans-serif', fontWeight: 700, fontSize: '.9rem', color: '#22d3ee', margin: '0 0 8px' }}>Verification Recipe</h2>
              <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.6, margin: 0 }}>{data.recipe}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
