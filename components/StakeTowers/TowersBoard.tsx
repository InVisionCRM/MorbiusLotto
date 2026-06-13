'use client';

/**
 * TowersBoard — the 8-floor climb for /towers (cyan Deep-Sea Neon skin).
 *
 * Floors stack bottom (floor 0) to top (floor 7); you climb upward. Each floor
 * is a row of `tiles` cells (easy 4 / medium 3 / hard 2) hiding one bomb.
 * Completed floors show your safe pick; the current floor is live and
 * clickable; higher floors are locked. On settle the parent passes
 * `bombPositions` and the whole tower reveals — your bust tile glows rose.
 * Purely presentational — the parent owns state, money and sounds.
 */

import { Bomb, Diamond } from 'lucide-react';
import { formatMultiplier } from '@/lib/towers-client';

interface TowersBoardProps {
  tiles: number;
  floors: number;
  /** Next floor to pick (0-indexed from the bottom). */
  currentFloor: number;
  /** picks[f] = the tile chosen on completed floor f. */
  picks: number[];
  /** ladder[f] = ×100 multiplier after f completed floors. */
  ladder: number[];
  /** Revealed bomb tile per floor once the round settles, else null. */
  bombPositions: number[] | null;
  /** The floor whose bomb was hit (loss), else null. */
  bustFloor: number | null;
  disabled: boolean;
  onPick: (tile: number) => void;
}

const TILE_BASE =
  'flex h-10 items-center justify-center rounded-md border transition-all sm:h-12';

export function TowersBoard({
  tiles,
  floors,
  currentFloor,
  picks,
  ladder,
  bombPositions,
  bustFloor,
  disabled,
  onPick,
}: TowersBoardProps) {
  const revealed = bombPositions != null;
  const rows: number[] = [];
  for (let f = floors - 1; f >= 0; f--) rows.push(f);

  return (
    <div className="space-y-1.5">
      {rows.map((f) => {
        const isCurrent = f === currentFloor && !revealed;
        const isDone = f < currentFloor;
        const pickedTile = picks[f];
        const rowMult = ladder[f + 1] ?? 100;

        return (
          <div
            key={f}
            className={[
              'flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors',
              isCurrent ? 'bg-cyan-500/5 ring-1 ring-cyan-500/30' : '',
            ].join(' ')}
          >
            <div
              className="grid flex-1 gap-1.5"
              style={{ gridTemplateColumns: `repeat(${tiles}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: tiles }).map((_, t) => {
                const isPicked = pickedTile === t;
                const isBomb = revealed && bombPositions![f] === t;
                const bustHit = revealed && f === bustFloor && isPicked;
                const clickable = isCurrent && !disabled;

                let cls = 'border-cyan-950/60 bg-[#081420]/40 text-transparent';
                let content: React.ReactNode = null;

                if (revealed) {
                  if (bustHit) {
                    cls = 'border-rose-500 bg-rose-500/25 text-rose-300';
                    content = <Bomb size={18} />;
                  } else if (isBomb) {
                    cls = 'border-rose-500/40 bg-rose-500/10 text-rose-400/70';
                    content = <Bomb size={18} />;
                  } else if (isPicked) {
                    cls = 'border-cyan-400/70 bg-cyan-500/15 text-cyan-300';
                    content = <Diamond size={18} />;
                  }
                } else if (isDone) {
                  if (isPicked) {
                    cls = 'border-cyan-400/70 bg-cyan-500/15 text-cyan-300';
                    content = <Diamond size={18} />;
                  }
                } else if (isCurrent) {
                  cls = disabled
                    ? 'border-cyan-500/20 bg-[#0B2533]/60 text-transparent'
                    : 'cursor-pointer border-cyan-500/40 bg-[#0B2533] text-cyan-500/30 hover:border-cyan-400 hover:bg-cyan-500/15 hover:text-cyan-300';
                  content = <Diamond size={18} />;
                } else {
                  // Locked future floor.
                  cls = 'border-cyan-950/40 bg-[#081420]/20 text-transparent';
                }

                return (
                  <button
                    key={t}
                    type="button"
                    disabled={!clickable}
                    onClick={() => onPick(t)}
                    aria-label={`Floor ${f + 1}, tile ${t + 1}`}
                    className={`${TILE_BASE} ${cls} disabled:cursor-default`}
                  >
                    {content}
                  </button>
                );
              })}
            </div>
            <span
              className={`arc-mono w-16 shrink-0 text-right text-xs tabular-nums ${
                isCurrent ? 'text-cyan-300' : isDone ? 'text-slate-400' : 'text-slate-600'
              }`}
            >
              {formatMultiplier(rowMult)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
