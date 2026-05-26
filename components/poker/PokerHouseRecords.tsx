'use client';

import React, { useEffect, useState } from 'react';
import { Trophy } from 'lucide-react';

const PANEL_BG = 'linear-gradient(155deg, #0c1929 0%, #0a0f1a 50%, #0d1117 100%)';

type Records = {
  hands_dealt: number;
  largest_pot: { amount: string; hand_id: string | null };
  tournaments_played: number;
  total_rake: string;
};

function normalizeRecords(raw: unknown): Records | null {
  if (!raw || typeof raw !== 'object' || 'error' in raw) return null;
  const r = raw as Partial<Records>;
  return {
    hands_dealt: Number(r.hands_dealt ?? 0),
    largest_pot: {
      amount: String(r.largest_pot?.amount ?? '0'),
      hand_id: r.largest_pot?.hand_id ?? null,
    },
    tournaments_played: Number(r.tournaments_played ?? 0),
    total_rake: String(r.total_rake ?? '0'),
  };
}

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
      .then((d: unknown) => {
        if (alive) setData(normalizeRecords(d));
      })
      .catch((err) => {
        console.error('[PokerHouseRecords] fetch failed:', err);
      });
    return () => {
      alive = false;
    };
  }, []);

  const tiles = [
    {
      label: 'Hands dealt',
      value: data ? formatCount(data.hands_dealt) : '—',
    },
    {
      label: 'Largest pot',
      value: data ? formatCompactChips(data.largest_pot?.amount ?? '0') : '—',
      highlight: true,
      verifyHandId: data?.largest_pot?.hand_id ?? null,
    },
    {
      label: 'Tournaments played',
      value: data ? formatCount(data.tournaments_played) : '—',
    },
    {
      label: 'Total rake',
      value: data ? formatCompactChips(data.total_rake) : '—',
    },
  ];

  return (
    <section
      className="relative mb-6 sm:mb-8 rounded-2xl overflow-hidden border-2 border-cyan-500/30 shadow-lg shadow-cyan-500/5"
      style={{ background: PANEL_BG }}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" aria-hidden />

      <div className="relative px-5 sm:px-8 py-6 sm:py-7">
        <div className="flex items-start gap-3 mb-5">
          <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center bg-slate-900/60 border border-white/[0.06]">
            <Trophy className="w-5 h-5 text-cyan-300" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-400/80 font-bold">
              All-time stats
            </div>
            <h2 className="mt-1 text-lg font-bold text-white">House records</h2>
            <p className="text-xs text-slate-500 mt-0.5">Provably fair · platform-wide</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {tiles.map((t) => (
            <div
              key={t.label}
              className={`rounded-xl bg-slate-900/60 border px-4 py-3.5 text-center ${
                t.highlight ? 'border-emerald-400/20' : 'border-white/[0.06]'
              }`}
            >
              <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-slate-400">
                {t.label}
              </div>
              <div
                className={`mt-2 font-mono text-xl sm:text-2xl font-bold tabular-nums leading-none ${
                  t.highlight ? 'text-emerald-300' : 'text-white'
                }`}
              >
                {t.value}
              </div>
              {t.verifyHandId && (
                <a
                  href={`/poker/verify?handId=${t.verifyHandId}`}
                  className="inline-block mt-2 text-[10px] text-cyan-300 hover:text-cyan-200 underline underline-offset-2"
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
