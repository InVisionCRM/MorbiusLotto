'use client';

/**
 * MiniAppBaccarat — MORBIUS Arcade: Baccarat (Punto Banco).
 *
 * The polished game screen for the Telegram Mini App. Wired to the
 * provably-fair backend:
 *   GET  /api/arcade/baccarat/info        — bet bounds + payouts
 *   POST /api/arcade/baccarat/play        — atomic debit + deal + payout
 *   GET  /api/arcade/baccarat/verify/:id  — recover the result after a lost reply
 *
 * Standard punto banco: deal P1 B1 P2 B2 with optional P3 B3 per the third-card
 * table. There are no player decisions after the deal — the entire hand is
 * fixed once the deck is shuffled, so the reveal is paced client-side as a
 * sequence of card flips.
 *
 * UX shape mirrors MiniAppVideoPoker / MiniAppDice: phase machine, refs own
 * the imperative reveal animation and synthesised audio, React owns the
 * game state. Visual signature is the cyan-on-navy felt with PLAYER · TIE ·
 * BANKER zones plus the two side-bet pair zones.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { IconArrowLeft } from '@tabler/icons-react';

// ---------------------------------------------------------------------------

interface BaccInfo {
  minBet: number;
  maxBet: number;
  /** All multipliers are ×100 on the wire. */
  payouts: {
    player: number;
    banker: number;
    tie: number;
    playerPair: number;
    bankerPair: number;
  };
}

type BetKey = 'player' | 'banker' | 'tie' | 'playerPair' | 'bankerPair';

type Bets = Record<BetKey, number>;

type Phase = 'loading' | 'load-error' | 'idle' | 'dealing' | 'revealing' | 'resolved';

interface PlayResponse {
  ok: boolean;
  handId: string;
  bets: Bets;
  totalBet: number;
  playerCards: number[];
  bankerCards: number[];
  playerTotal: number;
  bankerTotal: number;
  result: 'player' | 'banker' | 'tie';
  playerPair: boolean;
  bankerPair: boolean;
  payouts: Bets;
  totalPayout: number;
  serverSeedHash: string;
  chipBalance: string;
  error?: string;
}

interface MiniAppBaccaratProps {
  initData: string;
  initialChipBalance: string;
  onBack: () => void;
}

const SUIT_SYM = ['♥', '♦', '♣', '♠'];
const RANK_LABEL = ['', '', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function decodeRank(idx: number): number {
  return (idx % 13) + 2;
}
function decodeSuit(idx: number): number {
  return Math.floor(idx / 13);
}
function isRedSuit(suit: number): boolean {
  return suit === 0 || suit === 1;
}

/** Baccarat value of a single card, for client-side preview totals. */
function bcValue(cardIdx: number): number {
  const rank = decodeRank(cardIdx);
  if (rank === 14) return 1;
  if (rank >= 10) return 0;
  return rank;
}

function totalOfRevealed(cards: number[], shown: number): number {
  let s = 0;
  for (let i = 0; i < Math.min(shown, cards.length); i++) {
    s += bcValue(cards[i]!);
  }
  return s % 10;
}

function shortChip(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return k % 1 === 0 ? `${k}k` : `${k.toFixed(1)}k`;
  }
  return String(n);
}

function labelForResult(r: 'player' | 'banker' | 'tie'): string {
  if (r === 'player') return 'PLAYER WINS';
  if (r === 'banker') return 'BANKER WINS';
  return 'TIE';
}

// ---------------------------------------------------------------------------

