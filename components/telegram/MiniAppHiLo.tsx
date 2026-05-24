'use client';

/**
 * MiniAppHiLo — MORBIUS Arcade: Hi-Lo (provably-fair card game).
 *
 * The polished game screen for the Telegram Mini App. Wired to the
 * provably-fair backend:
 *   GET  /api/arcade/hilo/info         — bet bounds + house edge + max picks
 *   POST /api/arcade/hilo/state        — resume an active round on mount
 *   POST /api/arcade/hilo/start        — debit bet, seed round, deal base card
 *   POST /api/arcade/hilo/pick         — reveal next card; win bumps multiplier
 *   POST /api/arcade/hilo/cashout      — bank the current multiplier
 *   GET  /api/arcade/hilo/verify/:id   — public verifier payload
 *
 * The card flip + multiplier roll-up + win burst are driven imperatively via
 * refs (React owns the data, refs own motion) so timing never fights the
 * render cycle — same shape and conventions as MiniAppVideoPoker.tsx and
 * MiniAppLimbo.tsx.
 *
 * Card encoding: index 0..51, rank = (idx % 13) + 1 (Aces low, so A=1, K=13),
 * suit = floor(idx / 13) — 0=♥ 1=♦ 2=♣ 3=♠. The same convention the server
 * and the verifier page use.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconArrowLeft, IconArrowUp, IconArrowDown, IconCoin } from '@tabler/icons-react';

// ---------------------------------------------------------------------------

interface HiLoInfo {
  minBet: number;
  maxBet: number;
  maxPicks: number;
  houseEdgeBp: number;
}

interface Card {
  index: number;
  rank: number;
  suit: number;
}

type Direction = 'hi' | 'lo';
type Phase = 'loading' | 'load-error' | 'idle' | 'picking' | 'revealing' | 'active' | 'finalizing' | 'busted' | 'cashed';

interface MiniAppHiLoProps {
  initData: string;
  initialChipBalance: string;
  onBack: () => void;
}

const SUIT_SYM = ['♥', '♦', '♣', '♠'];
const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function isRedSuit(suit: number): boolean {
  return suit === 0 || suit === 1;
}

const HL_CSS = `
.hl-table{position:relative;border-radius:20px;overflow:hidden;
 background:radial-gradient(ellipse 80% 72% at 50% 28%,rgba(6,182,212,0.17),transparent 62%),linear-gradient(180deg,#0c1c30,#081320);
 border:1px solid rgba(6,182,212,0.30);box-shadow:inset 0 0 30px rgba(6,182,212,0.10);}
.hl-fx{position:absolute;inset:0;pointer-events:none;z-index:7;}
.hl-glass{background:#0b1a2c;border:1px solid rgba(34,211,238,0.14);}
.hl-stp{width:32px;height:32px;border-radius:9px;border:1px solid rgba(6,182,212,0.30);background:rgba(34,211,238,0.06);
 color:#22d3ee;font-size:18px;cursor:pointer;}
.hl-stp:disabled{opacity:0.3;cursor:default;}
.hl-quick{padding:5px 10px;border-radius:8px;border:1px solid rgba(6,182,212,0.25);background:rgba(34,211,238,0.05);
 color:#9be8f4;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;font-variant-numeric:tabular-nums;}
.hl-quick:hover:not(:disabled){background:rgba(34,211,238,0.12);border-color:rgba(34,211,238,0.45);}
.hl-quick:disabled{opacity:0.4;cursor:default;}
.hl-multi{font-size:30px;font-weight:900;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;color:#eafbff;
 text-shadow:0 0 20px rgba(34,211,238,0.55);transition:color .2s,text-shadow .2s;}
.hl-multi.hl-up{color:#22d3ee;text-shadow:0 0 26px rgba(34,211,238,0.95);animation:hlPop .55s cubic-bezier(.34,1.5,.5,1);}
.hl-multi.hl-down{color:#fca5a5;text-shadow:0 0 16px rgba(239,68,68,0.55);}
@keyframes hlPop{0%{transform:scale(0.86);}55%{transform:scale(1.12);}100%{transform:scale(1);}}
.hl-stage{position:relative;display:flex;align-items:center;justify-content:center;gap:8px;
 padding:18px 6px 14px;min-height:160px;perspective:900px;}
.hl-card-slot{position:relative;width:96px;height:136px;}
.hl-card{position:absolute;inset:0;border-radius:12px;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.45,.05,.25,1);}
.hl-card.hl-flip{transform:rotateY(180deg);}
.hl-cface{position:absolute;inset:0;border-radius:12px;backface-visibility:hidden;-webkit-backface-visibility:hidden;
 box-shadow:0 7px 18px rgba(0,0,0,0.6);}
.hl-cback{background:radial-gradient(circle,rgba(34,211,238,0.18) 1px,transparent 1.6px) 0 0/9px 9px,linear-gradient(155deg,#16324f,#0a1626);
 border:1px solid rgba(34,211,238,0.40);display:flex;align-items:center;justify-content:center;}
.hl-cback i{width:34px;height:34px;border:1.5px solid rgba(34,211,238,0.6);border-radius:6px;transform:rotate(45deg);
 display:flex;align-items:center;justify-content:center;}
.hl-cback i::after{content:"";width:14px;height:14px;background:#22d3ee;border-radius:3px;}
.hl-cfront{transform:rotateY(180deg);background:linear-gradient(162deg,#ffffff,#dde6f1);border:1px solid rgba(0,0,0,0.18);
 display:flex;align-items:center;justify-content:center;position:relative;}
.hl-cfront.hl-red{color:#e5384f;}
.hl-cfront.hl-blk{color:#1b2436;}
.hl-cidx{position:absolute;display:flex;flex-direction:column;align-items:center;line-height:0.92;font-weight:800;}
.hl-cidx .hl-r{font-size:18px;}
.hl-cidx .hl-s{font-size:13px;}
.hl-ctl{top:7px;left:8px;}
.hl-cbr{bottom:7px;right:8px;transform:rotate(180deg);}
.hl-cpip{font-size:52px;}
.hl-card.hl-glow-win .hl-cfront{box-shadow:0 0 22px rgba(34,211,238,0.7),0 7px 18px rgba(0,0,0,0.6);}
.hl-card.hl-glow-lose .hl-cfront{box-shadow:0 0 22px rgba(239,68,68,0.65),0 7px 18px rgba(0,0,0,0.6);}
.hl-chain{display:flex;flex-direction:column;gap:6px;align-items:center;}
.hl-chip{width:32px;height:46px;border-radius:5px;display:flex;align-items:center;justify-content:center;
 background:linear-gradient(162deg,#ffffff,#dde6f1);border:1px solid rgba(0,0,0,0.18);
 box-shadow:0 2px 6px rgba(0,0,0,0.4);font-weight:800;font-size:10px;line-height:1;text-align:center;}
.hl-chip.hl-red{color:#e5384f;}
.hl-chip.hl-blk{color:#1b2436;}
.hl-chip .hl-csm{font-size:9px;margin-top:1px;}
.hl-dir-btn{flex:1;border:none;border-radius:13px;padding:13px 10px;font-size:13px;font-weight:800;letter-spacing:0.04em;
 cursor:pointer;color:#ffffff;background:linear-gradient(135deg,#0891b2,#2563eb);
 box-shadow:0 8px 26px -8px rgba(6,182,212,0.55),0 0 0 1px rgba(34,211,238,0.20);
 transition:filter .15s,transform .1s;display:flex;flex-direction:column;align-items:center;gap:4px;}
.hl-dir-btn:not(:disabled):active{transform:scale(0.98);}
.hl-dir-btn:disabled{opacity:0.4;cursor:default;box-shadow:none;background:#1a2942;}
.hl-dir-pays{font-size:11px;font-weight:700;color:#dff6fb;font-variant-numeric:tabular-nums;letter-spacing:0;}
.hl-dir-pays.hl-dim{color:#94a3b8;}
.hl-dir-row{display:flex;align-items:center;gap:6px;}
.hl-cashout{width:100%;border:none;border-radius:13px;padding:14px;font-size:15px;font-weight:800;letter-spacing:0.04em;
 cursor:pointer;color:#04222a;background:linear-gradient(135deg,#fde68a,#fbbf24);
 box-shadow:0 8px 24px -8px rgba(245,191,36,0.55),0 0 0 1px rgba(245,191,36,0.30);
 transition:filter .15s,transform .1s;}
.hl-cashout:not(:disabled):active{transform:scale(0.98);}
.hl-cashout:disabled{opacity:0.45;cursor:default;box-shadow:none;}
.hl-start{width:100%;border:none;border-radius:13px;padding:14px;font-size:16px;font-weight:800;letter-spacing:0.04em;
 cursor:pointer;color:#ffffff;background:linear-gradient(135deg,#0891b2,#2563eb);
 box-shadow:0 8px 26px -8px rgba(6,182,212,0.55),0 0 0 1px rgba(34,211,238,0.20);
 transition:filter .15s,transform .1s;}
.hl-start:not(:disabled):active{transform:scale(0.98);}
.hl-start:disabled{opacity:0.45;cursor:default;box-shadow:none;}
.hl-meta{display:flex;justify-content:space-between;padding:4px 0;font-size:11px;color:#94a3b8;}
.hl-meta .hl-mv{color:#eafbff;font-variant-numeric:tabular-nums;font-weight:700;}
.hl-tag{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;
 border:1px solid rgba(34,211,238,0.35);background:rgba(34,211,238,0.10);font-size:10px;font-weight:800;letter-spacing:0.16em;color:#22d3ee;text-transform:uppercase;}
.hl-tag.hl-win{border-color:rgba(34,211,238,0.65);background:linear-gradient(135deg,rgba(34,211,238,0.28),rgba(6,182,212,0.32));color:#04222a;}
.hl-tag.hl-lose{border-color:rgba(239,68,68,0.45);background:rgba(239,68,68,0.15);color:#fca5a5;}
.hl-tag.hl-bank{border-color:rgba(251,191,36,0.6);background:linear-gradient(135deg,rgba(253,230,138,0.45),rgba(251,191,36,0.40));color:#3a2200;}
`;

// ---------------------------------------------------------------------------

function CardFace({ card }: { card: Card }) {
  const red = isRedSuit(card.suit);
  return (
    <>
      <div className={`hl-cidx hl-ctl`}>
        <span className="hl-r">{RANK_LABEL[card.rank]}</span>
        <span className="hl-s">{SUIT_SYM[card.suit]}</span>
      </div>
      <span className="hl-cpip">{SUIT_SYM[card.suit]}</span>
      <div className={`hl-cidx hl-cbr`}>
        <span className="hl-r">{RANK_LABEL[card.rank]}</span>
        <span className="hl-s">{SUIT_SYM[card.suit]}</span>
      </div>
      {/* tint class is applied on parent .hl-cfront */}
      <span className="sr-only">
        {RANK_LABEL[card.rank]} of {['hearts', 'diamonds', 'clubs', 'spades'][card.suit]}
        {red ? ' (red)' : ' (black)'}
      </span>
    </>
  );
}

