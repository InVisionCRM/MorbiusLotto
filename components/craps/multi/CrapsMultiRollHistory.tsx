'use client';

/**
 * The table's recent throws.
 *
 * Craps history is not a list of hands — it is a list of dice, and what each
 * one did to the cycle. So each row leads with the throw, says who shot it and
 * what it meant to the table (point on, point made, seven out, dice passed),
 * and only then what it cost or paid you.
 *
 * A throw you had nothing on shows no money at all rather than a zero: "I
 * wasn't in that one" and "I was in and won nothing" are different, and a zero
 * would read as the second.
 */

import { Dices, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CrapsMultiRollHistoryRow } from '@/lib/craps-multi-client';

interface Props {
  rolls: CrapsMultiRollHistoryRow[];
  loading?: boolean;
  /** Highlight throws this wallet shot. */
  myAddress?: string | null;
}

function shortAddr(a: string | null): string {
  if (!a) return 'the box';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** What this throw did to the table, in the fewest words that stay true. */
function meaning(r: CrapsMultiRollHistoryRow): { text: string; tone: 'good' | 'bad' | 'flat' } {
  if (r.isSevenOut) return { text: 'Seven out', tone: 'bad' };
  if (r.isPoint) return { text: `Point ${r.pointBefore} made`, tone: 'good' };
  if (r.phaseBefore === 'COME_OUT' && r.phaseAfter === 'POINT') {
    return { text: `Point is ${r.pointAfter}`, tone: 'flat' };
  }
  if (r.phaseBefore === 'COME_OUT') {
    // A come-out that resolved without setting a point: a natural or craps.
    if (r.sum === 7 || r.sum === 11) return { text: 'Natural', tone: 'good' };
    return { text: 'Craps', tone: 'bad' };
  }
  // A throw with the point on that neither made it nor sevened out. It decided
  // nothing about the cycle, but it may well have paid Place bets — so say
  // where the table still stands rather than showing a bare dash.
  return { text: `Point ${r.pointBefore} still on`, tone: 'flat' };
}

function Pip({ value }: { value: number }) {
  return (
    <span className="arc-mono flex h-5 w-5 items-center justify-center rounded bg-cyan-500/10 text-[11px] font-bold text-slate-200">
      {value}
    </span>
  );
}

export function CrapsMultiRollHistory({ rolls, loading, myAddress }: Props) {
  const mine = myAddress?.toLowerCase() ?? null;

  if (loading) {
    return (
      <div className="space-y-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-9 animate-pulse rounded-lg bg-cyan-500/5" />
        ))}
      </div>
    );
  }

  if (rolls.length === 0) {
    return (
      <p className="py-6 text-center text-[12px] text-slate-600">
        No throws yet. The history fills in as the dice go round.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {rolls.map((r) => {
        const m = meaning(r);
        const shotByMe = !!mine && r.shooterAddress === mine;
        const inIt = r.viewerWins !== null || r.viewerLosses !== null;
        const net = (r.viewerWins ?? 0) - (r.viewerLosses ?? 0);

        return (
          <div
            key={r.rollId}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-2 py-1.5',
              shotByMe
                ? 'border-amber-400/35 bg-amber-500/[0.06]'
                : 'border-cyan-950/70 bg-[#081420]/50',
            )}
          >
            {/* The dice, and their total. */}
            <div className="flex shrink-0 items-center gap-1">
              <Pip value={r.die1} />
              <Pip value={r.die2} />
              <span className="arc-mono ml-0.5 w-5 text-right text-[13px] font-bold text-cyan-300">
                {r.sum}
              </span>
            </div>

            {/* What it meant to the table. */}
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  'arc-display truncate text-[11px] font-semibold',
                  m.tone === 'good' ? 'text-emerald-300' : m.tone === 'bad' ? 'text-rose-300' : 'text-slate-400',
                )}
              >
                {m.text}
                {r.dicePassed && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-slate-500">
                    <ArrowRight className="h-3 w-3" />
                    dice passed
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 truncate text-[10px] text-slate-600">
                <Dices className="h-3 w-3 shrink-0" />
                {shotByMe ? 'you' : shortAddr(r.shooterAddress)}
                <span className="text-slate-700">· #{r.seedEpoch}.{r.nonce}</span>
              </div>
            </div>

            {/* What it did to your chips. Absent entirely if you weren't in it. */}
            <div className="shrink-0 text-right">
              {!inIt ? (
                <span className="text-[10px] text-slate-700">no bet</span>
              ) : net > 0 ? (
                <span className="arc-mono text-[12px] font-bold text-amber-300">
                  +{net.toLocaleString()}
                </span>
              ) : net < 0 ? (
                <span className="arc-mono text-[12px] font-bold text-rose-400">
                  −{Math.abs(net).toLocaleString()}
                </span>
              ) : (
                <span className="arc-mono text-[12px] text-slate-500">0</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
