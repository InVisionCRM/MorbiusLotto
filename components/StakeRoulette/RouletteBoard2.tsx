'use client';

/**
 * RouletteBoard2 — the interactive betting felt for /roulette2 (Deep-Sea
 * Neon). Full European layout:
 *
 *   • 0 + the 3×12 number grid + the three 2:1 column bets
 *   • dozens row + even-money row (1–18 / EVEN / RED / BLACK / ODD / 19–36)
 *   • TRUE inner bets via edge/corner hit zones: splits on shared borders,
 *     corners on 4-number intersections, streets on the bottom edge of each
 *     column of three, six-lines on bottom intersections
 *
 * Left-click places the selected chip on a zone, right-click removes that
 * zone's chips. Hovering any zone highlights every number it covers. After a
 * spin the winning number flashes gold.
 */

import { useMemo, useState, type MouseEvent } from 'react';
import {
  pocketColor,
  roulette2Coverage,
  ROULETTE2_DOZENS,
  ROULETTE2_COLUMNS,
  type Roulette2Bet,
  type Roulette2BetType,
} from '@/lib/roulette2-client';

export interface ZoneBet {
  key: string;
  bet: Roulette2Bet;
}

export function zoneKey(type: Roulette2BetType, numbers?: number[]): string {
  return numbers && numbers.length > 0 ? `${type}:${[...numbers].sort((a, b) => a - b).join('-')}` : type;
}

interface RouletteBoard2Props {
  /** Total chips per zone key. */
  amounts: Record<string, number>;
  disabled: boolean;
  winningNumber: number | null;
  onPlace: (bet: Roulette2Bet) => void;
  onRemove: (key: string) => void;
}

