'use client';

/**
 * AutoBetPanel — the autoplay strategy controls, shared by every instant game.
 *
 * Mirrors the panel players already know from other casinos: how many bets,
 * what happens to the stake on a win, what happens on a loss, and the two stop
 * conditions. Strategies are never named in the UI — a player who sets "on loss
 * increase 100%" has built a martingale without needing the word.
 *
 * Stop-on-loss is presented as prominently as stop-on-profit on purpose: it is
 * the one control here that protects the player, and burying it would be a
 * choice against them.
 */

import { Input } from '@/components/ui/input';
import type { AutoBetStrategy, BetAdjust } from '@/lib/auto-bet-strategy';

const BET_COUNTS = [10, 25, 50, 100] as const;

const chip = (on: boolean) =>
  [
    'arc-mono rounded-md py-1.5 text-xs tabular-nums transition-colors',
    on
      ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/50'
      : 'text-slate-500 ring-1 ring-cyan-950 hover:text-slate-300',
  ].join(' ');

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="text-xs uppercase tracking-wide text-slate-500">{children}</label>
);

/** Reset ⇄ Increase-by-% pair, used for both the win and the loss rule. */
function AdjustRow({
  value,
  disabled,
  onChange,
}: {
  value: BetAdjust;
  disabled: boolean;
  onChange: (next: BetAdjust) => void;
}) {
  const increasing = value.kind === 'increase';
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange({ kind: 'reset' })}
        className={`${chip(!increasing)} flex-1 disabled:opacity-50`}
      >
        Reset
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange({ kind: 'increase', pct: increasing ? value.pct : 100 })}
        className={`${chip(increasing)} flex-1 disabled:opacity-50`}
      >
        Increase
      </button>
      <div className="relative w-20 shrink-0">
        <Input
          type="number"
          min={0}
          inputMode="decimal"
          disabled={disabled || !increasing}
          value={increasing ? value.pct : ''}
          placeholder="0"
          onChange={(e) => onChange({ kind: 'increase', pct: Math.max(0, Number(e.target.value) || 0) })}
          className="h-8 pr-6 text-right text-xs tabular-nums disabled:opacity-40"
          aria-label="Increase percentage"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500">
          %
        </span>
      </div>
    </div>
  );
}

export function AutoBetPanel({
  strategy,
  onChange,
  disabled = false,
  /** Live run readout — shown while a strategy run is going. */
  status,
}: {
  strategy: AutoBetStrategy;
  onChange: (next: AutoBetStrategy) => void;
  disabled?: boolean;
  status?: { betsPlaced: number; profit: number; nextBet: number; capped: boolean } | null;
}) {
  const set = <K extends keyof AutoBetStrategy>(key: K, value: AutoBetStrategy[K]) =>
    onChange({ ...strategy, [key]: value });

  const numberField = (
    key: 'stopOnProfit' | 'stopOnLoss' | 'maxBet',
    label: string,
    hint: string,
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        inputMode="decimal"
        disabled={disabled}
        value={strategy[key] || ''}
        placeholder={hint}
        onChange={(e) => set(key, Math.max(0, Number(e.target.value) || 0))}
        className="h-8 text-right text-xs tabular-nums"
      />
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Number of bets</Label>
        <div className="grid grid-cols-5 gap-2">
          {BET_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              disabled={disabled}
              onClick={() => set('bets', n)}
              className={`${chip(strategy.bets === n)} disabled:opacity-50`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            disabled={disabled}
            onClick={() => set('bets', null)}
            title="Run until you stop it"
            className={`${chip(strategy.bets == null)} disabled:opacity-50`}
          >
            ∞
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>On win</Label>
        <AdjustRow value={strategy.onWin} disabled={disabled} onChange={(v) => set('onWin', v)} />
      </div>

      <div className="space-y-1.5">
        <Label>On loss</Label>
        <AdjustRow value={strategy.onLoss} disabled={disabled} onChange={(v) => set('onLoss', v)} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {numberField('stopOnProfit', 'Stop on profit', 'off')}
        {numberField('stopOnLoss', 'Stop on loss', 'off')}
      </div>

      {numberField('maxBet', 'Max bet', "off — game's limit applies")}

      {status && (
        <div className="rounded-md bg-black/30 px-2.5 py-2 text-xs ring-1 ring-cyan-950">
          <div className="flex items-center justify-between tabular-nums">
            <span className="text-slate-500">
              Bet {status.betsPlaced} · next{' '}
              <span className="arc-mono text-slate-300">{status.nextBet.toLocaleString()}</span>
            </span>
            <span className={status.profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
              {status.profit >= 0 ? '+' : '−'}
              {Math.abs(Math.round(status.profit)).toLocaleString()}
            </span>
          </div>
          {status.capped && (
            <p className="mt-1 text-[11px] leading-snug text-amber-300/80">
              Bet capped — the next stake would exceed your max bet or the game limit.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
