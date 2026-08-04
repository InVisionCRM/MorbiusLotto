'use client';

/**
 * "Verify a recent hand" — the missing last mile of multiplayer provable
 * fairness. The backend has always been able to verify a round-seat id; this
 * list is what finally hands the player those ids, each linking straight into
 * the public verifier.
 *
 * Rendered inside the fairness modal on the multiplayer table page.
 */

import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';
import { TOKEN_DECIMALS } from '@/lib/contracts';

interface RecentRound {
  id: string;
  seat_position: number;
  result: string | null;
  payout: string;
  bet_amount: string;
  round_number: number;
  created_at: string;
}

const fmtAmount = (wei: string) => {
  try {
    const v = Number(formatUnits(BigInt(wei || '0'), TOKEN_DECIMALS));
    return v >= 1000 ? `${Math.round(v).toLocaleString()}` : v.toLocaleString();
  } catch {
    return '0';
  }
};

const resultColor = (result: string | null) =>
  result === 'win' || result === 'blackjack'
    ? 'text-emerald-300'
    : result === 'push'
      ? 'text-white/70'
      : 'text-rose-300';

export function BlackjackMultiRecentHands({ address }: { address: string | undefined }) {
  const [rounds, setRounds] = useState<RecentRound[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!address) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/blackjack-multi/recent-rounds/${address}?limit=10`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        if (alive) setRounds(Array.isArray(data.rounds) ? data.rounds : []);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [address]);

  if (!address) return null;

  return (
    <div className="rounded-lg border border-cyan-500/20 bg-black/30 p-3">
      <span className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-white/60">
        Verify a recent hand
      </span>
      {failed ? (
        <p className="text-xs text-white/50">Couldn&apos;t load your recent hands right now.</p>
      ) : rounds === null ? (
        <p className="text-xs text-white/50">Loading your recent hands…</p>
      ) : rounds.length === 0 ? (
        <p className="text-xs text-white/50">
          No completed hands yet — finish a round and it&apos;ll show up here.
        </p>
      ) : (
        <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto pr-1">
          {rounds.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-md bg-white/5 px-2 py-1.5 text-xs">
              <span className="font-mono text-white/50">#{r.round_number}</span>
              <span className={`font-semibold uppercase ${resultColor(r.result)}`}>{r.result}</span>
              <span className="text-white/60">
                {fmtAmount(r.bet_amount)} &rarr; {fmtAmount(r.payout)} MORBIUS
              </span>
              <a
                href={`/BLACKJACK/verify?gameId=${encodeURIComponent(r.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto shrink-0 font-semibold text-cyan-300 underline-offset-2 hover:text-cyan-200 hover:underline"
              >
                Verify &rarr;
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-white/40">
        Every hand replays the committed shuffle — the verifier proves the deck was locked in before
        the deal and the cards match it.
      </p>
    </div>
  );
}