function chipTier(amount: number): string {
  if (amount >= 500) return 'bg-neutral-700';
  if (amount >= 100) return 'bg-green-700';
  if (amount >= 25) return 'bg-blue-700';
  return 'bg-red-700';
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`;
  return String(n);
}

function Chip({ amount }: { amount: number }) {
  return (
    <span
      className={`pointer-events-none absolute left-1/2 top-1/2 z-30 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-dashed border-white/85 text-[9px] font-bold text-white shadow-[0_3px_8px_rgba(0,0,0,0.6)] ${chipTier(amount)}`}
      style={{ boxShadow: '0 3px 8px rgba(0,0,0,.6), inset 0 0 0 3px rgba(0,0,0,.25)' }}
    >
      {compact(amount)}
    </span>
  );
}

export default function RouletteBoard2({
  amounts,
  disabled,
  winningNumber,
  onPlace,
  onRemove,
}: RouletteBoard2Props) {
  const [hoverBet, setHoverBet] = useState<Roulette2Bet | null>(null);

  const highlight = useMemo(
    () => (hoverBet ? roulette2Coverage(hoverBet) : new Set<number>()),
    [hoverBet],
  );

  const zone = (type: Roulette2BetType, numbers?: number[]) => {
    const key = zoneKey(type, numbers);
    return {
      onClick: () => {
        if (!disabled) onPlace({ type, amount: 0, numbers });
      },
      onContextMenu: (e: MouseEvent) => {
        e.preventDefault();
        if (!disabled) onRemove(key);
      },
      onMouseEnter: () => setHoverBet({ type, amount: 0, numbers }),
      onMouseLeave: () => setHoverBet(null),
      amount: amounts[key] ?? 0,
    };
  };

  /** Inner hit-zone button (split / corner / street / line). */
  function InnerZone({
    type,
    numbers,
    className,
    label,
  }: {
    type: Roulette2BetType;
    numbers: number[];
    className: string;
    label: string;
  }) {
    const z = zone(type, numbers);
    return (
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={z.onClick}
        onContextMenu={z.onContextMenu}
        onMouseEnter={z.onMouseEnter}
        onMouseLeave={z.onMouseLeave}
        className={`absolute z-20 rounded-sm transition-colors hover:bg-cyan-400/30 ${className}`}
      >
        {z.amount > 0 && <Chip amount={z.amount} />}
      </button>
    );
  }

  function numberCellClasses(n: number): string {
    const color = pocketColor(n);
    const base =
      color === 'red'
        ? 'bg-[#B91C1C] text-red-100'
        : 'bg-[#081420] text-slate-400 ring-1 ring-inset ring-cyan-950';
    const hot = highlight.has(n) ? ' outline outline-2 outline-[#22D3EE] -outline-offset-1' : '';
    const win =
      winningNumber === n
        ? ' animate-pulse outline outline-2 outline-[#FBBF24] -outline-offset-1 shadow-[0_0_18px_rgba(251,191,36,0.45)]'
        : '';
    return base + hot + win;
  }

  const outsideCell =
    'relative flex items-center justify-center rounded-md bg-[#081420] ring-1 ring-inset ring-cyan-950 text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-400 transition-colors hover:bg-[#0d2230] disabled:cursor-default';

  // Number grid: visual rows top→bottom show n%3 == 0, 2, 1.
  const rows = [3, 2, 1].map((rem) =>
    Array.from({ length: 12 }, (_, c) => c * 3 + rem),
  );

  const zeroZone = zone('straight', [0]);

  return (
    <div className="select-none">
      <div
        className="grid gap-[5px]"
        style={{ gridTemplateColumns: 'minmax(30px,44px) repeat(12, minmax(0,1fr)) minmax(38px,52px)' }}
      >
        {/* Zero — spans the three number rows */}
        <button
          type="button"
          disabled={disabled}
          onClick={zeroZone.onClick}
          onContextMenu={zeroZone.onContextMenu}
          onMouseEnter={zeroZone.onMouseEnter}
          onMouseLeave={zeroZone.onMouseLeave}
          className={`relative row-span-3 flex items-center justify-center rounded-md bg-[#15803D]/25 text-base font-bold text-[#4ADE80] ring-1 ring-inset ring-[#15803D] transition-colors hover:bg-[#15803D]/40 ${
            highlight.has(0) ? 'outline outline-2 outline-[#22D3EE] -outline-offset-1' : ''
          } ${winningNumber === 0 ? 'animate-pulse outline outline-2 outline-[#FBBF24] -outline-offset-1' : ''}`}
          style={{ gridRow: '1 / span 3', gridColumn: 1 }}
        >
          0
          {zeroZone.amount > 0 && <Chip amount={zeroZone.amount} />}
        </button>

        {/* Number cells + inner hit zones */}
        {rows.map((rowNums, rIdx) =>
          rowNums.map((n, c) => {
            const z = zone('straight', [n]);
            const isBottomRow = rIdx === 2;
            const isTopRow = rIdx === 0;
            return (
              <div
                key={n}
                className="relative"
                style={{ gridRow: rIdx + 1, gridColumn: c + 2 }}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={z.onClick}
                  onContextMenu={z.onContextMenu}
                  onMouseEnter={z.onMouseEnter}
                  onMouseLeave={z.onMouseLeave}
                  className={`relative flex h-10 w-full items-center justify-center rounded-md font-mono text-[12px] sm:text-[13px] font-semibold transition-transform hover:scale-[1.04] sm:h-11 ${numberCellClasses(n)}`}
                >
                  {n}
                  {z.amount > 0 && <Chip amount={z.amount} />}
                </button>

                {/* split with the number above (n, n+1) */}
                {!isTopRow && (
                  <InnerZone
                    type="split"
                    numbers={[n, n + 1]}
                    label={`Split ${n}/${n + 1}`}
                    className="-top-[5px] left-[15%] right-[15%] h-[10px]"
                  />
                )}
                {/* split with the number to the right (n, n+3) */}
                {c < 11 && (
                  <InnerZone
                    type="split"
                    numbers={[n, n + 3]}
                    label={`Split ${n}/${n + 3}`}
                    className="-right-[5px] top-[15%] bottom-[15%] w-[10px]"
                  />
                )}
                {/* corner (n, n+1, n+3, n+4) */}
                {!isTopRow && c < 11 && (
                  <InnerZone
                    type="corner"
                    numbers={[n, n + 1, n + 3, n + 4]}
                    label={`Corner ${n}/${n + 1}/${n + 3}/${n + 4}`}
                    className="-right-[7px] -top-[7px] h-[14px] w-[14px] rounded-full"
                  />
                )}
                {/* street (bottom edge of the bottom row) */}
                {isBottomRow && (
                  <InnerZone
                    type="street"
                    numbers={[n, n + 1, n + 2]}
                    label={`Street ${n}-${n + 2}`}
                    className="-bottom-[6px] left-[15%] right-[15%] h-[11px]"
                  />
                )}
                {/* six line (bottom-right corner of the bottom row) */}
                {isBottomRow && c < 11 && (
                  <InnerZone
                    type="line"
                    numbers={[n, n + 1, n + 2, n + 3, n + 4, n + 5]}
                    label={`Line ${n}-${n + 5}`}
                    className="-bottom-[7px] -right-[7px] h-[14px] w-[14px] rounded-full"
                  />
                )}
              </div>
            );
          }),
        )}

        {/* 2:1 column bets (top row covers 3,6,…,36 = COLUMN_3) */}
        {[2, 1, 0].map((colIdx, rIdx) => {
          const z = zone('column', ROULETTE2_COLUMNS[colIdx]);
          return (
            <button
              key={`col-${colIdx}`}
              type="button"
              disabled={disabled}
              onClick={z.onClick}
              onContextMenu={z.onContextMenu}
              onMouseEnter={z.onMouseEnter}
              onMouseLeave={z.onMouseLeave}
              className={`${outsideCell} h-10 sm:h-11`}
              style={{ gridRow: rIdx + 1, gridColumn: 14 }}
            >
              2:1
              {z.amount > 0 && <Chip amount={z.amount} />}
            </button>
          );
        })}

        {/* Dozens */}
        {ROULETTE2_DOZENS.map((nums, i) => {
          const z = zone('dozen', nums);
          return (
            <button
              key={`dozen-${i}`}
              type="button"
              disabled={disabled}
              onClick={z.onClick}
              onContextMenu={z.onContextMenu}
              onMouseEnter={z.onMouseEnter}
              onMouseLeave={z.onMouseLeave}
              className={`${outsideCell} h-9`}
              style={{ gridRow: 4, gridColumn: `${2 + i * 4} / span 4` }}
            >
              {i === 0 ? '1st 12' : i === 1 ? '2nd 12' : '3rd 12'}
              {z.amount > 0 && <Chip amount={z.amount} />}
            </button>
          );
        })}

        {/* Even-money row */}
        {(
          [
            { type: 'low' as const, label: '1–18' },
            { type: 'even' as const, label: 'Even' },
            { type: 'red' as const, label: 'Red' },
            { type: 'black' as const, label: 'Black' },
            { type: 'odd' as const, label: 'Odd' },
            { type: 'high' as const, label: '19–36' },
          ]
        ).map((o, i) => {
          const z = zone(o.type);
          const special =
            o.type === 'red'
              ? 'bg-[#B91C1C]/30 ring-[#B91C1C] text-red-200 hover:bg-[#B91C1C]/45'
              : o.type === 'black'
                ? 'bg-[#18181B] ring-cyan-950 text-zinc-300 hover:bg-[#27272A]'
                : '';
          return (
            <button
              key={o.type}
              type="button"
              disabled={disabled}
              onClick={z.onClick}
              onContextMenu={z.onContextMenu}
              onMouseEnter={z.onMouseEnter}
              onMouseLeave={z.onMouseLeave}
              className={`${outsideCell} h-9 ${special}`}
              style={{ gridRow: 5, gridColumn: `${2 + i * 2} / span 2` }}
            >
              {o.label}
              {z.amount > 0 && <Chip amount={z.amount} />}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-center text-[10px] uppercase tracking-wider text-slate-500">
        click to bet · right-click to remove · edges &amp; corners place splits / streets / corners / lines
      </p>
    </div>
  );
}
