'use client';

import React, { useState } from 'react';
import { formatEther, parseEther } from 'viem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const QUICK_BETS_ETHER = [1, 10, 100, 1000, 5000];

interface Props {
  minBet: string; // wei
  maxBet: string; // wei
  onPlaceBet: (amountWei: string) => void;
}

export default function BJMultiBettingPanel({ minBet, maxBet, onPlaceBet }: Props) {
  const minEther = Number(formatEther(BigInt(minBet)));
  const maxEther = Number(formatEther(BigInt(maxBet)));
  const [input, setInput] = useState(String(minEther));
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const n = Number(input);
    if (isNaN(n) || n <= 0) { setError('Enter a valid amount'); return; }
    if (n < minEther) { setError(`Minimum bet is ${minEther.toLocaleString()}`); return; }
    if (n > maxEther) { setError(`Maximum bet is ${maxEther.toLocaleString()}`); return; }
    setError(null);
    try {
      onPlaceBet(parseEther(input).toString());
    } catch {
      setError('Invalid amount');
    }
  };

  return (
    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
      <p className="text-xs text-slate-400 font-medium text-center">Place your bet</p>

      {/* Quick bet chips */}
      <div className="flex gap-1.5 flex-wrap justify-center">
        {QUICK_BETS_ETHER.filter(b => b >= minEther && b <= maxEther).map(b => (
          <button
            key={b}
            onClick={() => setInput(String(b))}
            className={`text-[11px] px-2.5 py-1 rounded-full border transition-all ${
              input === String(b)
                ? 'border-cyan-500 bg-cyan-900/40 text-cyan-300'
                : 'border-slate-600 bg-slate-700/40 text-slate-400 hover:border-slate-500'
            }`}
          >
            {b.toLocaleString()}
          </button>
        ))}
      </div>

      <div className="flex gap-2 items-center">
        <Input
          value={input}
          onChange={e => { setInput(e.target.value); setError(null); }}
          className="h-8 text-xs bg-slate-900 border-slate-600 text-slate-200 flex-1"
          placeholder={String(minEther)}
        />
        <span className="text-xs text-slate-500 shrink-0">MORBIUS</span>
      </div>

      {error && <p className="text-[11px] text-red-400 text-center">{error}</p>}

      <Button
        onClick={submit}
        className="w-full bg-cyan-600 hover:bg-cyan-700 text-white text-sm h-9"
      >
        Bet {input ? Number(input).toLocaleString() : '—'} MORBIUS
      </Button>

      <p className="text-[10px] text-slate-600 text-center">
        Min: {minEther.toLocaleString()} · Max: {maxEther.toLocaleString()} MORBIUS
      </p>
    </div>
  );
}
