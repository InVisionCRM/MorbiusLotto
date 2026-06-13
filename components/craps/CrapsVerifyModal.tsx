'use client';

// Provably-fair panel for craps. Mirrors PlinkoFairnessModal:
//   1. Set your own client seed (used for the NEXT session — Plinko changes it
//      between balls; craps switches sessions because the seed is bound for
//      the whole session's nonce sequence).
//   2. Verify any session by ID — fetches /api/arcade/craps/verify/:id, and
//      renders ✓/✗ for hash-matches-commitment and rolls-re-derive-exactly,
//      plus the per-roll re-derived dice.
//
// The header pill in app/craps/page.tsx opens this modal already pointed at
// the current session via `requestVerifyId`.

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IconShieldCheck } from '@tabler/icons-react';
import {
  verifyCraps,
  randomClientSeed,
  type CrapsVerifyResult,
} from '@/lib/craps-client';
import type { CrapsCommitment } from '@/hooks/use-craps-engine';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commitment: CrapsCommitment | null;
  /** When set & modal is open, the ID is filled in and verified automatically. */
  requestVerifyId?: string | null;
  /** Restart the active session with the given clientSeed (close + create). */
  onSetClientSeed: (newClientSeed: string) => Promise<void>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-[0.22em] text-[#d4af37]/70 mb-1">{label}</div>
      <div className="font-mono break-all rounded-md bg-black/30 border border-[#d4af37]/15 px-2 py-1 text-[11px] text-[#f4e8c1]">
        {value}
      </div>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={ok ? 'text-emerald-300 font-black' : 'text-red-300 font-black'}>{ok ? '✓' : '✗'}</span>
      <span className="text-[#f4e8c1]/90">{label}</span>
    </div>
  );
}

