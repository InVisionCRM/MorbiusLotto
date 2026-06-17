'use client';

/**
 * HeistFairnessModal — provably-fair panel for chips Heist (/heist).
 *
 * Recomputes locally what it can from the revealed payload:
 *   1. sha256(serverSeed) === serverSeedHash (commitment)
 *   2. the alarm doors re-derive from (serverSeed, clientSeed, nonce) via the
 *      exact server recipe — independent WebCrypto HMAC byte stream — and match
 *      the recorded outcome (a win avoided every alarm; a bust hit an alarm in
 *      its final room)
 *   3. the payout reconciles with floor(bet × multiplier) (0 on a bust)
 * The full derivation recipe is shown so anyone can reproduce it.
 */

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  verifyHeist,
  formatMultiplier,
  HEIST_DIFFICULTY_LABELS,
  type HeistVerifyResult,
} from '@/lib/heist-client';

interface HeistFairnessModalProps {
  open: boolean;
  onClose: () => void;
  clientSeed: string;
  onClientSeedChange: (seed: string) => void;
  requestVerifyId: string | null;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="break-all rounded-md bg-[#081420] px-2 py-1 font-mono text-xs text-slate-300">{value}</div>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? 'text-cyan-300' : 'text-rose-400'}>{ok ? '✓' : '✗'}</span>
      <span className="text-slate-300">{label}</span>
    </div>
  );
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function randomClientSeed(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** WebCrypto HMAC-SHA256, hex key (server seed), returns the 32-byte digest. */
async function hmacSha256(serverSeed: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(serverSeed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

/**
 * Re-create the server's cursor-indexed HMAC byte stream (4 bytes per draw),
 * matching ProvablyFairService.hmacByteStream exactly — including the 32-byte
 * round-boundary straddle.
 */
async function hmacByteStream(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  cursor: number,
): Promise<Uint8Array> {
  const roundIndex = Math.floor(cursor / 32);
  const byteOffset = cursor % 32;
  const cur = await hmacSha256(serverSeed, `${clientSeed}:${nonce}:${roundIndex}`);
  if (byteOffset + 4 <= 32) return cur.subarray(byteOffset, byteOffset + 4);
  const bytesFromCurrent = 32 - byteOffset;
  const next = await hmacSha256(serverSeed, `${clientSeed}:${nonce}:${roundIndex + 1}`);
  const out = new Uint8Array(4);
  out.set(cur.subarray(byteOffset, 32), 0);
  out.set(next.subarray(0, 4 - bytesFromCurrent), bytesFromCurrent);
  return out;
}

function bytesToFloat(b: Uint8Array): number {
  return b[0] / 256 + b[1] / 256 ** 2 + b[2] / 256 ** 3 + b[3] / 256 ** 4;
}

/** Independently re-derive every room's alarm doors (matches deriveAlarmDoors). */
async function recomputeAlarmDoors(r: HeistVerifyResult): Promise<number[][]> {
  const { doors, alarms, rooms } = r;
  const out: number[][] = [];
  let cursor = 0;
  for (let room = 0; room < rooms; room++) {
    const idx = Array.from({ length: doors }, (_, k) => k);
    for (let b = 0; b < alarms; b++) {
      const float = bytesToFloat(await hmacByteStream(r.serverSeed, r.clientSeed, r.nonce, cursor));
      cursor += 4;
      const j = b + Math.min(doors - 1 - b, Math.floor(float * (doors - b)));
      const tmp = idx[b];
      idx[b] = idx[j];
      idx[j] = tmp;
    }
    out.push(idx.slice(0, alarms).sort((a, c) => a - c));
  }
  return out;
}

/** A win avoided every alarm; a bust cleared safely then hit its final room. */
function outcomeConsistent(r: HeistVerifyResult, alarmDoors: number[][]): boolean {
  const sameLayout =
    alarmDoors.length === r.alarmDoors.length &&
    alarmDoors.every((room, i) => room.join(',') === (r.alarmDoors[i] ?? []).join(','));
  if (!sameLayout) return false;
  if (r.picks.length === 0) return !r.won;
  if (r.won) return r.picks.every((door, room) => !alarmDoors[room].includes(door));
  const last = r.picks.length - 1;
  const safeBelow = r.picks.slice(0, last).every((door, room) => !alarmDoors[room].includes(door));
  return safeBelow && alarmDoors[last].includes(r.picks[last]);
}

export function HeistFairnessModal({
  open,
  onClose,
  clientSeed,
  onClientSeedChange,
  requestVerifyId,
}: HeistFairnessModalProps) {
  const [verifyId, setVerifyId] = useState('');
  const [result, setResult] = useState<HeistVerifyResult | null>(null);
  const [hashMatches, setHashMatches] = useState<boolean | null>(null);
  const [alarmsMatch, setAlarmsMatch] = useState<boolean | null>(null);
  const [payoutMatches, setPayoutMatches] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runVerify(id: string) {
    const trimmed = id.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setHashMatches(null);
    setAlarmsMatch(null);
    setPayoutMatches(null);
    try {
      const r = await verifyHeist(trimmed);
      setResult(r);
      setHashMatches((await sha256Hex(r.serverSeed)) === r.serverSeedHash);
      const recomputed = await recomputeAlarmDoors(r);
      setAlarmsMatch(outcomeConsistent(r, recomputed));
      const expected = r.won ? Math.floor((r.bet * r.multiplierX100) / 100) : 0;
      setPayoutMatches(expected === r.payout);
    } catch {
      setError('No settled round found with that ID.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && requestVerifyId) {
      setVerifyId(requestVerifyId);
      void runVerify(requestVerifyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requestVerifyId]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto border-cyan-950 bg-[#050E16] text-slate-200">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-wider text-cyan-300">Provably Fair</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-200">Your client seed</h3>
            <p className="text-xs text-slate-500">
              Mixed into every job. Change it any time — the next round uses the new value.
            </p>
            <div className="flex gap-2">
              <Input
                value={clientSeed}
                onChange={(e) => onClientSeedChange(e.target.value.slice(0, 128))}
                placeholder="Leave blank for a random seed each round"
                className="border-cyan-950 bg-[#081420] font-mono text-xs"
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
            <h3 className="text-sm font-semibold text-slate-200">Verify a job</h3>
            <p className="text-xs text-slate-500">
              Each room&apos;s alarm door is sealed from a server seed committed (hashed) before your
              bet — the seed is revealed once the round settles.
            </p>
            <div className="flex gap-2">
              <Input
                value={verifyId}
                onChange={(e) => setVerifyId(e.target.value)}
                placeholder="Round ID"
                className="border-cyan-950 bg-[#081420] font-mono text-xs"
              />
              <Button
                onClick={() => runVerify(verifyId)}
                disabled={loading}
                className="shrink-0 bg-cyan-600 text-white hover:bg-cyan-400 hover:text-[#03121B]"
              >
                {loading ? 'Checking…' : 'Verify'}
              </Button>
            </div>
          </section>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          {result && (
            <section className="space-y-3 rounded-lg border border-cyan-950 bg-[#07131F]/70 p-3">
              <div className="space-y-1.5">
                {hashMatches !== null && (
                  <Check ok={hashMatches} label="Server seed matches its committed hash (checked locally)" />
                )}
                {alarmsMatch !== null && (
                  <Check
                    ok={alarmsMatch}
                    label="Every room's alarm door re-derives from the seed (checked locally)"
                  />
                )}
                {payoutMatches !== null && (
                  <Check ok={payoutMatches} label="Payout reconciles with floor(bet × multiplier)" />
                )}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  Job:{' '}
                  <span className="font-mono text-slate-300">
                    {HEIST_DIFFICULTY_LABELS[result.difficulty]}
                  </span>
                </span>
                <span>
                  Rooms cracked: <span className="font-mono text-slate-300">{result.room} / {result.rooms}</span>
                </span>
                <span>
                  Your picks: <span className="font-mono text-cyan-300">[{result.picks.join(', ')}]</span>
                </span>
              </div>

              <div>
                <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                  The job — ✕ = alarm, ringed = your pick
                </div>
                <div className="flex flex-col gap-1">
                  {result.alarmDoors.map((room, rm) => (
                    <div key={rm} className="flex items-center gap-1.5 text-xs">
                      <span className="w-14 shrink-0 font-mono text-slate-500">room {rm + 1}</span>
                      {Array.from({ length: result.doors }).map((_, dd) => {
                        const isAlarm = room.includes(dd);
                        const isPick = result.picks[rm] === dd;
                        return (
                          <span
                            key={dd}
                            className={[
                              'flex h-5 w-5 items-center justify-center rounded font-mono text-[10px]',
                              isAlarm
                                ? 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/50'
                                : 'bg-[#081420] text-slate-500 ring-1 ring-cyan-950',
                              isPick ? 'ring-2 ring-cyan-400' : '',
                            ].join(' ')}
                          >
                            {isAlarm ? '✕' : dd + 1}
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Field label="Server seed hash (committed)" value={result.serverSeedHash} />
                <Field label="Server seed (revealed)" value={result.serverSeed} />
                <Field label="Client seed" value={result.clientSeed} />
                <Field label="Nonce" value={String(result.nonce)} />
                <Field label="Recipe" value={result.recipe} />
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>
                  Result:{' '}
                  <span className="font-mono font-bold text-slate-200">
                    {result.won ? 'Escaped' : 'Caught'}
                  </span>
                </span>
                <span>
                  Multiplier:{' '}
                  <span className="font-mono text-cyan-300">{formatMultiplier(result.multiplierX100)}</span>
                </span>
                <span>
                  Returned:{' '}
                  <span className={`font-mono ${result.payout > 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                    {result.payout.toLocaleString()} MORBIUS
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