const BC_CSS = `
.bc-table{position:relative;border-radius:20px;overflow:hidden;
 background:radial-gradient(ellipse 80% 72% at 50% 28%,rgba(6,182,212,0.17),transparent 62%),linear-gradient(180deg,#0c1c30,#081320);
 border:1px solid rgba(6,182,212,0.30);box-shadow:inset 0 0 30px rgba(6,182,212,0.10);}
.bc-fx{position:absolute;inset:0;pointer-events:none;z-index:7;}

.bc-felt{position:relative;border-radius:14px;padding:14px 12px 16px;margin-bottom:10px;
 background:radial-gradient(ellipse 65% 80% at 50% 50%,rgba(34,211,238,0.10),transparent 80%),linear-gradient(180deg,#042027,#021318);
 border:1px solid rgba(34,211,238,0.22);}
.bc-hands{display:grid;grid-template-columns:1fr auto 1fr;gap:10px;align-items:center;}
.bc-hand-side{display:flex;flex-direction:column;align-items:center;min-width:0;}
.bc-hand-label{font-size:9px;font-weight:800;letter-spacing:0.25em;color:#94a3b8;margin-bottom:8px;transition:color .2s;}
.bc-hand-label.bc-win{color:#22c55e;}
.bc-hand-cards{display:flex;gap:3px;min-height:60px;align-items:flex-start;}
.bc-vs{color:#475569;font-size:11px;font-weight:900;letter-spacing:0.15em;}
.bc-score{margin-top:8px;font-size:22px;font-weight:900;color:#22d3ee;line-height:1;
 font-variant-numeric:tabular-nums;text-shadow:0 0 12px rgba(34,211,238,0.45);transition:color .2s,text-shadow .2s;}
.bc-score.bc-win{color:#22c55e;text-shadow:0 0 14px rgba(34,197,94,0.6);animation:bcPop .5s cubic-bezier(.34,1.5,.5,1);}
@keyframes bcPop{0%{transform:scale(0.86);}55%{transform:scale(1.12);}100%{transform:scale(1);}}

.bc-card-wrap{width:42px;height:60px;perspective:600px;}
.bc-card{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .44s cubic-bezier(.45,.05,.25,1);}
.bc-card.bc-flipped{transform:rotateY(180deg);}
.bc-cface{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:5px;
 box-shadow:0 4px 10px rgba(0,0,0,0.5);}
.bc-cback{background:radial-gradient(circle,rgba(34,211,238,0.18) 1px,transparent 1.6px) 0 0/7px 7px,linear-gradient(155deg,#16324f,#0a1626);
 border:1px solid rgba(34,211,238,0.35);display:flex;align-items:center;justify-content:center;}
.bc-cback i{width:20px;height:20px;border:1.4px solid rgba(34,211,238,0.55);border-radius:4px;transform:rotate(45deg);
 display:flex;align-items:center;justify-content:center;}
.bc-cback i::after{content:"";width:7px;height:7px;background:#22d3ee;border-radius:1.6px;}
.bc-cfront{transform:rotateY(180deg);background:linear-gradient(162deg,#ffffff,#dde6f1);border:1px solid rgba(0,0,0,0.18);}
.bc-cfront.bc-red{color:#e5384f;}
.bc-cfront.bc-blk{color:#1b2436;}
.bc-cidx{position:absolute;display:flex;flex-direction:column;align-items:center;line-height:0.92;font-weight:800;}
.bc-cidx .bc-cr{font-size:11px;}
.bc-cidx .bc-cs{font-size:9px;}
.bc-tl{top:4px;left:4px;}
.bc-br{bottom:4px;right:4px;transform:rotate(180deg);}
.bc-cpip{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;}

.bc-bets{display:grid;grid-template-columns:1fr 0.7fr 1fr;gap:6px;margin-bottom:6px;}
.bc-bet{position:relative;border-radius:10px;padding:9px 4px;text-align:center;cursor:pointer;
 border:1px solid rgba(34,211,238,0.20);background:rgba(34,211,238,0.04);transition:all .15s;}
.bc-bet.bc-tie{border-color:rgba(245,197,24,0.30);background:rgba(245,197,24,0.04);}
.bc-bet.bc-focus{border-color:#22d3ee;background:rgba(34,211,238,0.14);box-shadow:0 0 14px rgba(34,211,238,0.30);}
.bc-bet.bc-tie.bc-focus{border-color:#f5c518;background:rgba(245,197,24,0.14);box-shadow:0 0 14px rgba(245,197,24,0.30);}
.bc-bet.bc-win-zone{border-color:rgba(34,197,94,0.7);background:rgba(34,197,94,0.16);
 box-shadow:0 0 18px rgba(34,197,94,0.45);animation:bcWinZone 1.2s infinite;}
@keyframes bcWinZone{0%,100%{box-shadow:0 0 18px rgba(34,197,94,0.45);}50%{box-shadow:0 0 28px rgba(34,197,94,0.75);}}
.bc-bet-name{font-size:10px;font-weight:900;letter-spacing:0.12em;color:#fff;}
.bc-bet-pay{font-size:9px;color:#94a3b8;margin-top:2px;letter-spacing:0.06em;}
.bc-bet-pay strong{color:#f5c518;}
.bc-bet-amount{margin-top:4px;font-size:13px;font-weight:900;color:#22d3ee;font-variant-numeric:tabular-nums;min-height:16px;}
.bc-bet-amount.bc-zero{color:#475569;}
.bc-bet.bc-tie .bc-bet-amount{color:#f5c518;}
.bc-bet.bc-tie .bc-bet-amount.bc-zero{color:#475569;}

.bc-sides{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;}
.bc-side{position:relative;border-radius:9px;padding:7px 4px;text-align:center;cursor:pointer;
 border:1px solid rgba(168,85,247,0.25);background:rgba(168,85,247,0.04);transition:all .15s;}
.bc-side.bc-focus{border-color:#a855f7;background:rgba(168,85,247,0.14);box-shadow:0 0 12px rgba(168,85,247,0.30);}
.bc-side.bc-win-zone{border-color:rgba(34,197,94,0.7);background:rgba(34,197,94,0.16);
 box-shadow:0 0 14px rgba(34,197,94,0.45);}
.bc-side-name{font-size:9px;font-weight:900;letter-spacing:0.1em;color:#fff;}
.bc-side-pay{font-size:9px;color:#c4b5fd;font-weight:800;margin-top:1px;}
.bc-side-amount{font-size:12px;font-weight:900;font-variant-numeric:tabular-nums;color:#a855f7;margin-top:1px;}
.bc-side-amount.bc-zero{color:#475569;}

.bc-chip{position:absolute;top:-6px;right:-4px;min-width:22px;height:22px;border-radius:50%;padding:0 4px;
 background:radial-gradient(circle at 30% 30%,#22d3ee,#0e7490);border:2px dashed rgba(255,255,255,0.45);
 color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;
 box-shadow:0 4px 8px rgba(0,0,0,0.4);font-variant-numeric:tabular-nums;}
.bc-chip.bc-tie-chip{background:radial-gradient(circle at 30% 30%,#f5c518,#b8860b);color:#2a1a00;}
.bc-chip.bc-side-chip{background:radial-gradient(circle at 30% 30%,#a855f7,#6b21a8);}

.bc-status{min-height:17px;text-align:center;font-size:11px;color:#94a3b8;margin:6px 0;}
.bc-status.bc-win{color:#22c55e;font-weight:700;}
.bc-status.bc-loss{color:#fca5a5;}
.bc-status.bc-tieline{color:#f5c518;}

.bc-bet-row{display:flex;align-items:center;gap:8px;padding:6px 4px;}
.bc-stp{width:34px;height:34px;border-radius:9px;border:1px solid rgba(6,182,212,0.30);background:rgba(34,211,238,0.06);
 color:#22d3ee;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;}
.bc-stp:disabled{opacity:0.3;cursor:default;}
.bc-bet-label{flex:1;font-size:10px;color:#64748b;letter-spacing:0.1em;text-transform:uppercase;}
.bc-bet-label strong{color:#22d3ee;letter-spacing:0.14em;}
.bc-bet-value{min-width:64px;text-align:center;font-size:15px;font-weight:900;color:#22d3ee;
 font-variant-numeric:tabular-nums;}
.bc-clear{padding:5px 10px;border-radius:7px;border:1px solid rgba(239,68,68,0.30);background:rgba(239,68,68,0.05);
 color:#fca5a5;font-size:10px;font-weight:700;letter-spacing:0.08em;cursor:pointer;}
.bc-clear:disabled{opacity:0.3;cursor:default;}

.bc-chip-row{display:flex;gap:6px;justify-content:center;padding:4px 0 8px;}
.bc-chip-btn{padding:5px 10px;border-radius:8px;border:1px solid rgba(6,182,212,0.25);background:rgba(34,211,238,0.05);
 color:#9be8f4;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;font-variant-numeric:tabular-nums;}
.bc-chip-btn:hover:not(:disabled){background:rgba(34,211,238,0.12);border-color:rgba(34,211,238,0.45);}
.bc-chip-btn.bc-chip-active{background:linear-gradient(135deg,#0891b2,#2563eb);border-color:transparent;color:#fff;
 box-shadow:0 4px 14px -4px rgba(6,182,212,0.55);}
.bc-chip-btn:disabled{opacity:0.4;cursor:default;}

.bc-deal-btn{width:100%;border:none;border-radius:13px;padding:14px;font-size:16px;font-weight:800;letter-spacing:0.04em;
 cursor:pointer;color:#ffffff;background:linear-gradient(135deg,#0891b2,#2563eb);
 box-shadow:0 8px 26px -8px rgba(6,182,212,0.55),0 0 0 1px rgba(34,211,238,0.20);
 transition:filter .15s,transform .1s;}
.bc-deal-btn:not(:disabled):active{transform:scale(0.98);}
.bc-deal-btn:disabled{opacity:0.45;cursor:default;box-shadow:none;}

.bc-banner{position:absolute;left:50%;top:36%;transform:translate(-50%,-50%) scale(0.6);opacity:0;pointer-events:none;
 text-align:center;transition:transform .4s cubic-bezier(.34,1.55,.5,1),opacity .3s;z-index:6;}
.bc-banner.bc-show{transform:translate(-50%,-50%) scale(1);opacity:1;}
.bc-banner .bc-bt{font-size:22px;font-weight:900;color:#22d3ee;text-shadow:0 2px 14px rgba(34,211,238,0.75);letter-spacing:0.04em;}
.bc-banner .bc-bp{font-size:14px;font-weight:700;color:#eafbff;margin-top:2px;}
.bc-banner.bc-loss .bc-bt{color:#fca5a5;text-shadow:0 2px 14px rgba(239,68,68,0.55);}
.bc-banner.bc-tieline .bc-bt{color:#f5c518;text-shadow:0 2px 14px rgba(245,197,24,0.6);}
`;

