'use client';

import React, { useState } from 'react';

export interface PokerActionsProps {
  /** Can the current player act (is it their turn and not folded)? */
  canAct: boolean;
  /** Can check (current bet to call is 0)? */
  canCheck: boolean;
  /** Minimum raise amount (string) */
  minRaise: string;
  /** Current player stack (string) for max bet */
  stack: string;
  /** Call amount (string) - 0 if can check */
  callAmount: string;
  onFold: () => void;
  onCheck: () => void;
  onCall: () => void;
  onBet: (amount: string) => void;
  onRaise: (amount: string) => void;
}

export function PokerActions({
  canAct,
  canCheck,
  minRaise,
  stack,
  callAmount,
  onFold,
  onCheck,
  onCall,
  onBet,
  onRaise,
}: PokerActionsProps) {
  const [customAmount, setCustomAmount] = useState(minRaise);

  if (!canAct) return null;

  const isCall = callAmount !== '0' && callAmount !== '';
  const handleBetOrRaise = () => {
    const amt = customAmount;
    if (isCall) onRaise(amt);
    else onBet(amt);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-cyan-500/30"
      style={{
        background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
        boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.6)',
      }}
    >
      <button
        type="button"
        onClick={onFold}
        className="px-4 py-2 rounded-lg bg-red-600/60 hover:bg-red-600 text-white text-sm"
      >
        Fold
      </button>
      {canCheck && (
        <button
          type="button"
          onClick={onCheck}
          className="px-4 py-2 rounded-lg bg-slate-600/60 hover:bg-slate-600 text-white text-sm"
        >
          Check
        </button>
      )}
      {isCall && (
        <button
          type="button"
          onClick={onCall}
          className="px-4 py-2 rounded-lg bg-cyan-600/60 hover:bg-cyan-600 text-white text-sm"
        >
          Call {callAmount}
        </button>
      )}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={customAmount}
          onChange={(e) => setCustomAmount(e.target.value)}
          className="w-24 rounded bg-slate-800 border border-cyan-500/30 px-2 py-1.5 text-white text-sm"
        />
        <button
          type="button"
          onClick={handleBetOrRaise}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm"
        >
          {isCall ? 'Raise' : 'Bet'}
        </button>
      </div>
    </div>
  );
}