function MiniCard({ card }: { card: Card }) {
  const red = isRedSuit(card.suit);
  return (
    <div className={`hl-chip ${red ? 'hl-red' : 'hl-blk'}`} aria-hidden>
      <div>
        <div>{RANK_LABEL[card.rank]}</div>
        <div className="hl-csm">{SUIT_SYM[card.suit]}</div>
      </div>
    </div>
  );
}

function formatMultiplierX100(x100: number): string {
  return `${(x100 / 100).toFixed(2)}x`;
}

// Compute payout per direction for the next pick given the current card.
// Mirrors arcade-hilo.ts: factor = 13 * (10000 - h) / (10000 * denom), then
// new = floor(old * factor / 1) using integer arithmetic that matches the
// server's `advanceHiLoMultiplier`.
function predictNextX100(
  currentX100: number,
  prevRank: number,
  direction: Direction,
  houseEdgeBp: number,
): { possible: boolean; nextX100: number; winChance: number } {
  const denom = direction === 'hi' ? 14 - prevRank : prevRank - 1;
  if (denom <= 0) return { possible: false, nextX100: 0, winChance: 0 };
  const houseNum = 10_000 - houseEdgeBp;
  const next = Math.max(
    100,
    Math.floor((currentX100 * 13 * houseNum) / (10_000 * denom)),
  );
  return { possible: true, nextX100: next, winChance: denom / 13 };
}

