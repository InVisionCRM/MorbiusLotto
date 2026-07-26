'use client';

/**
 * MiniAppRoulette — MORBIUS Arcade: European Roulette.
 *
 * Layout (Variant B — user selection):
 *   1. Horizontal rolodex strip — 7 cards showing the wheel order. Drifts
 *      slowly while idle; spins fast then decelerates to land on the result.
 *   2. European felt table — clickable bet zones (even money, dozens, columns,
 *      straight numbers). Tap a zone to add chips; tap again to add more.
 *   3. Chip picker + SPIN button.
 *
 * Phases: loading → idle → spinning → result → idle (loop).
 *
 * Provably fair: same HMAC-SHA256 / bytesToFloat → floor(r × 37) formula
 * as the server. Server seed committed before spin, revealed in response.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconRefresh } from '@tabler/icons-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
  10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

const DOZEN_1 = Array.from({ length: 12 }, (_, i) => i + 1);
const DOZEN_2 = Array.from({ length: 12 }, (_, i) => i + 13);
const DOZEN_3 = Array.from({ length: 12 }, (_, i) => i + 25);
const COLUMN_1 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];
const COLUMN_2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
const COLUMN_3 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];

const CHIP_VALUES = [5, 25, 100, 500];
const CARD_W = 44; // px — width of one rolodex card
const CARD_GAP = 4; // px — flex gap between cards
const CARD_STRIDE = CARD_W + CARD_GAP; // px — distance from one card to the next
const STRIP_COPIES = 9; // duplicate wheel N times so a spin never runs off the strip
const SPIN_LAPS = 4; // full wheel rotations travelled during a spin

function pocketColor(n: number): 'green' | 'red' | 'black' {
  if (n === 0) return 'green';
  return RED_NUMBERS.has(n) ? 'red' : 'black';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RouletteBetType =
  | 'straight' | 'dozen' | 'column'
  | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high';

interface RouletteBet {
  type: RouletteBetType;
  amount: number;
  numbers?: number[];
}

type Phase = 'loading' | 'load-error' | 'idle' | 'spinning' | 'result';

interface SpinResult {
  spinId: string;
  result: number;
  totalPayout: number;
  payouts: number[];
  bets: RouletteBet[];
  chipBalance: string;
  serverSeedHash: string;
}

interface RouletteInfo {
  minBet: number;
  maxBetPerZone: number;
  maxTotalBet: number;
}

interface MiniAppRouletteProps {
  initData: string;
  initialChipBalance: string;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Felt layout helpers
// ---------------------------------------------------------------------------

// Serialise a bet zone to a stable key for the bets map
function betKey(type: RouletteBetType, numbers?: number[]): string {
  if (!numbers) return type;
  return `${type}:${numbers.join(',')}`;
}

function numberToBetObj(
  type: RouletteBetType,
  amount: number,
  numbers?: number[],
): RouletteBet {
  return numbers ? { type, amount, numbers } : { type, amount };
}

// ---------------------------------------------------------------------------
// Strip animation helpers
// ---------------------------------------------------------------------------

function wheelIndexOf(pocket: number): number {
  return WHEEL_ORDER.indexOf(pocket);
}

// Total number of cards in the extended (repeated) strip
const TOTAL_CARDS = WHEEL_ORDER.length * STRIP_COPIES;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MiniAppRoulette({
  initData,
  initialChipBalance,
  onBack,
}: MiniAppRouletteProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<RouletteInfo | null>(null);
  const [chipBalance, setChipBalance] = useState(initialChipBalance);
  const [selectedChip, setSelectedChip] = useState(25);
  // Map from betKey → RouletteBet
  const [bets, setBets] = useState<Map<string, RouletteBet>>(new Map());
  const [lastResult, setLastResult] = useState<SpinResult | null>(null);

  // Strip animation
  const stripRef = useRef<HTMLDivElement>(null);
  const idleRafRef = useRef<number>(0);
  const idleOffsetRef = useRef(0); // px offset for idle drift
  const spinningRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Load info
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetch('/api/arcade/roulette/info')
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setInfo({ minBet: d.minBet, maxBetPerZone: d.maxBetPerZone, maxTotalBet: d.maxTotalBet });
          setPhase('idle');
        } else {
          setPhase('load-error');
        }
      })
      .catch(() => setPhase('load-error'));
  }, []);

  // ---------------------------------------------------------------------------
  // Idle drift animation
  // ---------------------------------------------------------------------------
  const startIdleDrift = useCallback(() => {
    if (spinningRef.current) return;
    let last = performance.now();
    const tick = (now: number) => {
      if (spinningRef.current) return;
      const dt = now - last;
      last = now;
      idleOffsetRef.current -= (dt / 1000) * CARD_STRIDE * 0.4; // 0.4 cards/s
      // Loop back seamlessly after scrolling one full wheel length
      const loopWidth = WHEEL_ORDER.length * CARD_STRIDE;
      if (idleOffsetRef.current <= -loopWidth) {
        idleOffsetRef.current += loopWidth;
      }
      if (stripRef.current) {
        stripRef.current.style.transform = `translateX(${idleOffsetRef.current}px)`;
      }
      idleRafRef.current = requestAnimationFrame(tick);
    };
    idleRafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopIdleDrift = useCallback(() => {
    cancelAnimationFrame(idleRafRef.current);
  }, []);

  useEffect(() => {
    if (phase === 'idle') {
      startIdleDrift();
    } else {
      stopIdleDrift();
    }
    return stopIdleDrift;
  }, [phase, startIdleDrift, stopIdleDrift]);

  // ---------------------------------------------------------------------------
  // Bet management
  // ---------------------------------------------------------------------------
  const totalBet = Array.from(bets.values()).reduce((s, b) => s + b.amount, 0);

  const placeBet = useCallback(
    (type: RouletteBetType, numbers?: number[]) => {
      if (phase !== 'idle' && phase !== 'result') return;
      setBets((prev) => {
        const k = betKey(type, numbers);
        const existing = prev.get(k);
        const currentAmt = existing?.amount ?? 0;
        const maxPerZone = info?.maxBetPerZone ?? 1000;
        const maxTotal = info?.maxTotalBet ?? 5000;
        const currentTotal = Array.from(prev.values()).reduce((s, b) => s + b.amount, 0);
        const add = Math.min(selectedChip, maxPerZone - currentAmt, maxTotal - currentTotal);
        if (add <= 0) return prev;
        const next = new Map(prev);
        next.set(k, numberToBetObj(type, currentAmt + add, numbers));
        return next;
      });
    },
    [phase, info, selectedChip],
  );

  const clearBets = useCallback(() => {
    setBets(new Map());
  }, []);

  // ---------------------------------------------------------------------------
  // Spin animation — scrolls strip to land on the result pocket
  // ---------------------------------------------------------------------------
  function animateSpin(resultPocket: number, onDone: () => void) {
    spinningRef.current = true;
    const strip = stripRef.current;
    if (!strip) { onDone(); return; }

    const wheelIdx = wheelIndexOf(resultPocket);
    // Center the result card under the marker using the *measured* window width.
    const containerW = strip.parentElement?.clientWidth || 320;
    const containerCenter = containerW / 2 - CARD_W / 2; // landing card's left edge so it sits dead-centre
    const loopWidth = WHEEL_ORDER.length * CARD_STRIDE;
    const halfWin = Math.ceil(containerW / CARD_STRIDE / 2) + 1;

    const startOffset = idleOffsetRef.current;

    // Land ~SPIN_LAPS laps to the left of where we are now, then snap to the
    // nearest copy of the result pocket so it ends up dead-centre.
    const approxOffset = startOffset - SPIN_LAPS * loopWidth;
    const approxIdx = (containerCenter - approxOffset) / CARD_STRIDE;
    let landingIdx =
      Math.round((approxIdx - wheelIdx) / WHEEL_ORDER.length) * WHEEL_ORDER.length + wheelIdx;
    // Keep the landing card inside the filled part of the strip (no black edges).
    const maxIdx = TOTAL_CARDS - 1 - halfWin;
    const minIdx = halfWin;
    while (landingIdx > maxIdx) landingIdx -= WHEEL_ORDER.length;
    while (landingIdx < minIdx) landingIdx += WHEEL_ORDER.length;

    const finalOffset = -(landingIdx * CARD_STRIDE) + containerCenter;
    const totalDistance = finalOffset - startOffset;

    const duration = 4200; // ms
    const startTime = performance.now();

    function easeOut(t: number): number {
      return 1 - Math.pow(1 - t, 4);
    }

    function frame(now: number) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const current = startOffset + totalDistance * easeOut(t);
      strip.style.transform = `translateX(${current}px)`;
      if (t < 1) {
        idleOffsetRef.current = current;
        requestAnimationFrame(frame);
      } else {
        // Normalise into [-loopWidth, 0]. The strip is periodic, so this shows
        // the same number while keeping idle drift and the next spin on-screen.
        let norm = finalOffset % loopWidth;
        if (norm > 0) norm -= loopWidth;
        idleOffsetRef.current = norm;
        strip.style.transform = `translateX(${norm}px)`;
        spinningRef.current = false;
        onDone();
      }
    }
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // Spin submit
  // ---------------------------------------------------------------------------
  const handleSpin = useCallback(async () => {
    if (phase !== 'idle' && phase !== 'result') return;
    if (bets.size === 0) return;

    const betsArr = Array.from(bets.values());
    setPhase('spinning');

    let data: SpinResult & { ok: boolean; error?: string };
    try {
      const resp = await fetch('/api/arcade/roulette/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, bets: betsArr }),
      });
      data = await resp.json();
    } catch {
      setPhase('idle');
      return;
    }

    if (!data.ok) {
      setPhase('idle');
      return;
    }

    animateSpin(data.result, () => {
      setLastResult(data);
      setChipBalance(data.chipBalance);
      setBets(new Map());
      setPhase('result');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, bets, initData]);

  // ---------------------------------------------------------------------------
  // Pocket color styling helpers
  // ---------------------------------------------------------------------------
  const pocketBg = (n: number) => {
    const c = pocketColor(n);
    if (c === 'green') return '#16a34a';
    if (c === 'red') return '#dc2626';
    return '#1e293b';
  };

  const isWinningNumber = (n: number) =>
    phase === 'result' && lastResult?.result === n;

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  function betAmount(type: RouletteBetType, numbers?: number[]): number {
    return bets.get(betKey(type, numbers))?.amount ?? 0;
  }

  function BetChip({ amount }: { amount: number }) {
    if (amount <= 0) return null;
    return (
      <span className="rl-chip">
        {amount >= 1000 ? `${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k` : amount}
      </span>
    );
  }

  // ---------------------------------------------------------------------------
  // Rolodex strip
  // ---------------------------------------------------------------------------
  const stripPockets = Array.from({ length: TOTAL_CARDS }, (_, i) => WHEEL_ORDER[i % WHEEL_ORDER.length]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (phase === 'loading') {
    return (
      <div className="rl-screen">
        <div className="rl-spinner" />
      </div>
    );
  }

  if (phase === 'load-error') {
    return (
      <div className="rl-screen">
        <button type="button" onClick={onBack} className="rl-back"><IconArrowLeft size={18} /></button>
        <p className="rl-error">Could not load roulette. Please try again.</p>
      </div>
    );
  }

  const net = lastResult ? lastResult.totalPayout - (lastResult.bets.reduce((s, b) => s + b.amount, 0)) : 0;

  return (
    <>
      <style>{`
        .rl-screen{display:flex;flex-direction:column;min-height:100dvh;background:linear-gradient(165deg,#0c1c30 0%,#050a14 72%);color:#fff;padding:0 0 env(safe-area-inset-bottom,12px);}
        .rl-header{display:flex;align-items:center;gap:10px;padding:12px 14px 8px;}
        .rl-back{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:12px;border:1px solid rgba(34,211,238,.3);background:rgba(34,211,238,.06);color:#22d3ee;flex-shrink:0;}
        .rl-title{font-family:Mitr,sans-serif;font-weight:700;font-size:1.1rem;color:#fff;}
        .rl-balance{margin-left:auto;font-size:.75rem;color:#94a3b8;}
        .rl-balance strong{color:#22d3ee;}

        /* Rolodex strip */
        .rl-strip-wrap{position:relative;height:68px;overflow:hidden;background:#070f1c;border-top:1px solid rgba(34,211,238,.12);border-bottom:1px solid rgba(34,211,238,.12);-webkit-mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);mask-image:linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent);}
        .rl-strip-inner{display:flex;gap:${CARD_GAP}px;position:absolute;left:0;top:0;bottom:0;align-items:center;will-change:transform;}
        .rl-card{width:${CARD_W}px;height:52px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:8px;font-family:Mitr,sans-serif;font-weight:700;font-size:1rem;}
        .rl-strip-center-box{position:absolute;top:5px;bottom:5px;left:50%;width:${CARD_W + 8}px;transform:translateX(-50%);border:2px solid #22d3ee;border-radius:10px;box-shadow:0 0 16px 2px rgba(34,211,238,.45),inset 0 0 10px rgba(34,211,238,.15);pointer-events:none;z-index:3;}
        .rl-strip-caret{position:absolute;top:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #22d3ee;z-index:4;}
        .rl-strip-caret-bot{position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:9px solid #22d3ee;z-index:4;}

        /* Felt table — vertical (mobile-first, fills available height) */
        .rl-felt{padding:8px 10px 6px;flex:1;min-height:0;display:flex;flex-direction:column;gap:6px;}
        .rl-board{flex:1;min-height:0;display:grid;grid-template-columns:repeat(3,1fr) 30px;grid-template-rows:38px repeat(12,minmax(24px,1fr)) 30px;gap:3px;padding:5px;background:#0b3d1a;border:1px solid rgba(34,211,238,.2);border-radius:12px;}
        .rl-cell{display:flex;align-items:center;justify-content:center;position:relative;border:none;border-radius:6px;color:#fff;font-family:Mitr,sans-serif;font-weight:700;font-size:.85rem;cursor:pointer;min-height:0;min-width:0;padding:0;}
        .rl-cell:disabled{cursor:default;}
        .rl-cell.rl-winning{box-shadow:inset 0 0 0 2px #fbbf24,0 0 10px 2px rgba(251,191,36,.6);z-index:1;}
        .rl-zero-v{background:#16a34a;font-size:1rem;}
        .rl-num-v{font-size:.95rem;}
        .rl-dozen-v{background:#093016;color:#86efac;writing-mode:vertical-rl;font-size:.72rem;letter-spacing:.05em;}
        .rl-col-v{background:#093016;color:#86efac;font-size:.72rem;}

        .rl-evens-v{display:grid;grid-template-columns:repeat(3,1fr);gap:3px;}
        .rl-even-v{display:flex;align-items:center;justify-content:center;position:relative;border:none;border-radius:6px;font-family:Mitr,sans-serif;font-weight:700;font-size:.74rem;padding:9px 0;cursor:pointer;}
        .rl-even-v:disabled{cursor:default;}

        /* Bet chip badge */
        .rl-chip{position:absolute;top:1px;right:1px;background:#22d3ee;color:#050a14;border-radius:4px;font-size:.48rem;font-weight:900;padding:0 2px;min-width:12px;text-align:center;line-height:13px;pointer-events:none;z-index:2;}

        /* Bottom controls */
        .rl-controls{padding:10px 12px 8px;display:flex;flex-direction:column;gap:8px;}
        .rl-chip-row{display:flex;gap:6px;align-items:center;}
        .rl-chip-btn{flex:1;padding:6px 0;border-radius:10px;border:1px solid rgba(34,211,238,.25);background:rgba(34,211,238,.06);color:#94a3b8;font-size:.75rem;font-weight:700;cursor:pointer;transition:all .15s;}
        .rl-chip-btn.rl-chip-selected{border-color:#22d3ee;background:rgba(34,211,238,.18);color:#22d3ee;box-shadow:0 0 10px -2px rgba(34,211,238,.4);}
        .rl-clear-btn{width:32px;height:32px;border-radius:9px;border:1px solid rgba(239,68,68,.3);background:rgba(239,68,68,.06);color:#f87171;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;}
        .rl-action-row{display:flex;gap:8px;align-items:center;}
        .rl-bet-info{flex:1;font-size:.7rem;color:#64748b;}
        .rl-bet-info span{color:#22d3ee;font-weight:700;}
        .rl-spin-btn{flex:1;padding:12px 0;border-radius:14px;background:linear-gradient(135deg,#0891b2,#2563eb);border:none;color:#fff;font-family:Mitr,sans-serif;font-weight:700;font-size:1rem;cursor:pointer;box-shadow:0 8px 26px -8px rgba(6,182,212,.55),0 0 0 1px rgba(34,211,238,.2);letter-spacing:.02em;}
        .rl-spin-btn:disabled{opacity:.4;cursor:default;box-shadow:none;}

        /* Result banner */
        .rl-result-banner{margin:8px 12px 0;border-radius:14px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;}
        .rl-result-banner.rl-win{background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.35);}
        .rl-result-banner.rl-loss{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);}
        .rl-result-number{display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;font-family:Mitr,sans-serif;font-weight:700;font-size:1.1rem;flex-shrink:0;}
        .rl-result-text{flex:1;}
        .rl-result-title{font-family:Mitr,sans-serif;font-weight:700;font-size:.9rem;}
        .rl-result-sub{font-size:.7rem;color:#94a3b8;margin-top:1px;}
        .rl-verify-link{font-size:.6rem;color:#22d3ee;text-decoration:underline;cursor:pointer;}

        .rl-spinner{width:32px;height:32px;border:3px solid rgba(34,211,238,.2);border-top-color:#22d3ee;border-radius:50%;animation:rl-spin .7s linear infinite;margin:auto;}
        @keyframes rl-spin{to{transform:rotate(360deg)}}
        .rl-error{text-align:center;color:#f87171;padding:24px;}
      `}</style>

      <div className="rl-screen">
        {/* Header */}
        <div className="rl-header">
          <button type="button" onClick={onBack} aria-label="Back" className="rl-back">
            <IconArrowLeft size={18} aria-hidden />
          </button>
          <span className="rl-title">Roulette</span>
          <span className="rl-balance">
            <strong>{Number(chipBalance).toLocaleString('en-US')}</strong> chips
          </span>
        </div>

        {/* Rolodex strip */}
        <div className="rl-strip-wrap">
          <div className="rl-strip-center-box" />
          <div className="rl-strip-caret" />
          <div className="rl-strip-caret-bot" />
          <div className="rl-strip-inner" ref={stripRef}>
            {stripPockets.map((pocket, i) => {
              const bg = pocketBg(pocket);
              // Cards are styled uniformly; the fixed .rl-strip-center-box overlay
              // frames whichever card the strip lands under (the result pocket).
              return (
                <div
                  key={i}
                  className="rl-card"
                  style={{ background: bg, color: '#fff' }}
                >
                  {pocket}
                </div>
              );
            })}
          </div>
        </div>

        {/* Result banner */}
        {phase === 'result' && lastResult && (
          <div className={`rl-result-banner ${net >= 0 ? 'rl-win' : 'rl-loss'}`}>
            <div
              className="rl-result-number"
              style={{ background: pocketBg(lastResult.result), color: '#fff' }}
            >
              {lastResult.result}
            </div>
            <div className="rl-result-text">
              <div className={`rl-result-title ${net >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {net >= 0
                  ? `+${net.toLocaleString('en-US')} chips`
                  : `${net.toLocaleString('en-US')} chips`}
              </div>
              <div className="rl-result-sub">
                Payout {lastResult.totalPayout.toLocaleString('en-US')} ·{' '}
                {pocketColor(lastResult.result).toUpperCase()} · {lastResult.result === 0 ? 'ZERO' : lastResult.result % 2 === 0 ? 'EVEN' : 'ODD'}
              </div>
            </div>
            <a
              href={`/tg/verify/roulette/${lastResult.spinId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rl-verify-link"
            >
              Verify
            </a>
          </div>
        )}

        {/* European felt — vertical layout, fills available height */}
        <div className="rl-felt">
          <div className="rl-board">
            {/* Zero — full-width top bar */}
            <button
              type="button"
              className={`rl-cell rl-zero-v${isWinningNumber(0) ? ' rl-winning' : ''}`}
              style={{ gridColumn: '1 / -1', gridRow: 1 }}
              onClick={() => placeBet('straight', [0])}
              disabled={phase === 'spinning'}
            >
              0
              <BetChip amount={betAmount('straight', [0])} />
            </button>

            {/* Numbers 1–36 — 12 rows × 3 columns */}
            {Array.from({ length: 36 }, (_, i) => i + 1).map((n) => {
              const col = (n - 1) % 3;
              const row = Math.floor((n - 1) / 3);
              return (
                <button
                  key={n}
                  type="button"
                  className={`rl-cell rl-num-v${isWinningNumber(n) ? ' rl-winning' : ''}`}
                  style={{ gridColumn: col + 1, gridRow: row + 2, background: pocketBg(n) }}
                  onClick={() => placeBet('straight', [n])}
                  disabled={phase === 'spinning'}
                >
                  {n}
                  <BetChip amount={betAmount('straight', [n])} />
                </button>
              );
            })}

            {/* Dozen bets — right rail, each spanning four number rows */}
            {([
              ['1st 12', DOZEN_1, 2],
              ['2nd 12', DOZEN_2, 6],
              ['3rd 12', DOZEN_3, 10],
            ] as [string, number[], number][]).map(([label, nums, startRow]) => (
              <button
                key={label}
                type="button"
                className="rl-cell rl-dozen-v"
                style={{ gridColumn: 4, gridRow: `${startRow} / ${startRow + 4}` }}
                onClick={() => placeBet('dozen', nums)}
                disabled={phase === 'spinning'}
              >
                {label}
                <BetChip amount={betAmount('dozen', nums)} />
              </button>
            ))}

            {/* Column 2:1 bets — bottom of each number column */}
            {([COLUMN_1, COLUMN_2, COLUMN_3] as number[][]).map((nums, ci) => (
              <button
                key={ci}
                type="button"
                className="rl-cell rl-col-v"
                style={{ gridColumn: ci + 1, gridRow: 14 }}
                onClick={() => placeBet('column', nums)}
                disabled={phase === 'spinning'}
              >
                2:1
                <BetChip amount={betAmount('column', nums)} />
              </button>
            ))}
          </div>

          {/* Even-money bets */}
          <div className="rl-evens-v">
            {([
              ['1-18', 'low'],
              ['EVEN', 'even'],
              ['RED', 'red'],
              ['BLACK', 'black'],
              ['ODD', 'odd'],
              ['19-36', 'high'],
            ] as [string, RouletteBetType][]).map(([label, type]) => {
              const isRed = type === 'red';
              const isBlack = type === 'black';
              return (
                <button
                  key={type}
                  type="button"
                  className="rl-even-v"
                  style={{
                    background: isRed ? '#dc2626' : isBlack ? '#1e293b' : '#0b3d1a',
                    color: isRed || isBlack ? '#fff' : '#86efac',
                  }}
                  onClick={() => placeBet(type)}
                  disabled={phase === 'spinning'}
                >
                  {label}
                  <BetChip amount={betAmount(type)} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Controls */}
        <div className="rl-controls">
          {/* Chip picker */}
          <div className="rl-chip-row">
            {CHIP_VALUES.map((v) => (
              <button
                key={v}
                type="button"
                className={`rl-chip-btn${selectedChip === v ? ' rl-chip-selected' : ''}`}
                onClick={() => setSelectedChip(v)}
              >
                {v}
              </button>
            ))}
            <button
              type="button"
              className="rl-clear-btn"
              onClick={clearBets}
              disabled={bets.size === 0}
              aria-label="Clear bets"
            >
              <IconRefresh size={14} aria-hidden />
            </button>
          </div>

          {/* Bet info + Spin */}
          <div className="rl-action-row">
            <div className="rl-bet-info">
              {totalBet > 0 ? (
                <>Betting <span>{totalBet.toLocaleString('en-US')}</span> chips on <span>{bets.size}</span> zone{bets.size > 1 ? 's' : ''}</>
              ) : (
                'Tap a zone to place a bet'
              )}
            </div>
            <button
              type="button"
              className="rl-spin-btn"
              onClick={handleSpin}
              disabled={phase === 'spinning' || totalBet === 0}
            >
              {phase === 'spinning' ? 'SPINNING…' : 'SPIN'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
