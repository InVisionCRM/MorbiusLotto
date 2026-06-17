'use client';

/**
 * GreedDie — a single 3×3-pip die face, faithful to the lab's `dieHtml`. A die
 * is one of:
 *   - 'score' (cyan ring + cyan pips) — it scored and was auto-kept,
 *   - 'dead'  (dimmed) — it didn't score this roll,
 *   - 'roll'  (drop-in animation) — mid-flicker while a roll resolves,
 *   - default (neutral resting face).
 *
 * Pip positions index the 3×3 grid 0–8 (the lab's PIPS table). Pure render — no
 * randomness — so it's hydration-safe.
 */

export type GreedDieState = 'score' | 'dead' | 'roll' | 'idle';

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function GreedDie({ value, state = 'idle' }: { value: number; state?: GreedDieState }) {
  const pos = PIPS[value] ?? [];
  const isScore = state === 'score';
  const isDead = state === 'dead';
  const isRoll = state === 'roll';
  return (
    <div
      className={[
        'grid aspect-square grid-cols-3 grid-rows-3 rounded-xl p-[9px]',
        'w-[clamp(42px,11.5vw,56px)]',
        isScore
          ? 'shadow-[inset_0_0_0_2px_#22D3EE,0_0_18px_-4px_#22D3EE]'
          : 'shadow-[inset_0_0_0_1px_rgba(34,211,238,0.12),0_6px_14px_-8px_rgba(0,0,0,0.8)]',
        isDead ? 'opacity-50' : '',
        isRoll ? 'greed-die-roll' : '',
      ].join(' ')}
      style={{ background: 'linear-gradient(160deg, #0b1c28, #06121b)' }}
      aria-hidden
    >
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="grid place-items-center">
          {pos.includes(i) && (
            <span
              className={`h-[clamp(6px,1.7vw,8px)] w-[clamp(6px,1.7vw,8px)] rounded-full ${
                isScore ? 'bg-cyan-400' : 'bg-slate-400'
              }`}
            />
          )}
        </span>
      ))}
    </div>
  );
}