// ---------------------------------------------------------------------------

export default function MiniAppHiLo({
  initData,
  initialChipBalance,
  onBack,
}: MiniAppHiLoProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [info, setInfo] = useState<HiLoInfo | null>(null);
  const [chips, setChips] = useState<number>(() => {
    const n = Number(initialChipBalance);
    return Number.isFinite(n) ? n : 0;
  });
  const [bet, setBet] = useState(100);

  // Round state.
  const [roundId, setRoundId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]); // base + revealed picks
  const [picks, setPicks] = useState<Direction[]>([]);
  const [multX100, setMultX100] = useState(100);
  // The just-revealed card, animated via a face-down → flip when the pick lands.
  const [pendingCard, setPendingCard] = useState<Card | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [lastWon, setLastWon] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [muted, setMuted] = useState(false);

  const fxRef = useRef<HTMLCanvasElement | null>(null);
  const tableRef = useRef<HTMLDivElement | null>(null);
  const timers = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; master: GainNode } | null>(null);
  const mutedRef = useRef(false);

  const after = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  }, []);

  // --- sound -----------------------------------------------------------------

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
      tone(640, t0, 0.05, 'square', 0.05);
      tone(880, t0 + 0.04, 0.05, 'square', 0.05);
    } else if (kind === 'win') {
      [523, 659, 784].forEach((f, i) => tone(f, t0 + i * 0.08, 0.28, 'triangle', 0.15));
    } else if (kind === 'bigwin') {
      [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) =>
        tone(f, t0 + i * 0.085, 0.4, 'triangle', 0.18),
      );
      noise(t0, 0.5, 0.1, 5000);
    } else if (kind === 'lose') {
      tone(233, t0, 0.16, 'sine', 0.1);
      tone(175, t0 + 0.09, 0.2, 'sine', 0.08);
    } else if (kind === 'pick') {
      tone(620, t0, 0.06, 'triangle', 0.08);
    } else if (kind === 'cash') {
      [880, 1320, 1760].forEach((f, i) => tone(f, t0 + i * 0.07, 0.32, 'triangle', 0.17));
    }
  }, []);

  // --- particles -------------------------------------------------------------

  const burst = useCallback((count: number, palette: 'cyan' | 'gold') => {
    const cv = fxRef.current;
    const table = tableRef.current;
    if (!cv || !table) return;
    cv.width = table.clientWidth;
    cv.height = table.clientHeight;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    type P = { x: number; y: number; vx: number; vy: number; r: number; life: number; rot: number; vr: number; c: string };
    const parts: P[] = [];
    const cx = cv.width / 2;
    const cy = cv.height * 0.4;
    const colors = palette === 'gold' ? ['#fbbf24', '#fde68a'] : ['#22d3ee', '#a5f3fc'];
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
        c: colors[Math.random() < 0.5 ? 0 : 1]!,
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

  // --- load info + resume an active round -----------------------------------

  const loadInfo = useCallback(async () => {
    setPhase('loading');
    try {
      const res = await fetch('/api/arcade/hilo/info');
      const data = (await res.json()) as HiLoInfo & { ok?: boolean };
      if (!res.ok || !data?.ok) {
        setPhase('load-error');
        return;
      }
      setInfo(data);
      setBet((b) => Math.min(data.maxBet, Math.max(data.minBet, b)));

      // Resume an active round if one exists for this wallet.
      try {
        const sres = await fetch('/api/arcade/hilo/state', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
        });
        const sdata = await sres.json();
        if (sres.ok && sdata?.ok && sdata.active) {
          const a = sdata.active as {
            roundId: string;
            bet: number;
            cards: Card[];
            picks: Direction[];
            multiplierX100: number;
          };
          setRoundId(a.roundId);
          setCards(a.cards);
          setPicks(a.picks);
          setMultX100(a.multiplierX100);
          setBet(a.bet);
          setPhase('active');
          return;
        }
      } catch {
        /* if state lookup fails, fall through to idle */
      }
      setPhase('idle');
    } catch {
      setPhase('load-error');
    }
  }, [initData]);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  // Cleanup timers + audio on unmount.
  useEffect(() => {
    const timersList = timers.current;
    return () => {
      timersList.forEach((id) => window.clearTimeout(id));
      audioRef.current?.ctx.close().catch(() => {});
    };
  }, []);

  // --- actions ---------------------------------------------------------------

  const onStart = useCallback(async () => {
    if (!info || phase === 'finalizing' || phase === 'picking' || phase === 'revealing') return;
    if (chips < bet) return;
    ensureAudio();
    setErrorMsg('');
    setLastWon(null);
    setPhase('picking');
    try {
      const res = await fetch('/api/arcade/hilo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, bet }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setErrorMsg(data?.error || 'Could not start the round.');
        setPhase('idle');
        return;
      }
      setRoundId(data.roundId);
      setCards(data.cards as Card[]);
      setPicks([]);
      setMultX100(100);
      if (data.chipBalance != null) setChips(Number(data.chipBalance));
      snd('pick');
      setPhase('active');
    } catch {
      setErrorMsg('Could not reach the table. Try again.');
      setPhase('idle');
    }
  }, [info, phase, chips, bet, initData, ensureAudio, snd]);

  const onPick = useCallback(
    async (direction: Direction) => {
      if (!info || !roundId || phase !== 'active') return;
      ensureAudio();
      setErrorMsg('');
      setPhase('picking');
      setPendingCard(null);
      setFlipped(false);
      snd('pick');
      try {
        const res = await fetch('/api/arcade/hilo/pick', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData, roundId, direction }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          setErrorMsg(data?.error || 'Could not resolve the pick.');
          setPhase('active');
          return;
        }
        const revealed = data.card as Card;
        const won = data.safe === true;
        setPendingCard(revealed);
        setPhase('revealing');
        // Slight pause showing the face-down card before flipping.
        after(() => {
          snd('flip');
          setFlipped(true);
        }, 220);
        // After the flip resolves, settle the round state on screen.
        after(() => {
          setLastWon(won);
          if (won) {
            setMultX100(data.multiplierX100 as number);
            setCards(data.cards as Card[]);
            setPicks(data.picks as Direction[]);
            // Pop a small cyan burst on a win; bigger gold burst on a chain-pop.
            const chainLen = (data.picks as Direction[]).length;
            if (chainLen >= 5) {
              snd('bigwin');
              burst(50, 'gold');
            } else {
              snd('win');
              burst(28, 'cyan');
            }
            // Card is settled — slide it into the base position for the next pick.
            after(() => {
              setPendingCard(null);
              setFlipped(false);
              setPhase('active');
            }, 700);
          } else {
            // Bust — reveal stays; round is finalized server-side.
            setCards(data.cards as Card[]);
            setPicks(data.picks as Direction[]);
            snd('lose');
            setPhase('busted');
          }
        }, 800);
      } catch {
        setErrorMsg('Could not reach the table. Try again.');
        setPhase('active');
      }
    },
    [info, roundId, phase, initData, ensureAudio, snd, after, burst],
  );

  const onCashout = useCallback(async () => {
    if (!info || !roundId || phase !== 'active') return;
    if (picks.length === 0) return;
    ensureAudio();
    setErrorMsg('');
    setPhase('finalizing');
    try {
      const res = await fetch('/api/arcade/hilo/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, roundId }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        setErrorMsg(data?.error || 'Could not cash out the round.');
        setPhase('active');
        return;
      }
      if (data.chipBalance != null) setChips(Number(data.chipBalance));
      setMultX100(data.multiplierX100 as number);
      snd('cash');
      // Gold burst scaled by how big the win was.
      const payout = Number(data.payout);
      burst(payout >= bet * 10 ? 70 : 40, 'gold');
      setPhase('cashed');
    } catch {
      setErrorMsg('Could not reach the table. Try again.');
      setPhase('active');
    }
  }, [info, roundId, phase, picks.length, initData, ensureAudio, snd, burst, bet]);

  const onPlayAgain = useCallback(() => {
    setRoundId(null);
    setCards([]);
    setPicks([]);
    setMultX100(100);
    setPendingCard(null);
    setFlipped(false);
    setLastWon(null);
    setErrorMsg('');
    setPhase('idle');
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      mutedRef.current = next;
      if (audioRef.current) audioRef.current.master.gain.value = next ? 0 : 0.5;
      return next;
    });
  }, []);

  // --- derived render values -------------------------------------------------

  const currentCard: Card | null = cards.length > 0 ? cards[cards.length - 1]! : null;
  const prevRank = currentCard?.rank ?? 0;
  const showStage = phase !== 'idle' && phase !== 'loading' && phase !== 'load-error';

  const hi = currentCard && info
    ? predictNextX100(multX100, prevRank, 'hi', info.houseEdgeBp)
    : null;
  const lo = currentCard && info
    ? predictNextX100(multX100, prevRank, 'lo', info.houseEdgeBp)
    : null;

  const canPick = phase === 'active' && picks.length < (info?.maxPicks ?? 0);
  const canCashout = phase === 'active' && picks.length > 0;
  const cashoutAmount = Math.floor((bet * multX100) / 100);
  const profit = cashoutAmount - bet;

  const multState =
    phase === 'revealing' && lastWon === false
      ? 'hl-down'
      : lastWon === true
        ? 'hl-up'
        : '';

  // Per-direction button labels. When the chosen direction is impossible (Ace +
  // lo or King + hi), disable the button and show "— pick the other side".
  const hiLabel =
    hi && !hi.possible
      ? 'Not possible'
      : hi
        ? `Pays ${formatMultiplierX100(hi.nextX100)}`
        : '';
  const loLabel =
    lo && !lo.possible
      ? 'Not possible'
      : lo
        ? `Pays ${formatMultiplierX100(lo.nextX100)}`
        : '';

  // Display the previous-cards chain (up to 6) as small face-up chips so the
  // player can see how long their streak is at a glance.
  const chain = cards.slice(0, Math.max(0, cards.length - 1)).slice(-6);

  return (
    <div>
      <style>{HL_CSS}</style>

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to hub"
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
        <div ref={tableRef} className="hl-table p-3.5">
          <canvas ref={fxRef} className="hl-fx" />

          <div className="relative z-[2]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="mitr-bold text-lg leading-none text-white">Hi-Lo</div>
                <div className="mt-1 text-[9px] tracking-[0.28em] text-cyan-400">
                  GUESS HIGHER OR LOWER
                </div>
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

            {/* Multiplier + streak readout */}
            {showStage && (
              <div className="hl-glass mb-3 rounded-2xl p-3 text-center">
                <div className="text-[9.5px] font-bold uppercase tracking-[0.22em] text-cyan-400">
                  Multiplier
                </div>
                <div className={`hl-multi mt-1 ${multState}`}>
                  {formatMultiplierX100(multX100)}
                </div>
                <div className="mt-1.5 flex items-center justify-center gap-1.5 text-[10px] text-slate-400">
                  <span>
                    Streak{' '}
                    <span className="mitr-bold text-white tabular-nums">{picks.length}</span>
                    {' / '}
                    {info.maxPicks}
                  </span>
                  <span aria-hidden>·</span>
                  <span>
                    Bet <span className="mitr-bold text-white tabular-nums">{bet.toLocaleString('en-US')}</span>
                  </span>
                </div>
              </div>
            )}

            {/* Card stage: small chain of previous cards + current + (pending reveal) */}
            {showStage && currentCard && (
              <div className="hl-stage">
                {chain.length > 0 && (
                  <div className="hl-chain pr-1">
                    {chain.map((c, i) => (
                      <MiniCard key={`${c.index}-${i}`} card={c} />
                    ))}
                  </div>
                )}
                <div className="hl-card-slot">
                  <div className="hl-card">
                    <div
                      className={`hl-cface hl-cfront ${isRedSuit(currentCard.suit) ? 'hl-red' : 'hl-blk'}`}
                    >
                      <CardFace card={currentCard} />
                    </div>
                  </div>
                </div>
                {/* Pending reveal card — appears face-down then flips. */}
                {(phase === 'revealing' || phase === 'picking') && (
                  <div className="hl-card-slot">
                    <div
                      className={`hl-card ${flipped ? 'hl-flip' : ''} ${
                        flipped && lastWon === true ? 'hl-glow-win' : ''
                      } ${flipped && lastWon === false ? 'hl-glow-lose' : ''}`}
                    >
                      <div className="hl-cface hl-cback">
                        <i aria-hidden />
                      </div>
                      {pendingCard && (
                        <div
                          className={`hl-cface hl-cfront ${
                            isRedSuit(pendingCard.suit) ? 'hl-red' : 'hl-blk'
                          }`}
                        >
                          <CardFace card={pendingCard} />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Status / outcome line */}
            <div className="mb-3 min-h-[18px] text-center text-xs text-slate-400">
              {errorMsg
                ? errorMsg
                : phase === 'idle'
                  ? 'Place your bet to deal.'
                  : phase === 'picking'
                    ? 'Dealing…'
                    : phase === 'revealing'
                      ? lastWon === true
                        ? 'You called it!'
                        : lastWon === false
                          ? 'Wrong side — bust.'
                          : 'Flipping…'
                      : phase === 'active'
                        ? picks.length === 0
                          ? 'Pick higher or lower for the next card.'
                          : `Streak of ${picks.length} — keep going or cash out.`
                        : phase === 'busted'
                          ? `Busted at ${formatMultiplierX100(multX100)} — better luck next round.`
                          : phase === 'cashed'
                            ? `Banked +${profit.toLocaleString('en-US')} chips at ${formatMultiplierX100(multX100)}.`
                            : phase === 'finalizing'
                              ? 'Banking your winnings…'
                              : ''}
            </div>

            {/* Active round: direction buttons + cashout. */}
            {phase === 'active' && currentCard && hi && lo && (
              <>
                <div className="hl-dir-row mb-2.5">
                  <button
                    type="button"
                    className="hl-dir-btn"
                    disabled={!canPick || !hi.possible}
                    onClick={() => void onPick('hi')}
                  >
                    <span className="flex items-center gap-1">
                      <IconArrowUp size={15} aria-hidden />
                      Higher
                    </span>
                    <span className={`hl-dir-pays ${hi.possible ? '' : 'hl-dim'}`}>
                      {hiLabel}
                    </span>
                    {hi.possible && (
                      <span className="hl-dir-pays hl-dim">
                        {(hi.winChance * 100).toFixed(1)}%
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    className="hl-dir-btn"
                    disabled={!canPick || !lo.possible}
                    onClick={() => void onPick('lo')}
                  >
                    <span className="flex items-center gap-1">
                      <IconArrowDown size={15} aria-hidden />
                      Lower
                    </span>
                    <span className={`hl-dir-pays ${lo.possible ? '' : 'hl-dim'}`}>
                      {loLabel}
                    </span>
                    {lo.possible && (
                      <span className="hl-dir-pays hl-dim">
                        {(lo.winChance * 100).toFixed(1)}%
                      </span>
                    )}
                  </button>
                </div>
                <button
                  type="button"
                  className="hl-cashout"
                  disabled={!canCashout}
                  onClick={() => void onCashout()}
                >
                  <span className="inline-flex items-center justify-center gap-2">
                    <IconCoin size={16} aria-hidden />
                    {picks.length === 0
                      ? 'Make a pick to cash out'
                      : `Cash out ${cashoutAmount.toLocaleString('en-US')} chips (+${profit.toLocaleString('en-US')})`}
                  </span>
                </button>
              </>
            )}

            {/* Picking / revealing: lock the buttons in a placeholder shape. */}
            {(phase === 'picking' || phase === 'revealing' || phase === 'finalizing') && (
              <div className="mb-2.5 grid grid-cols-2 gap-2.5">
                <div className="hl-dir-btn opacity-60">Higher</div>
                <div className="hl-dir-btn opacity-60">Lower</div>
              </div>
            )}

            {/* Resolved (cashed or busted): summary tag + Play Again. */}
            {(phase === 'busted' || phase === 'cashed') && (
              <div className="flex flex-col items-center gap-3">
                <span
                  className={`hl-tag ${phase === 'cashed' ? 'hl-bank' : 'hl-lose'}`}
                  aria-live="polite"
                >
                  {phase === 'cashed'
                    ? `+${profit.toLocaleString('en-US')} chips`
                    : `−${bet.toLocaleString('en-US')} chips`}
                </span>
                <button
                  type="button"
                  className="hl-start"
                  onClick={onPlayAgain}
                >
                  Play again
                </button>
              </div>
            )}

            {/* Idle: bet stepper + start button. */}
            {phase === 'idle' && (
              <>
                <div className="hl-glass mt-2 mb-3 rounded-xl p-2.5">
                  <div className="hl-meta">
                    <span>House edge</span>
                    <span className="hl-mv">{(info.houseEdgeBp / 100).toFixed(2)}%</span>
                  </div>
                  <div className="hl-meta">
                    <span>Max picks</span>
                    <span className="hl-mv">{info.maxPicks}</span>
                  </div>
                </div>
                <div className="mb-2.5 flex items-center gap-2.5">
                  <span className="flex-1 text-[11px] text-slate-500">Bet</span>
                  <button
                    type="button"
                    className="hl-stp"
                    onClick={() => setBet((b) => Math.max(info.minBet, b - 50))}
                    aria-label="Lower bet"
                  >
                    &minus;
                  </button>
                  <span className="min-w-[58px] text-center text-[15px] font-extrabold tabular-nums text-cyan-400">
                    {bet.toLocaleString('en-US')}
                  </span>
                  <button
                    type="button"
                    className="hl-stp"
                    onClick={() => setBet((b) => Math.min(info.maxBet, b + 50))}
                    aria-label="Raise bet"
                  >
                    +
                  </button>
                </div>
                <div className="mb-3 flex flex-wrap justify-center gap-1.5">
                  {[50, 100, 250, 500, 1000].map((q) => (
                    <button
                      key={q}
                      type="button"
                      className="hl-quick"
                      onClick={() => setBet(Math.min(info.maxBet, Math.max(info.minBet, q)))}
                    >
                      {q.toLocaleString('en-US')}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="hl-start"
                  disabled={chips < bet}
                  onClick={() => void onStart()}
                >
                  {chips < bet ? 'Not enough chips' : 'Deal'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <p className="mt-3 text-center text-[11px] text-slate-600">
        {(phase === 'busted' || phase === 'cashed') && roundId ? (
          <>
            Provably fair ·{' '}
            <a
              href={`/tg/verify/hilo/${roundId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 underline-offset-2 hover:underline"
            >
              verify this round ↗
            </a>
          </>
        ) : (
          <>Provably fair · every round verifiable at /tg/verify/hilo/[roundId]</>
        )}
      </p>
    </div>
  );
}