const FOCUS_LABEL: Record<BetKey, string> = {
  player: 'PLAYER',
  banker: 'BANKER',
  tie: 'TIE',
  playerPair: 'P-PAIR',
  bankerPair: 'B-PAIR',
};

const CHIP_SIZES = [10, 50, 100, 500, 1000] as const;

// ---------------------------------------------------------------------------

export default function MiniAppBaccarat({
  initData,
  initialChipBalance,
  onBack,
}: MiniAppBaccaratProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<BaccInfo | null>(null);
  const [chips, setChips] = useState<number>(() => {
    const n = Number(initialChipBalance);
    return Number.isFinite(n) ? n : 0;
  });
  const [bets, setBets] = useState<Bets>({
    player: 0,
    banker: 0,
    tie: 0,
    playerPair: 0,
    bankerPair: 0,
  });
  const [focusedZone, setFocusedZone] = useState<BetKey>('player');
  const [chipStep, setChipStep] = useState<number>(50);
  const [playerCards, setPlayerCards] = useState<number[]>([]);
  const [bankerCards, setBankerCards] = useState<number[]>([]);
  const [revealedP, setRevealedP] = useState(0);
  const [revealedB, setRevealedB] = useState(0);
  const [resultData, setResultData] = useState<PlayResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(false);

  const fxRef = useRef<HTMLCanvasElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; master: GainNode } | null>(null);
  const mutedRef = useRef(false);

  const after = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  // --- sound (same shape as MiniAppVideoPoker / MiniAppDice) -----------------

  const ensureAudio = useCallback(() => {
    if (audioRef.current) {
      if (audioRef.current.ctx.state === 'suspended') void audioRef.current.ctx.resume();
      return;
    }
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = mutedRef.current ? 0 : 0.5;
      master.connect(ctx.destination);
      audioRef.current = { ctx, master };
    } catch {
      /* sound is best-effort */
    }
  }, []);

  const snd = useCallback((kind: string) => {
    const a = audioRef.current;
    if (!a) return;
    const { ctx, master } = a;
    const t0 = ctx.currentTime;
    const tone = (f: number, at: number, dur: number, type: OscillatorType, vol: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(vol, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(g);
      g.connect(master);
      o.start(at);
      o.stop(at + dur + 0.03);
    };
    const noise = (at: number, dur: number, vol: number, cut: number) => {
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cut;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, at);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(at);
      src.stop(at + dur + 0.03);
    };
    if (kind === 'flip') {
      noise(t0, 0.06, 0.25, 2600);
      tone(720, t0, 0.04, 'triangle', 0.05);
    } else if (kind === 'chip') {
      tone(820, t0, 0.06, 'sine', 0.16);
      tone(1240, t0 + 0.04, 0.05, 'sine', 0.08);
    } else if (kind === 'win') {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, t0 + i * 0.1, 0.34, 'triangle', 0.16));
    } else if (kind === 'bigwin') {
      [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) =>
        tone(f, t0 + i * 0.095, 0.42, 'triangle', 0.19),
      );
      noise(t0, 0.5, 0.1, 5000);
    } else if (kind === 'tie') {
      tone(440, t0, 0.18, 'sine', 0.16);
      tone(660, t0 + 0.1, 0.18, 'sine', 0.12);
    } else if (kind === 'lose') {
      tone(233, t0, 0.16, 'sine', 0.1);
      tone(175, t0 + 0.09, 0.2, 'sine', 0.08);
    }
  }, []);

  // --- particle burst (mirror MiniAppVideoPoker) -----------------------------

  const burst = useCallback((count: number) => {
    const cv = fxRef.current;
    const table = tableRef.current;
    if (!cv || !table) return;
    cv.width = table.clientWidth;
    cv.height = table.clientHeight;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    type P = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      life: number;
      rot: number;
      vr: number;
      c: string;
    };
    const parts: P[] = [];
    const cx = cv.width / 2;
    const cy = cv.height * 0.4;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 7;
      parts.push({
        x: cx + (Math.random() - 0.5) * 130,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 3,
        r: 3 + Math.random() * 4,
        life: 1,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 0.4,
        c: Math.random() < 0.5 ? '#22d3ee' : '#a5f3fc',
      });
    }
    const step = () => {
      if (!cv.isConnected) {
        rafRef.current = null;
        return;
      }
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]!;
        p.vy += 0.22;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.99;
        p.rot += p.vr;
        p.life -= 0.012;
        if (p.life <= 0 || p.y > cv.height + 30) {
          parts.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r, p.r * 0.62, 0, 0, 7);
        ctx.fill();
        ctx.restore();
      }
      if (parts.length) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, cv.width, cv.height);
        rafRef.current = null;
      }
    };
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(step);
  }, []);

  // --- load info -------------------------------------------------------------

  const loadInfo = useCallback(async () => {
    setPhase('loading');
    try {
      const res = await fetch('/api/arcade/baccarat/info');
      const data = (await res.json()) as BaccInfo & { ok?: boolean };
      if (!res.ok || !data?.ok) {
        setPhase('load-error');
        return;
      }
      setInfo(data);
      setPhase('idle');
    } catch {
      setPhase('load-error');
    }
  }, []);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  useEffect(() => {
    const timersList = timers.current;
    return () => {
      timersList.forEach((id) => window.clearTimeout(id));
      audioRef.current?.ctx.close().catch(() => {});
    };
  }, []);

  // --- bet handlers ----------------------------------------------------------

  const adjustBet = useCallback(
    (zone: BetKey, delta: number) => {
      if (!info) return;
      setBets((prev) => {
        const next = { ...prev };
        const cur = next[zone];
        let v = cur + delta;
        if (v < info.minBet) v = delta > 0 ? info.minBet : 0;
        if (v > info.maxBet) v = info.maxBet;
        next[zone] = v;
        return next;
      });
      if (delta > 0) {
        ensureAudio();
        snd('chip');
      }
    },
    [info, ensureAudio, snd],
  );

  const clearBets = useCallback(() => {
    setBets({ player: 0, banker: 0, tie: 0, playerPair: 0, bankerPair: 0 });
  }, []);

  const focusZone = useCallback((zone: BetKey) => {
    setFocusedZone(zone);
  }, []);

  const totalBet = bets.player + bets.banker + bets.tie + bets.playerPair + bets.bankerPair;

  // --- deal flow -------------------------------------------------------------

  /**
   * Pace the card reveal so it feels like a real deal: P1, B1, P2, B2, then
   * (if drawn) P3 and B3 with a slightly longer pause before the third pair
   * to telegraph the third-card decision. Once both hands are fully revealed,
   * trigger the resolution celebration.
   */
  const runRevealAnimation = useCallback(
    (pCards: number[], bCards: number[], onDone: () => void) => {
      // Build interleaved reveal order. Up to 6 cards total.
      type Step = { side: 'p' | 'b'; idx: number; delay: number };
      const steps: Step[] = [];
      const initialGap = 280;
      const thirdGap = 460; // pause before the optional third-card pair
      // P1, B1, P2, B2
      steps.push({ side: 'p', idx: 0, delay: initialGap });
      steps.push({ side: 'b', idx: 0, delay: initialGap });
      steps.push({ side: 'p', idx: 1, delay: initialGap });
      steps.push({ side: 'b', idx: 1, delay: initialGap });
      // P3 / B3 (in that order if both exist; in either order if only one does)
      if (pCards.length > 2) steps.push({ side: 'p', idx: 2, delay: thirdGap });
      if (bCards.length > 2) {
        // If the player drew, this comes after the player's third (regular gap).
        const d = pCards.length > 2 ? initialGap : thirdGap;
        steps.push({ side: 'b', idx: 2, delay: d });
      }

      let t = 0;
      for (const s of steps) {
        t += s.delay;
        const { side } = s;
        after(() => {
          if (side === 'p') setRevealedP((n) => n + 1);
          else setRevealedB((n) => n + 1);
          snd('flip');
        }, t);
      }
      after(onDone, t + 380);
    },
    [after, snd],
  );

  const celebrate = useCallback(
    (r: PlayResponse) => {
      const banner = bannerRef.current;
      const net = r.totalPayout - r.totalBet;
      if (net > 0) {
        const big = r.totalPayout >= r.totalBet * 5;
        snd(big ? 'bigwin' : 'win');
        burst(big ? 70 : 40);
        if (banner) {
          banner.classList.remove('bc-loss', 'bc-tieline');
          banner.classList.add('bc-show');
          after(() => banner.classList.remove('bc-show'), 2400);
        }
      } else if (r.result === 'tie' && net === 0) {
        snd('tie');
        if (banner) {
          banner.classList.remove('bc-loss');
          banner.classList.add('bc-tieline', 'bc-show');
          after(() => banner.classList.remove('bc-show'), 2000);
        }
      } else {
        snd('lose');
        if (banner) {
          banner.classList.remove('bc-tieline');
          banner.classList.add('bc-loss', 'bc-show');
          after(() => banner.classList.remove('bc-show'), 1800);
        }
      }
    },
    [after, burst, snd],
  );

  const onDeal = useCallback(async () => {
    if (!info || phase === 'dealing' || phase === 'revealing') return;
    if (totalBet === 0) {
      setErrorMsg('Place at least one bet.');
      return;
    }
    if (chips < totalBet) {
      setErrorMsg('Not enough chips for that wager.');
      return;
    }
    ensureAudio();
    setErrorMsg('');
    setResultData(null);
    setPlayerCards([]);
    setBankerCards([]);
    setRevealedP(0);
    setRevealedB(0);
    setPhase('dealing');
    try {
      const res = await fetch('/api/arcade/baccarat/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, bets }),
      });
      const data = (await res.json()) as PlayResponse;
      if (!res.ok || !data?.ok) {
        setErrorMsg(data?.error || 'Could not deal the hand.');
        setPhase('idle');
        return;
      }
      // Show interim chip balance during the reveal (post-debit, pre-payout)
      // so winning the hand isn't spoiled by the chip counter jumping up
      // before the cards finish flipping. The final balance is committed
      // when the resolution lands.
      const finalChips = Number(data.chipBalance);
      const interimChips = finalChips - data.totalPayout;
      flushSync(() => {
        setPlayerCards(data.playerCards);
        setBankerCards(data.bankerCards);
        setChips(interimChips);
        setPhase('revealing');
      });
      runRevealAnimation(data.playerCards, data.bankerCards, () => {
        setResultData(data);
        setChips(finalChips);
        setPhase('resolved');
        celebrate(data);
      });
    } catch {
      setErrorMsg('Could not reach the table. Try again.');
      setPhase('idle');
    }
  }, [info, phase, bets, totalBet, chips, initData, ensureAudio, runRevealAnimation, celebrate]);

  const startNextRound = useCallback(() => {
    setPhase('idle');
    setResultData(null);
    setPlayerCards([]);
    setBankerCards([]);
    setRevealedP(0);
    setRevealedB(0);
    setErrorMsg('');
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      if (audioRef.current) audioRef.current.master.gain.value = next ? 0 : 0.5;
      return next;
    });
  }, []);

  // --- render helpers --------------------------------------------------------

  const canBet = phase === 'idle';
  const isResolved = phase === 'resolved';
  const isAnimating = phase === 'dealing' || phase === 'revealing';

  const playerWin = isResolved && resultData?.result === 'player';
  const bankerWin = isResolved && resultData?.result === 'banker';
  const tieWin = isResolved && resultData?.result === 'tie';
  const playerPairWin = isResolved && !!resultData?.playerPair;
  const bankerPairWin = isResolved && !!resultData?.bankerPair;

  const pTot = playerCards.length ? totalOfRevealed(playerCards, revealedP) : 0;
  const bTot = bankerCards.length ? totalOfRevealed(bankerCards, revealedB) : 0;

  function renderCard(idx: number, revealed: boolean) {
    const suit = decodeSuit(idx);
    const rank = decodeRank(idx);
    return (
      <div className="bc-card-wrap">
        <div className={`bc-card ${revealed ? 'bc-flipped' : ''}`}>
          <div className="bc-cface bc-cback">
            <i />
          </div>
          <div className={`bc-cface bc-cfront ${isRedSuit(suit) ? 'bc-red' : 'bc-blk'}`}>
            <span className="bc-cidx bc-tl">
              <span className="bc-cr">{RANK_LABEL[rank]}</span>
              <span className="bc-cs">{SUIT_SYM[suit]}</span>
            </span>
            <span className="bc-cpip">{SUIT_SYM[suit]}</span>
            <span className="bc-cidx bc-br">
              <span className="bc-cr">{RANK_LABEL[rank]}</span>
              <span className="bc-cs">{SUIT_SYM[suit]}</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  function renderPlaceholderCard(key: string) {
    return (
      <div className="bc-card-wrap" key={key}>
        <div className="bc-card">
          <div className="bc-cface bc-cback">
            <i />
          </div>
        </div>
      </div>
    );
  }

  function statusMessage(): { text: string; cls: string } {
    if (errorMsg) return { text: errorMsg, cls: 'bc-loss' };
    if (phase === 'idle') {
      if (totalBet > 0) {
        return {
          text: `Total wager: ${totalBet.toLocaleString('en-US')} chips`,
          cls: '',
        };
      }
      return { text: 'Tap a bet zone, then add chips.', cls: '' };
    }
    if (isAnimating) return { text: 'Dealing…', cls: '' };
    if (!resultData) return { text: '', cls: '' };
    const net = resultData.totalPayout - resultData.totalBet;
    if (net > 0) {
      return {
        text: `${labelForResult(resultData.result)} · +${net.toLocaleString('en-US')}`,
        cls: 'bc-win',
      };
    }
    if (resultData.result === 'tie' && net === 0) {
      return { text: 'TIE · main bets returned', cls: 'bc-tieline' };
    }
    return {
      text: `${labelForResult(resultData.result)} · -${(resultData.totalBet - resultData.totalPayout).toLocaleString('en-US')}`,
      cls: 'bc-loss',
    };
  }

  const status = statusMessage();
  const focusedAmount = bets[focusedZone];

  const actionLabel = isAnimating
    ? 'Dealing…'
    : isResolved
      ? 'Deal next hand'
      : totalBet === 0
        ? 'Place a bet'
        : chips < totalBet
          ? 'Not enough chips'
          : `Deal · ${totalBet.toLocaleString('en-US')}`;
  const actionDisabled =
    phase === 'loading' ||
    isAnimating ||
    (canBet && (totalBet === 0 || chips < totalBet)) ||
    !info;

  // --- render ----------------------------------------------------------------

  return (
    <div>
      <style>{BC_CSS}</style>

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to arcade"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/5 text-cyan-400"
        >
          <IconArrowLeft size={18} aria-hidden />
        </button>
        <h1 className="mitr-bold text-xl text-white">MORBIUS Arcade</h1>
      </div>

      {phase === 'loading' && (
        <p className="mt-10 text-center text-sm text-slate-500">Loading the table…</p>
      )}

      {phase === 'load-error' && (
        <div className="mt-8 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-center">
          <p className="text-sm text-red-200/90">Could not load the game.</p>
          <button
            type="button"
            onClick={() => void loadInfo()}
            className="mt-3 rounded-lg border border-cyan-500/30 px-4 py-2 text-sm text-cyan-400"
          >
            Try again
          </button>
        </div>
      )}

      {info && phase !== 'loading' && phase !== 'load-error' && (
        <div ref={tableRef} className="bc-table p-3.5">
          <canvas ref={fxRef} className="bc-fx" />

          <div className="relative z-[2]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="mitr-bold text-lg leading-none text-white">Baccarat</div>
                <div className="mt-1 text-[9px] tracking-[0.28em] text-cyan-400">PUNTO BANCO</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="rounded-lg border border-cyan-500/25 bg-[#081320]/70 px-2 py-1 text-[10px] font-bold text-cyan-400"
                >
                  {muted ? '♪ off' : '♪ on'}
                </button>
                <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/25 bg-[#081320]/70 px-2.5 py-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-400" />
                  <span className="text-[13px] font-extrabold tabular-nums text-white">
                    {Math.round(chips).toLocaleString('en-US')}
                  </span>
                </div>
              </div>
            </div>

            {/* Felt with hands */}
            <div className="bc-felt">
              <div className="bc-hands">
                <div className="bc-hand-side">
                  <div className={`bc-hand-label ${playerWin ? 'bc-win' : ''}`}>PLAYER</div>
                  <div className="bc-hand-cards">
                    {playerCards.length === 0 ? (
                      <>
                        {renderPlaceholderCard('pp1')}
                        {renderPlaceholderCard('pp2')}
                      </>
                    ) : (
                      playerCards.map((c, i) => <div key={`p${i}`}>{renderCard(c, i < revealedP)}</div>)
                    )}
                  </div>
                  <div className={`bc-score ${playerWin ? 'bc-win' : ''}`}>{pTot}</div>
                </div>
                <div className="bc-vs">VS</div>
                <div className="bc-hand-side">
                  <div className={`bc-hand-label ${bankerWin ? 'bc-win' : ''}`}>BANKER</div>
                  <div className="bc-hand-cards">
                    {bankerCards.length === 0 ? (
                      <>
                        {renderPlaceholderCard('bp1')}
                        {renderPlaceholderCard('bp2')}
                      </>
                    ) : (
                      bankerCards.map((c, i) => <div key={`b${i}`}>{renderCard(c, i < revealedB)}</div>)
                    )}
                  </div>
                  <div className={`bc-score ${bankerWin ? 'bc-win' : ''}`}>{bTot}</div>
                </div>
              </div>
            </div>

            {/* Main bets */}
            <div className="bc-bets">
              <div
                className={`bc-bet ${focusedZone === 'player' && canBet ? 'bc-focus' : ''} ${playerWin ? 'bc-win-zone' : ''}`}
                onClick={() => canBet && focusZone('player')}
              >
                <div className="bc-bet-name">PLAYER</div>
                <div className="bc-bet-pay">
                  pays <strong>2.00×</strong>
                </div>
                <div className={`bc-bet-amount ${bets.player === 0 ? 'bc-zero' : ''}`}>
                  {bets.player > 0 ? bets.player.toLocaleString('en-US') : '—'}
                </div>
                {bets.player > 0 && <div className="bc-chip">{shortChip(bets.player)}</div>}
              </div>
              <div
                className={`bc-bet bc-tie ${focusedZone === 'tie' && canBet ? 'bc-focus' : ''} ${tieWin ? 'bc-win-zone' : ''}`}
                onClick={() => canBet && focusZone('tie')}
              >
                <div className="bc-bet-name">TIE</div>
                <div className="bc-bet-pay">
                  pays <strong>9×</strong>
                </div>
                <div className={`bc-bet-amount ${bets.tie === 0 ? 'bc-zero' : ''}`}>
                  {bets.tie > 0 ? bets.tie.toLocaleString('en-US') : '—'}
                </div>
                {bets.tie > 0 && (
                  <div className="bc-chip bc-tie-chip">{shortChip(bets.tie)}</div>
                )}
              </div>
              <div
                className={`bc-bet ${focusedZone === 'banker' && canBet ? 'bc-focus' : ''} ${bankerWin ? 'bc-win-zone' : ''}`}
                onClick={() => canBet && focusZone('banker')}
              >
                <div className="bc-bet-name">BANKER</div>
                <div className="bc-bet-pay">
                  pays <strong>1.95×</strong>
                </div>
                <div className={`bc-bet-amount ${bets.banker === 0 ? 'bc-zero' : ''}`}>
                  {bets.banker > 0 ? bets.banker.toLocaleString('en-US') : '—'}
                </div>
                {bets.banker > 0 && <div className="bc-chip">{shortChip(bets.banker)}</div>}
              </div>
            </div>

            {/* Side bets */}
            <div className="bc-sides">
              <div
                className={`bc-side ${focusedZone === 'playerPair' && canBet ? 'bc-focus' : ''} ${playerPairWin ? 'bc-win-zone' : ''}`}
                onClick={() => canBet && focusZone('playerPair')}
              >
                <div className="bc-side-name">P-PAIR</div>
                <div className="bc-side-pay">12×</div>
                <div className={`bc-side-amount ${bets.playerPair === 0 ? 'bc-zero' : ''}`}>
                  {bets.playerPair > 0 ? bets.playerPair.toLocaleString('en-US') : '—'}
                </div>
                {bets.playerPair > 0 && (
                  <div className="bc-chip bc-side-chip">{shortChip(bets.playerPair)}</div>
                )}
              </div>
              <div
                className={`bc-side ${focusedZone === 'bankerPair' && canBet ? 'bc-focus' : ''} ${bankerPairWin ? 'bc-win-zone' : ''}`}
                onClick={() => canBet && focusZone('bankerPair')}
              >
                <div className="bc-side-name">B-PAIR</div>
                <div className="bc-side-pay">12×</div>
                <div className={`bc-side-amount ${bets.bankerPair === 0 ? 'bc-zero' : ''}`}>
                  {bets.bankerPair > 0 ? bets.bankerPair.toLocaleString('en-US') : '—'}
                </div>
                {bets.bankerPair > 0 && (
                  <div className="bc-chip bc-side-chip">{shortChip(bets.bankerPair)}</div>
                )}
              </div>
            </div>

            <div className={`bc-status ${status.cls}`}>{status.text}</div>

            {/* Focused-zone adjuster */}
            <div className="bc-bet-row">
              <span className="bc-bet-label">
                <strong>{FOCUS_LABEL[focusedZone]}</strong> chips
              </span>
              <button
                type="button"
                className="bc-stp"
                disabled={!canBet}
                onClick={() => adjustBet(focusedZone, -chipStep)}
                aria-label="Lower bet"
              >
                &minus;
              </button>
              <span className="bc-bet-value">
                {focusedAmount > 0 ? focusedAmount.toLocaleString('en-US') : '0'}
              </span>
              <button
                type="button"
                className="bc-stp"
                disabled={!canBet}
                onClick={() => adjustBet(focusedZone, chipStep)}
                aria-label="Raise bet"
              >
                +
              </button>
              <button
                type="button"
                className="bc-clear"
                disabled={!canBet || totalBet === 0}
                onClick={clearBets}
              >
                CLEAR
              </button>
            </div>

            {/* Chip-size selector */}
            <div className="bc-chip-row">
              {CHIP_SIZES.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`bc-chip-btn ${chipStep === v ? 'bc-chip-active' : ''}`}
                  disabled={!canBet}
                  onClick={() => setChipStep(v)}
                >
                  {v >= 1000 ? `${v / 1000}k` : v}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="bc-deal-btn"
              disabled={actionDisabled}
              onClick={() => {
                if (isResolved) startNextRound();
                else void onDeal();
              }}
            >
              {actionLabel}
            </button>
          </div>

          <div ref={bannerRef} className="bc-banner">
            <div className="bc-bt">{resultData ? labelForResult(resultData.result) : ''}</div>
            <div className="bc-bp">
              {resultData
                ? resultData.totalPayout > resultData.totalBet
                  ? `+${(resultData.totalPayout - resultData.totalBet).toLocaleString('en-US')} chips`
                  : resultData.result === 'tie' && resultData.totalPayout === resultData.totalBet
                    ? 'Wager returned'
                    : `-${(resultData.totalBet - resultData.totalPayout).toLocaleString('en-US')} chips`
                : ''}
            </div>
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-[11px] text-slate-600">
        Provably fair · every hand verifiable at /api/arcade/baccarat/verify
      </p>
    </div>
  );
}