/** Compact dice-pip cell for the per-roll re-derivation grid. */
function DiePip({ n, accent }: { n: number; accent: boolean }) {
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded font-mono text-xs font-black tabular-nums ${
        accent ? 'bg-[#d4af37]/15 text-[#d4af37] ring-1 ring-[#d4af37]/40'
               : 'bg-black/30 text-[#f4e8c1]/70 ring-1 ring-[#d4af37]/10'
      }`}
    >
      {n}
    </span>
  );
}

export function CrapsVerifyModal({
  open,
  onOpenChange,
  commitment,
  requestVerifyId,
  onSetClientSeed,
}: Props) {
  const [draftClientSeed, setDraftClientSeed] = useState('');
  const [savingSeed, setSavingSeed] = useState(false);
  const [verifyId, setVerifyId] = useState('');
  const [result, setResult] = useState<CrapsVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Seed the draft input with the current session's clientSeed each time the
  // modal opens, so the player can edit-rather-than-retype.
  useEffect(() => {
    if (open && commitment) setDraftClientSeed(commitment.clientSeed);
  }, [open, commitment]);

  async function runVerify(id: string) {
    const trimmed = id.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await verifyCraps(trimmed));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Auto-verify when opened pointed at a specific session.
  useEffect(() => {
    if (open && requestVerifyId) {
      setVerifyId(requestVerifyId);
      void runVerify(requestVerifyId);
    }
  }, [open, requestVerifyId]);

  const handleApplySeed = async () => {
    const next = draftClientSeed.trim();
    if (!next) return;
    if (commitment && next === commitment.clientSeed) {
      onOpenChange(false);
      return;
    }
    setSavingSeed(true);
    try {
      await onSetClientSeed(next);
      onOpenChange(false);
    } finally {
      setSavingSeed(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[#0a2e22]/95 border-2 border-[#d4af37]/40 text-[#f4e8c1] max-w-xl max-h-[85vh] overflow-y-auto"
        style={{ fontFamily: 'var(--font-cinzel), Cinzel, serif' }}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-black text-[#d4af37] tracking-[0.12em] flex items-center gap-2">
            <IconShieldCheck size={22} className="text-[#d4af37]" />
            PROVABLY FAIR
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">

          {/* Client seed */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-[#f4e8c1]">Your client seed</h3>
            <p className="text-xs text-[#f4e8c1]/60 leading-relaxed">
              Mixed into every roll&apos;s derivation. Change it any time —
              applying a new seed closes the current session (refunding any
              open bets) and opens a fresh one bound to your new value.
            </p>
            <div className="flex gap-2">
              <Input
                value={draftClientSeed}
                onChange={(e) => setDraftClientSeed(e.target.value.slice(0, 128))}
                placeholder="Leave blank for a server-generated random seed"
                className="font-mono text-xs bg-black/30 border-[#d4af37]/25 text-[#f4e8c1]"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraftClientSeed(randomClientSeed())}
                className="shrink-0 border-[#d4af37]/40 bg-transparent text-[#d4af37] hover:bg-[#d4af37]/10"
              >
                New seed
              </Button>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleApplySeed}
                disabled={savingSeed || !draftClientSeed.trim() || (commitment != null && draftClientSeed.trim() === commitment.clientSeed)}
                className="bg-[#d4af37] hover:bg-[#e6c358] text-[#0b3d2e] font-black uppercase tracking-[0.18em] text-xs border-0"
              >
                {savingSeed ? 'Applying…' : 'Apply (new session)'}
              </Button>
            </div>
          </section>

          {/* Verify */}
          <section className="space-y-2 border-t border-[#d4af37]/20 pt-4">
            <h3 className="text-sm font-semibold text-[#f4e8c1]">Verify a session</h3>
            <p className="text-xs text-[#f4e8c1]/60 leading-relaxed">
              Each session commits a hashed server seed up front and reveals it
              once you rotate or close. We re-derive every roll from the
              published seeds so you can confirm nothing moved.
            </p>
            <div className="flex gap-2">
              <Input
                value={verifyId}
                onChange={(e) => setVerifyId(e.target.value)}
                placeholder="Session ID"
                className="font-mono text-xs bg-black/30 border-[#d4af37]/25 text-[#f4e8c1]"
              />
              <Button
                onClick={() => runVerify(verifyId)}
                disabled={loading}
                className="shrink-0 bg-[#d4af37] hover:bg-[#e6c358] text-[#0b3d2e] font-black uppercase tracking-[0.18em] text-xs border-0"
              >
                {loading ? 'Checking…' : 'Verify'}
              </Button>
            </div>
          </section>

          {error && <p className="text-sm text-red-300">{error}</p>}

          {result && (
            <section className="space-y-3 rounded-lg bg-black/25 border border-[#d4af37]/25 p-3">
              {result.verification.seedRevealed ? (
                <div className="space-y-1.5">
                  <Check ok={result.verification.hashMatches} label="Server seed matches its committed hash" />
                  <Check ok={result.verification.rollsMatch} label={`Every roll re-derives exactly (${result.rolls.length} of ${result.rolls.length})`} />
                </div>
              ) : (
                <p className="text-xs text-amber-200/90 leading-relaxed">
                  Server seed is still hidden — this session is active. Rotate
                  the seed (or close the session) to unlock full verification.
                </p>
              )}

              {result.verification.seedRevealed && result.rolls.length > 0 && (
                <div className="space-y-1.5 border-t border-[#d4af37]/20 pt-3">
                  <div className="text-[9px] uppercase tracking-[0.22em] text-[#d4af37]/70 mb-1">
                    Persisted vs. re-derived rolls
                  </div>
                  <div className="grid grid-cols-1 gap-1 max-h-44 overflow-y-auto pr-1">
                    {result.rolls.map((r, i) => {
                      const recomputed = result.verification.recomputedRolls[i];
                      const matches = recomputed && recomputed.die1 === r.die1 && recomputed.die2 === r.die2;
                      return (
                        <div key={r.nonce} className="flex items-center gap-3 text-xs">
                          <span className="text-[#d4af37]/60 font-mono w-12 tabular-nums shrink-0">n{r.nonce}</span>
                          <div className="flex items-center gap-1">
                            <DiePip n={r.die1} accent={false} />
                            <DiePip n={r.die2} accent={false} />
                          </div>
                          <span className="text-[#d4af37]/40">→</span>
                          <div className="flex items-center gap-1">
                            <DiePip n={recomputed?.die1 ?? 0} accent />
                            <DiePip n={recomputed?.die2 ?? 0} accent />
                          </div>
                          <span className={matches ? 'text-emerald-300 ml-1 font-black' : 'text-red-300 ml-1 font-black'}>
                            {matches ? '✓' : '✗'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-2 border-t border-[#d4af37]/20 pt-3">
                <Field label="Server seed hash" value={result.serverSeedHash} />
                {result.serverSeedRevealed && (
                  <Field label="Server seed (revealed)" value={result.serverSeedRevealed} />
                )}
                <Field label="Client seed" value={result.clientSeed} />
                <Field label="Total rolls" value={String(result.rolls.length)} />
              </div>

              <div className="border-t border-[#d4af37]/20 pt-3">
                <div className="text-[9px] uppercase tracking-[0.22em] text-[#d4af37]/70 mb-2">Calculation</div>
                <code className="block text-[11px] text-[#f4e8c1]/85 leading-relaxed font-mono whitespace-pre-wrap">
{`die1 = floor(bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, 0)) * 6) + 1
die2 = floor(bytesToFloat(hmacByteStream(serverSeed, clientSeed, nonce, 4)) * 6) + 1
commitment = SHA-256(serverSeed)`}
                </code>
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
