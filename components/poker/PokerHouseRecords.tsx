'use client';

import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';

type Records = {
  hands_dealt: number;
  largest_pot: { amount: string; hand_id: string | null };
  tournaments_played: number;
  total_rake: string;
};

function formatCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  return n.toLocaleString('en-US');
}

function formatCompactChips(value: string): string {
  let n: bigint;
  try {
    n = BigInt(value || '0');
  } catch {
    return '0';
  }
  if (n < 0n) n = 0n;
  const num = Number(n);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(num >= 10_000_000 ? 1 : 2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(num >= 10_000 ? 0 : 1)}K`;
  return num.toLocaleString('en-US');
}

export function PokerHouseRecords() {
  const [data, setData] = useState<Records | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/poker/house-records')
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.text().catch(() => '');
          throw new Error(`HTTP ${r.status} ${r.statusText} :: ${body.slice(0, 200)}`);
        }
        return r.json();
      })
      .then((d: Records) => {
        if (alive) setData(d);
      })
      .catch((err) => {
        console.error('[PokerHouseRecords] fetch failed:', err);
        if (alive) setErrored(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Don't silently hide on error — render the panel with placeholder dashes so
  // the section is still visible and the user (and we) can see something went
  // wrong. Detail is in the browser console.

  const tiles = [
    {
      label: 'Hands Dealt',
      value: data ? formatCount(data.hands_dealt) : '—',
      accent: false,
    },
    {
      label: 'Largest Pot',
      value: data ? formatCompactChips(data.largest_pot.amount) : '—',
      accent: true,
      verifyHandId: data?.largest_pot.hand_id ?? null,
    },
    {
      label: 'Tournaments Played',
      value: data ? formatCount(data.tournaments_played) : '—',
      accent: false,
    },
    {
      label: 'Total Rake',
      value: data ? formatCompactChips(data.total_rake) : '—',
      accent: false,
    },
  ];

  return (
    <section
      className="relative mb-6 sm:mb-8 rounded-2xl sm:rounded-3xl overflow-hidden border-2 border-white/25"
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
        boxShadow:
          'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5), 0 0 50px rgba(34, 211, 238, 0.06)',
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_90%_80%_at_50%_0%,rgba(34,211,238,0.15),transparent_55%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_100%_50%,rgba(34,211,238,0.08),transparent_50%)]"
      />
      <div className="relative h-1 bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent" aria-hidden />
      <div className="relative px-4 py-5 sm:px-8 sm:py-6">
        <div className="flex items-center gap-3 mb-4 sm:mb-5">
          <div
            className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center border border-white/30"
            style={{
              background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
              boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.8), 0 0 20px rgba(34,211,238,0.12)',
            }}
          >
            <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-300" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-black tracking-tight text-white">House Records</h2>
            <p className="text-xs text-slate-500 mt-0.5">All-time · provably fair</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="rounded-xl px-4 py-3 border border-white/[0.06]"
              style={{
                background: 'linear-gradient(145deg, rgba(0,0,0,0.35), rgba(30,30,30,0.25))',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
                ...(t.accent ? { borderColor: 'rgba(250,204,21,0.30)' } : {}),
              }}
            >
              <div
                className={`text-[10px] uppercase tracking-[0.2em] font-bold ${
                  t.accent ? 'text-amber-300/90' : 'text-slate-500'
                }`}
              >
                {t.label}
              </div>
              <div
                className={`mt-1 text-xl sm:text-2xl font-black tabular-nums leading-none ${
                  t.accent ? 'text-amber-200' : 'text-white'
                }`}
              >
                {t.value}
              </div>
              {t.verifyHandId && (
                <a
                  href={`/poker/verify?handId=${t.verifyHandId}`}
                  className="inline-block mt-1 text-[10px] text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
                >
                  verify hand →
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
