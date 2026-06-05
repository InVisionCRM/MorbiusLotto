'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import type { PokerTableState } from '@/lib/websocket-client';
import type { PreActionOption } from '@/components/poker/PokerActions';
import { formatChips } from '@/lib/format-poker-chips';
import { toBigIntSafe } from '@/lib/safe-bigint';
import {
  buildLiveSteps, replayStateAt, deriveMini, cardFace, streetTag,
  type ReplayStep, type ReplayHandSummary,
} from '@/lib/poker-replay';
import type { DockStatsData, DockTableInfo } from '@/lib/poker-session-stats';

interface PortraitDockTournament {
  blinds?: string | null;
  levelCountdown?: string | null;
  rank?: number | string | null;
  playersLeft?: number | null;
}

/** Past-hand replay data (real in page.tsx via the verify endpoint, mocked in the dev preview). */
export interface ReplayProps {
  hands: ReplayHandSummary[];
  /** null = the current/live hand (built from recentActions). */
  activeHandId: string | null;
  /** Steps for the active PAST hand (null when live or still loading). */
  steps: ReplayStep[] | null;
  loading: boolean;
  onPick: (handId: string | null) => void;
}

interface PokerBottomBarProps {
  fullscreen?: boolean;
  mobileLandscape?: boolean;
  portrait?: boolean;
  tournament?: PortraitDockTournament | null;
  quickChatPhrases?: string[];
  onPhraseReaction?: (phrase: string) => void;
  preAction?: PreActionOption;
  onPreActionChange?: (v: PreActionOption) => void;
  onOpenActivity?: () => void;
  replay?: ReplayProps;
  stats?: DockStatsData;
  tableInfo?: DockTableInfo;
  renderedState: PokerTableState | null;
  mySeat: PokerTableState['seats'][number] | null;
  actions: React.ReactNode;
  /** Hide the dock entirely (e.g. the showdown dock takes over during a showdown). */
  suppressed?: boolean;
}

const POKER_TURN_SECONDS = 30;
const DOCK_EMOTES = ['😎', '🔥', '👏', '😂'];
const PRE_ACTIONS: { v: Exclude<PreActionOption, null>; label: string }[] = [
  { v: 'check_fold', label: 'Check / Fold' },
  { v: 'check', label: 'Check' },
  { v: 'call_any', label: 'Call Any' },
];

type RAction = { position: number; action: string; amount: string; street?: string };

function actionLine(state: PokerTableState | null, a: RAction) {
  const nm = state?.seats?.[a.position]?.displayName || `Seat ${a.position + 1}`;
  const amt = a.amount && a.amount !== '0' ? ` ${Number(a.amount).toLocaleString()}` : '';
  return `${nm} ${a.action}${amt}`;
}

/** Drains over the 30s turn clock. Ticks 4×/s only while a turn is live. */
function useTurnTimer(turnStartedAt: string | null) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!turnStartedAt) { setNow(0); return; }
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [turnStartedAt]);
  if (!turnStartedAt || now <= 0) return { pct: 0, remaining: 0, active: false };
  const elapsed = (now - new Date(turnStartedAt).getTime()) / 1000;
  const remaining = Math.max(0, POKER_TURN_SECONDS - elapsed);
  return { pct: Math.max(0, Math.min(1, remaining / POKER_TURN_SECONDS)), remaining, active: true };
}

/** The player's turn countdown rendered as the dock's draining TOP BORDER (cyan → red when urgent).
 *  Owns its own 4×/s ticker so only this thin strip re-renders, not the whole dock. */
function DockTurnTimerBorder({ turnStartedAt }: { turnStartedAt: string | null }) {
  const { pct, remaining, active } = useTurnTimer(turnStartedAt);
  if (!active) return null;
  const urgent = remaining <= 6;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-[3px] overflow-hidden">
      <div
        className="h-full"
        style={{
          width: `${pct * 100}%`,
          background: urgent ? 'linear-gradient(90deg,#f87171,#dc2626)' : 'linear-gradient(90deg,rgba(255,255,255,0.9),rgba(255,255,255,0.55))',
          boxShadow: urgent ? '0 0 8px rgba(248,113,113,0.85)' : '0 0 8px rgba(255,255,255,0.45)',
          transition: 'width 0.25s linear',
        }}
      />
    </div>
  );
}

/** "It's Your Turn" ↔ "Click To Play" pill that overhangs the dock's top edge (50/50), softly
 *  glowing + breathing (CSS `.poker-turn-pill`). Tapping it reveals the betting controls. */
function YourTurnPill({ onClick }: { onClick: () => void }) {
  const [alt, setAlt] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setAlt((a) => !a), 1700);
    return () => clearInterval(id);
  }, []);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="It's your turn — tap to open the betting controls"
      className="poker-turn-pill absolute left-1/2 top-0 z-40"
    >
      <span className="relative block text-center" style={{ minWidth: 104 }}>
        <span className="block transition-opacity duration-300" style={{ opacity: alt ? 0 : 1 }}>It&apos;s Your Turn</span>
        <span className="absolute inset-0 block transition-opacity duration-300" style={{ opacity: alt ? 1 : 0 }}>Click To Play</span>
      </span>
    </button>
  );
}

function ActorAvatar({ name, pct, urgent, active }: { name: string | null; pct: number; urgent: boolean; active: boolean }) {
  const R = 19;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative h-11 w-11 flex-shrink-0">
      <svg className="absolute inset-0" viewBox="0 0 44 44" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="22" cy="22" r={R} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth="2.5" />
        {active && (
          <circle
            cx="22" cy="22" r={R} fill="none"
            stroke={urgent ? '#f87171' : 'rgba(255,255,255,0.85)'} strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray={C} strokeDashoffset={C * (1 - pct)}
            style={{ transition: 'stroke-dashoffset 0.25s linear' }}
          />
        )}
      </svg>
      <div
        className="absolute inset-[5px] flex items-center justify-center rounded-full text-[15px] font-bold"
        style={{
          background: 'radial-gradient(circle at 50% 30%, #2a3344, #141a24)',
          color: '#dbe7f3',
          boxShadow: active && !urgent ? '0 0 10px rgba(255,255,255,0.25)' : undefined,
        }}
      >
        {(name?.[0] ?? '·').toUpperCase()}
      </div>
    </div>
  );
}

function EmoteRow({ onEmote }: { onEmote?: (e: string) => void }) {
  if (!onEmote) return null;
  return (
    <div className="flex flex-shrink-0 items-center gap-1.5">
      {DOCK_EMOTES.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onEmote(e)}
          aria-label={`React ${e}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[17px] transition-transform active:scale-90"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

function AutoControl({ preAction, onChange }: { preAction?: PreActionOption; onChange?: (v: PreActionOption) => void }) {
  const [open, setOpen] = useState(false);
  if (!onChange) return null;
  const armed = preAction != null;
  const armedLabel = PRE_ACTIONS.find((p) => p.v === preAction)?.label;
  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold"
        style={{
          background: armed ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${armed ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.16)'}`,
          color: armed ? '#ffffff' : 'rgba(255,255,255,0.82)',
        }}
      >
        <span aria-hidden>⚙</span>
        <span className="max-w-[84px] truncate">{armed ? armedLabel : 'Auto'}</span>
        {armed && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.9)', boxShadow: '0 0 6px rgba(255,255,255,0.6)' }} />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute bottom-full right-0 z-20 mb-1.5 w-44 overflow-hidden rounded-xl"
            style={{ background: '#11151f', border: '1px solid rgba(255,255,255,0.14)', boxShadow: '0 10px 28px rgba(0,0,0,0.55)' }}
          >
            <div className="px-3 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-wider text-white/40">Auto-action when it&apos;s your turn</div>
            {PRE_ACTIONS.map((p) => {
              const on = preAction === p.v;
              return (
                <button
                  key={p.v}
                  type="button"
                  onClick={() => { onChange(on ? null : p.v); setOpen(false); }}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-[13px] active:bg-white/10"
                  style={{ color: on ? '#ffffff' : 'rgba(255,255,255,0.85)' }}
                >
                  {p.label}
                  <span
                    className="flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold"
                    style={{ border: `1.5px solid ${on ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)'}`, background: on ? 'rgba(255,255,255,0.9)' : 'transparent', color: '#06121a' }}
                  >
                    {on ? '✓' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** Single animated line that cycles the latest table actions (NOT a list). */
function LiveTicker({ state }: { state: PokerTableState | null }) {
  const actions = state?.currentHand?.recentActions;
  const items = useMemo(() => (actions ?? []).slice(-5).reverse().map((a) => actionLine(state, a)), [actions, state]);
  const [idx, setIdx] = useState(0);
  const [vis, setVis] = useState(true);
  useEffect(() => { setIdx(0); setVis(true); }, [items.length]);
  useEffect(() => {
    if (items.length <= 1) return;
    const id = setInterval(() => {
      setVis(false);
      setTimeout(() => { setIdx((i) => (i + 1) % items.length); setVis(true); }, 180);
    }, 2600);
    return () => clearInterval(id);
  }, [items.length]);
  const text = items[idx] ?? (state?.currentHand ? 'Hand in progress' : 'Waiting for the next hand');
  return (
    <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ background: 'rgba(0,0,0,0.28)' }}>
      <span className="flex flex-shrink-0 items-center gap-1 text-[8.5px] font-extrabold uppercase tracking-wider" style={{ color: '#fca5a5' }}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: '#ef4444' }} />
        Live
      </span>
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-white/75" style={{ opacity: vis ? 1 : 0, transition: 'opacity 0.18s ease' }}>
        {text}
      </span>
    </div>
  );
}

/** PAGE 0 — Live Action panel. `slim` renders the collapsed one-liner. */
function LiveActionPanel({
  state, onEmote, preAction, onPreActionChange, slim = false,
}: {
  state: PokerTableState | null;
  onEmote?: (e: string) => void;
  preAction?: PreActionOption;
  onPreActionChange?: (v: PreActionOption) => void;
  slim?: boolean;
}) {
  const hand = state?.currentHand ?? null;
  const actingPos = hand?.actingPosition ?? null;
  const acting = actingPos != null ? state?.seats?.[actingPos] ?? null : null;
  const name = acting?.displayName || (acting?.playerAddress ? `${acting.playerAddress.slice(0, 6)}…` : null);
  const { pct, remaining, active } = useTurnTimer(hand?.turnStartedAt ?? null);
  const urgent = active && remaining <= 6;

  const toCall = toBigIntSafe(hand?.toCall ?? '0');
  const actBet = toBigIntSafe(acting?.currentBet ?? '0');
  const facing = toCall > actBet ? toCall - actBet : 0n;
  const stackStr = acting?.stack ? formatChips(acting.stack) : null;

  const lastA = hand?.recentActions?.length ? hand.recentActions[hand.recentActions.length - 1] : (hand?.lastAction as RAction | null) ?? null;
  const lastText = lastA ? actionLine(state, lastA) : 'Hand in progress';

  if (slim) {
    return (
      <div className="flex items-center gap-2 px-3 py-2" style={{ minHeight: 40 }}>
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.2)' }}>
          {(name?.[0] ?? '·').toUpperCase()}
        </div>
        <span className="max-w-[88px] flex-shrink-0 truncate text-[11px] font-bold text-white">{name ?? 'Live'}</span>
        {active && (
          <span className="h-1 w-8 flex-shrink-0 overflow-hidden rounded-full bg-white/15">
            <span className="block h-full" style={{ width: `${pct * 100}%`, background: urgent ? '#f87171' : 'rgba(255,255,255,0.8)' }} />
          </span>
        )}
        {active && <span className="flex-shrink-0 text-[10px] font-bold tabular-nums" style={{ color: urgent ? '#f87171' : '#9aa3b2' }}>{Math.ceil(remaining)}s</span>}
        <span className="min-w-0 flex-1 truncate text-[10.5px] text-white/50">{lastText}</span>
        <span className="flex-shrink-0 text-[10px] text-white/40" aria-hidden>▴</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col justify-center gap-2 px-3">
      <div className="flex items-center gap-2.5">
        <ActorAvatar name={name} pct={pct} urgent={urgent} active={active} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[13.5px] font-bold text-white">
            <span className="truncate">{name ?? 'Waiting for players'}</span>
            {name && <span className="text-[10.5px] font-semibold text-white/55">acting…</span>}
          </div>
          <div className="mt-0.5 truncate text-[11px] text-white/55">
            {acting ? (
              <>
                {stackStr && <span className="tabular-nums">{stackStr}</span>}
                {facing > 0n
                  ? <> · facing <b className="tabular-nums text-amber-300">{formatChips(facing.toString())}</b></>
                  : <> · to act</>}
              </>
            ) : 'Hand in progress'}
          </div>
        </div>
        <EmoteRow onEmote={onEmote} />
      </div>

      <div className="flex items-center gap-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-[12px] opacity-70" aria-hidden>⏱</span>
          <span className="h-[7px] min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(active ? pct : 0) * 100}%`, background: urgent ? 'linear-gradient(90deg,#f87171,#dc2626)' : 'linear-gradient(90deg,rgba(255,255,255,0.85),rgba(255,255,255,0.5))', transition: 'width 0.25s linear' }}
            />
          </span>
          <span className="flex-shrink-0 text-right text-[12px] font-bold tabular-nums" style={{ color: urgent ? '#f87171' : 'rgba(255,255,255,0.85)', minWidth: 28 }}>
            {active ? `${Math.ceil(remaining)}s` : '—'}
          </span>
        </div>
        <AutoControl preAction={preAction} onChange={onPreActionChange} />
      </div>

      <LiveTicker state={state} />
    </div>
  );
}

/** Timeline scrubber shared by the Replay page + the Full Replay sheet. */
function Scrubber({
  len, pos, playing, onSeek, onTogglePlay, tall = false,
}: {
  len: number; pos: number; playing: boolean; onSeek: (i: number) => void; onTogglePlay: () => void; tall?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const pct = len > 1 ? (pos / (len - 1)) * 100 : 0;
  const seek = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || len <= 1) return;
    const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onSeek(Math.round(p * (len - 1)));
  };
  useEffect(() => {
    if (!drag) return;
    const mv = (e: PointerEvent) => seek(e.clientX);
    const up = () => setDrag(false);
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
  }, [drag, len]);
  const btn = 'flex flex-shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/[0.06] text-white/85';
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onSeek(pos - 1)} className={btn} style={{ width: 26, height: 26 }} aria-label="Step back">‹</button>
      <div
        ref={trackRef}
        onPointerDown={(e) => { setDrag(true); seek(e.clientX); }}
        className="relative min-w-0 flex-1 cursor-pointer overflow-hidden rounded"
        style={{ height: tall ? 28 : 20, background: 'rgba(0,0,0,0.32)', touchAction: 'none' }}
      >
        <div className="absolute inset-y-0 left-0" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, rgba(255,255,255,0.22), rgba(255,255,255,0.5))' }} />
        <div className="absolute inset-0 flex">
          {['PRE', 'FLOP', 'TURN', 'RIVER'].map((m, i) => (
            <div key={m} className="flex flex-1 items-center justify-center text-[8px] font-extrabold tracking-wider text-white/55" style={{ borderRight: i < 3 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>{m}</div>
          ))}
        </div>
        <div className="absolute w-[3px] rounded bg-white" style={{ left: `${pct}%`, top: -2, bottom: -2, boxShadow: '0 0 6px rgba(255,255,255,0.7)' }} />
      </div>
      <button type="button" onClick={onTogglePlay} className={btn} style={{ width: 26, height: 26 }} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
    </div>
  );
}

function CardGlyph({ idx }: { idx: number }) {
  const c = cardFace(idx);
  return (
    <span
      className="inline-flex items-center justify-center rounded text-[10px] font-extrabold"
      style={{ minWidth: 16, height: 20, padding: '0 3px', background: '#f7f7f2', color: c.red ? '#c0392b' : '#111', boxShadow: '0 1px 2px rgba(0,0,0,0.45)' }}
    >
      {c.rank}{c.suit}
    </span>
  );
}

// Muted, cohesive jewel-tones (the approved avatar palette — no neon).
const MINI_COLORS = ['#3f6e8c', '#b8553f', '#5b8c5a', '#9c6b3f', '#8a6d9e', '#a14d5c', '#4a7c8c', '#c19a3e', '#6b7a8f', '#7a8c4d'];
const miniAvatarBg = (c: string) =>
  `radial-gradient(circle at 50% 30%, color-mix(in srgb, ${c} 80%, #fff 20%), ${c} 54%, color-mix(in srgb, ${c} 74%, #000 26%))`;

/**
 * Schematic mini-table for the Full Replay sheet. Seats are PERSISTENT, keyed by player name,
 * so they GLIDE/re-space around the ellipse as players fold (folded ones drift into a top-right
 * cluster). The board reveals in the center, the actor gets a cyan ring, the winner a white ring.
 */
function ReplayMiniTable({ steps, pos }: { steps: ReplayStep[]; pos: number }) {
  const { participants, folded, winners, shown, board, pot, actingName } = useMemo(() => deriveMini(steps, pos), [steps, pos]);
  const inHand = participants.filter((p) => !folded.has(p));
  const idxOf = new Map(inHand.map((n, k) => [n, k]));
  const colorOf = (n: string) => MINI_COLORS[Math.max(0, participants.indexOf(n)) % MINI_COLORS.length];
  const avSize = Math.max(24, Math.min(42, 52 - inHand.length * 3));
  const foldedList = participants.filter((p) => folded.has(p));

  return (
    <div
      className="relative w-full overflow-hidden rounded-xl"
      style={{ height: 210, background: 'radial-gradient(120% 90% at 50% 44%, #0f7387, #0a505e 62%, #062f38)', boxShadow: 'inset 0 0 30px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(34,211,238,0.12)' }}
    >
      {/* board */}
      <div className="absolute left-1/2 top-[43%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1">
        {board.length ? board.map((c, i) => <CardGlyph key={i} idx={c} />) : <span className="text-[10px] text-white/40">preflop</span>}
      </div>
      {/* pot */}
      <div
        className="absolute left-1/2 top-[59%] -translate-x-1/2 -translate-y-1/2 rounded-full px-2.5 py-0.5 text-[10px] font-bold tabular-nums"
        style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(245,185,69,0.3)', color: '#fde68a' }}
      >
        <span className="mr-1 text-white/40">pot</span>{pot.toLocaleString()}
      </div>
      {/* persistent seats — glide as the ellipse re-spaces */}
      {participants.map((name) => {
        const isFolded = folded.has(name);
        const k = idxOf.get(name) ?? 0;
        const ang = -Math.PI / 2 + (k / Math.max(1, inHand.length)) * Math.PI * 2;
        const x = isFolded ? 92 : 50 + 38 * Math.cos(ang);
        const y = isFolded ? 12 : 50 + 29 * Math.sin(ang);
        const isWin = winners.has(name);
        const active = winners.size === 0 && actingName === name;
        const cards = shown[name];
        const cardsBelow = y < 50; // cards face the table center so they never clip the edge
        const cardEls = cards ? <div className="flex gap-0.5">{cards.map((c, i) => <CardGlyph key={i} idx={c} />)}</div> : null;
        return (
          <div
            key={name}
            className="absolute flex flex-col items-center gap-0.5"
            style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)', opacity: isFolded ? 0 : 1, pointerEvents: 'none', transition: 'left .42s cubic-bezier(.4,0,.2,1), top .42s cubic-bezier(.4,0,.2,1), opacity .3s ease' }}
          >
            {!cardsBelow && cardEls}
            <div
              className="grid place-items-center rounded-full font-bold text-white"
              style={{
                width: avSize, height: avSize, fontSize: Math.round(avSize * 0.42),
                background: miniAvatarBg(colorOf(name)),
                boxShadow: isWin ? '0 0 0 2px rgba(255,255,255,0.9), 0 0 16px rgba(255,255,255,0.3)'
                  : active ? '0 0 0 2px #22d3ee, 0 0 12px rgba(34,211,238,0.5)'
                  : '0 1px 4px rgba(0,0,0,0.6)',
                transition: 'width .42s, height .42s, box-shadow .3s ease',
              }}
            >
              {name[0].toUpperCase()}
            </div>
            <span className="max-w-[84px] truncate whitespace-nowrap text-[9px] font-bold" style={{ color: isWin ? '#fff' : active ? '#a5f3fc' : 'rgba(255,255,255,0.8)' }}>{name}{isWin ? ' 🏆' : ''}</span>
            {cardsBelow && cardEls}
          </div>
        );
      })}
      {/* folded cluster (top-right) */}
      {foldedList.length > 0 && (
        <div className="absolute right-1.5 top-1.5 flex max-w-[52%] flex-wrap items-center justify-end gap-1">
          <span className="text-[8px] font-extrabold uppercase tracking-wider text-white/40">folded</span>
          {foldedList.map((n) => (
            <span key={n} className="grid h-[18px] w-[18px] place-items-center rounded-full text-[9px] font-bold text-white/90" style={{ background: miniAvatarBg(colorOf(n)), opacity: 0.5, boxShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>{n[0].toUpperCase()}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ReplayReadout({ steps, pos }: { steps: ReplayStep[]; pos: number }) {
  const { pot, last, street } = replayStateAt(steps, pos);
  let text: React.ReactNode = 'tap an action…';
  if (last?.kind === 'action') text = <>{last.name} {last.action}{last.amount && last.amount !== '0' && <> <b className="text-amber-300">{Number(last.amount).toLocaleString()}</b></>}</>;
  else if (last?.kind === 'deal') text = <>Board {last.cards.map((c, i) => <CardGlyph key={i} idx={c} />)}</>;
  else if (last?.kind === 'show') text = <>{last.name} shows {last.cards.map((c, i) => <CardGlyph key={i} idx={c} />)}</>;
  else if (last?.kind === 'result') text = <>🏆 {last.name} wins {Number(last.amount).toLocaleString()}{last.handName && ` — ${last.handName}`}</>;
  return (
    <div className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[10.5px]" style={{ background: 'rgba(0,0,0,0.28)' }}>
      <span className="flex-shrink-0 text-[9px] font-extrabold uppercase tracking-wider text-white/60">{streetTag(street)}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1 truncate text-white/85">{text}</span>
      <span className="flex-shrink-0 tabular-nums text-amber-300"><small className="text-white/40">pot </small>{pot.toLocaleString()}</span>
    </div>
  );
}

/** Hand picker — "This hand" (live) + past hands, newest first. Horizontal scroll. */
function HandPicker({ hands, activeHandId, onPick, large = false }: { hands: ReplayHandSummary[]; activeHandId: string | null; onPick: (id: string | null) => void; large?: boolean }) {
  const chip = (active: boolean) =>
    `flex-shrink-0 rounded-md border px-2.5 py-1 ${large ? 'text-[11.5px]' : 'text-[10px]'} font-semibold whitespace-nowrap ${active ? 'border-white/40 text-white' : 'border-white/12 text-white/70'}`;
  const bg = (active: boolean) => (active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)');
  return (
    <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      <button type="button" onClick={() => onPick(null)} className={chip(activeHandId == null)} style={{ background: bg(activeHandId == null) }}>This hand</button>
      {hands.map((h) => (
        <button key={h.handId} type="button" onClick={() => onPick(h.handId)} className={chip(activeHandId === h.handId)} style={{ background: bg(activeHandId === h.handId) }}>
          #{h.handNumber}{large && h.label ? ` · ${h.label}` : ''}
        </button>
      ))}
    </div>
  );
}

/** PAGE 1 — Replay. Pick any past hand (winner + all showdown) or scrub the live hand. */
function ReplayPage({
  steps, hands, activeHandId, loading, pos, isLive, playing, onSeek, onTogglePlay, onLatest, onFull, onPick,
}: {
  steps: ReplayStep[]; hands: ReplayHandSummary[]; activeHandId: string | null; loading: boolean;
  pos: number; isLive: boolean; playing: boolean;
  onSeek: (i: number) => void; onTogglePlay: () => void; onLatest: () => void; onFull: () => void; onPick: (id: string | null) => void;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-1.5 px-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/55">Replay</span>
        {!isLive && <button type="button" onClick={onLatest} className="text-[10px] font-semibold text-white/70">⤓ End</button>}
        <button type="button" onClick={onFull} className="ml-auto rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-white/80">▸ Full</button>
      </div>
      <HandPicker hands={hands} activeHandId={activeHandId} onPick={onPick} />
      {loading ? (
        <div className="flex flex-1 items-center justify-center text-[11.5px] text-white/40">Loading hand…</div>
      ) : steps.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-[11.5px] text-white/40">{activeHandId == null ? 'No actions yet this hand.' : 'No replay for this hand.'}</div>
      ) : (
        <>
          <Scrubber len={steps.length} pos={pos} playing={playing} onSeek={onSeek} onTogglePlay={onTogglePlay} />
          <ReplayReadout steps={steps} pos={pos} />
        </>
      )}
    </div>
  );
}

// Keep the resting dock uncluttered — surface at most 6 quick-chat phrases as a tidy 2×3
// grid (no scroll). The complete list stays one tap away under "Full chat".
const DOCK_QUICK_CHAT_MAX = 6;

/** PAGE 2 — Quick chat. Full history opens the activity drawer. */
function ChatPage({ phrases, onPhrase, onFull }: { phrases?: string[]; onPhrase?: (p: string) => void; onFull?: () => void }) {
  const dockPhrases = (phrases ?? []).slice(0, DOCK_QUICK_CHAT_MAX);
  return (
    <div className="flex h-full flex-col gap-2 px-3 pt-0.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/70">Quick chat</span>
        {onFull && <button type="button" onClick={onFull} className="ml-auto rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-[10px] font-semibold text-white/80">▸ Full chat</button>}
      </div>
      {dockPhrases.length > 0 && onPhrase ? (
        <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-1.5">
          {dockPhrases.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onPhrase(p)}
              className="flex items-center justify-center truncate rounded-lg border border-white/10 bg-white/[0.06] px-2 text-[12px] font-medium text-white/85 active:bg-white/15"
            >
              {p}
            </button>
          ))}
        </div>
      ) : (
        <span className="text-[12px] text-white/40">Quick chat unavailable.</span>
      )}
    </div>
  );
}

// ── PAGES 3 & 4 — My Stats (session/table) + Table info (cash/tournament) ──────────────────────
const signedChips = (wei: string): string => {
  const b = toBigIntSafe(wei);
  const neg = b < 0n;
  return `${neg ? '−' : '+'}${formatChips((neg ? -b : b).toString())}`;
};
const signedColor = (wei: string): string => (toBigIntSafe(wei) < 0n ? '#f87171' : '#4ade80');

/** Compact stat cell shared by the Stats + Table pages. */
function StatTile({ label, value, sub, accent }: { label: string; value: React.ReactNode; sub?: string; accent?: string }) {
  return (
    <div className="flex flex-col justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1">
      <span className="truncate text-[8px] font-bold uppercase tracking-wider text-white/45">{label}</span>
      <span className="truncate text-[13px] font-bold leading-tight tabular-nums" style={{ color: accent ?? '#e6ebf2' }}>{value}</span>
      {sub != null && <span className="truncate text-[8px] font-medium text-white/40">{sub}</span>}
    </div>
  );
}

function DockEmpty({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center text-[11.5px] text-white/40">{children}</div>;
}

/** PAGE 3 — My Stats. Lifetime at this table (the per-sitting "Session" view was removed). */
function StatsPage({ stats }: { stats?: DockStatsData }) {
  const t = stats?.table ?? null;
  return (
    <div className="flex h-full flex-col gap-1.5 px-3 pt-0.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/70">My Stats</span>
        <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-white/35">At this table</span>
      </div>
      {t && t.hands > 0 ? (
        <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-1.5">
          <StatTile label="Hands" value={t.hands} />
          <StatTile label="Win Rate" value={`${Math.round(t.winRatePct)}%`} />
          <StatTile label="Net P / L" value={signedChips(t.profitLossChips)} accent={signedColor(t.profitLossChips)} />
          <StatTile label="Biggest Pot" value={formatChips(t.biggestPotChips)} accent="#fde68a" />
          <StatTile label="VPIP" value={`${t.vpipPct.toFixed(0)}%`} />
          <StatTile label="PFR" value={`${t.pfrPct.toFixed(0)}%`} />
        </div>
      ) : (
        <DockEmpty>{stats?.loadingTable ? 'Loading table stats…' : 'No table stats yet.'}</DockEmpty>
      )}
    </div>
  );
}

/** PAGE 4 — Table info. Cash → blinds/buy-in/seats/pot. Tournament → level/prize/rank/stack. */
function TableInfoPage({ info }: { info?: DockTableInfo }) {
  if (!info) return <div className="flex h-full items-center px-3 text-[12px] text-white/40">Table info unavailable.</div>;
  const badge = (
    <span
      className="rounded px-1.5 py-0.5 text-[8.5px] font-extrabold uppercase tracking-wider text-white/70"
      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }}
    >
      {info.kind === 'cash' ? 'Cash Game' : 'Tournament'}
    </span>
  );
  return (
    <div className="flex h-full flex-col gap-1.5 px-3 pt-0.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-white/70">Table</span>
        {badge}
        {info.kind === 'cash'
          ? info.sponsor && <span className="ml-auto truncate text-[9px] text-white/40">★ {info.sponsor}</span>
          : <span className="ml-auto truncate text-[9px] text-white/45">{info.name}</span>}
      </div>
      {info.kind === 'cash' ? (
        <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-1.5">
          <StatTile label="Small Blind" value={info.smallBlind} />
          <StatTile label="Big Blind" value={info.bigBlind} />
          <StatTile label="Seats" value={info.seatsLabel} />
          <StatTile label="Min Buy-in" value={info.minBuyIn} />
          <StatTile label="Max Buy-in" value={info.maxBuyIn} />
          <StatTile label="Pot" value={formatChips(info.potChips)} accent="#fde68a" />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-3 grid-rows-2 gap-1.5">
          <StatTile label="Level" value={info.level} sub={info.blinds ?? undefined} />
          <StatTile label="Next Level" value={info.nextLevel ?? '—'} />
          <StatTile label="Prize Pool" value={info.prizePool} accent="#fde68a" />
          <StatTile label="Rank" value={info.rank != null ? `#${info.rank}` : '—'} />
          <StatTile label="Players" value={info.playersLeft ?? '—'} />
          <StatTile label="Your Stack" value={info.myStackBB ?? '—'} />
        </div>
      )}
    </div>
  );
}

/** A single play-by-play row (action / board deal / showdown reveal / winner). */
function FeedRow({ step, active, dim, onClick }: { step: ReplayStep; active: boolean; dim: number; onClick: () => void }) {
  const border = active ? '#22d3ee' : step.kind === 'result' ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)';
  const bg = active ? 'rgba(34,211,238,0.12)' : step.kind === 'result' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)';
  const common = { background: bg, borderColor: border, opacity: dim } as React.CSSProperties;
  if (step.kind === 'deal') {
    return (
      <button type="button" onClick={onClick} className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-[12px] font-bold" style={common}>
        <span className="text-[9px] font-extrabold tracking-wider text-white/55">{streetTag(step.street)}</span>
        <span className="flex items-center gap-1">{step.cards.map((c, i) => <CardGlyph key={i} idx={c} />)}</span>
      </button>
    );
  }
  if (step.kind === 'show') {
    return (
      <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-[12px] font-semibold" style={common}>
        {step.winner && <span aria-hidden>🏆</span>}
        <span className="min-w-[80px] flex-shrink-0 truncate" style={{ color: step.winner ? '#fde68a' : '#cbd5e1' }}>{step.name}</span>
        <span className="flex flex-shrink-0 items-center gap-1">{step.cards.map((c, i) => <CardGlyph key={i} idx={c} />)}</span>
        {step.handName && <span className="ml-auto truncate text-[11px] text-white/60">{step.handName}</span>}
      </button>
    );
  }
  if (step.kind === 'result') {
    return (
      <button type="button" onClick={onClick} className="flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-center text-[12px] font-extrabold text-white" style={common}>
        🏆 {step.name} wins {Number(step.amount).toLocaleString()}{step.handName ? ` — ${step.handName}` : ''}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] font-semibold" style={{ ...common, color: active ? '#a5f3fc' : 'rgba(255,255,255,0.85)' }}>
      <span className="min-w-[92px] flex-shrink-0 truncate" style={{ color: active ? '#a5f3fc' : '#cbd5e1' }}>{step.name}</span>
      <span className="flex-1 truncate text-white/70">{step.action}</span>
      {step.amount && step.amount !== '0' && <span className="tabular-nums" style={{ color: '#fde68a' }}>{Number(step.amount).toLocaleString()}</span>}
    </button>
  );
}

/** Full Replay bottom sheet — hand picker + scrubber + full play-by-play (deals, showdown, winner). */
function FullReplaySheet({
  steps, hands, activeHandId, loading, pos, playing, onSeek, onTogglePlay, onPick, onClose,
}: {
  steps: ReplayStep[]; hands: ReplayHandSummary[]; activeHandId: string | null; loading: boolean;
  pos: number; playing: boolean; onSeek: (i: number) => void; onTogglePlay: () => void; onPick: (id: string | null) => void; onClose: () => void;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wrap = feedRef.current;
    const active = wrap?.querySelector('[data-active="1"]') as HTMLElement | null;
    if (wrap && active) wrap.scrollTop = active.offsetTop - wrap.clientHeight / 2 + active.clientHeight / 2;
  }, [pos]);
  const title = activeHandId == null ? 'This hand · full replay' : `${hands.find((h) => h.handId === activeHandId)?.label ?? 'Hand'} · full replay`;
  return (
    <>
      <div className="fixed inset-0 z-[59]" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-[60] flex flex-col rounded-t-2xl px-4 pt-3"
        style={{ background: '#0a0c14', borderTop: '1px solid rgba(255,255,255,0.12)', maxHeight: '88vh', paddingBottom: 'calc(20px + env(safe-area-inset-bottom,0px))', boxShadow: '0 -10px 40px rgba(0,0,0,0.6)' }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/25" />
        <div className="mb-2 flex items-center">
          <h4 className="truncate text-[13px] font-bold text-white">{title}</h4>
          <button type="button" onClick={onClose} className="ml-auto flex-shrink-0 rounded-md px-2 py-1 text-[12px] text-white/55">Close</button>
        </div>
        <div className="mb-2"><HandPicker hands={hands} activeHandId={activeHandId} onPick={onPick} large /></div>
        {loading ? (
          <div className="py-10 text-center text-[12px] text-white/40">Loading hand…</div>
        ) : steps.length === 0 ? (
          <div className="py-10 text-center text-[12px] text-white/40">No replay for this hand.</div>
        ) : (
          <>
            <div className="mb-2"><ReplayMiniTable steps={steps} pos={pos} /></div>
            <div className="mb-2"><Scrubber len={steps.length} pos={pos} playing={playing} onSeek={onSeek} onTogglePlay={onTogglePlay} tall /></div>
            <ReplayReadout steps={steps} pos={pos} />
            <div ref={feedRef} className="mt-2 flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: '32vh', scrollbarWidth: 'none' }}>
              {steps.map((s, i) => (
                <div key={i} data-active={i === pos ? '1' : '0'}>
                  <FeedRow step={s} active={i === pos} dim={i > pos ? 0.4 : i < pos ? 0.72 : 1} onClick={() => onSeek(i)} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

const DOCK_PAGES = 5;

/** Off-turn dock — collapsed (slim strip) · carousel (Live · Replay · Chat · Stats · Table). Full sheets overlay. */
function PortraitOffTurnDock({
  state, quickChatPhrases, onPhraseReaction, preAction, onPreActionChange, onOpenActivity, replay, stats, tableInfo,
}: {
  state: PokerTableState | null;
  quickChatPhrases?: string[];
  onPhraseReaction?: (phrase: string) => void;
  preAction?: PreActionOption;
  onPreActionChange?: (v: PreActionOption) => void;
  onOpenActivity?: () => void;
  replay?: ReplayProps;
  stats?: DockStatsData;
  tableInfo?: DockTableInfo;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [page, setPage] = useState(0);
  const [scrub, setScrub] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [fullReplay, setFullReplay] = useState(false);
  const pagesRef = useRef<HTMLDivElement>(null);

  const hands = replay?.hands ?? [];
  const activeHandId = replay?.activeHandId ?? null;
  const isLiveHand = activeHandId == null;
  const replayLoading = !isLiveHand && (replay?.loading ?? false);

  // Live hand → steps from recentActions; past hand → steps from the verify-built payload.
  const liveSteps = useMemo(
    () => buildLiveSteps(
      (state?.currentHand?.recentActions ?? []) as RAction[],
      (pos: number) => state?.seats?.[pos]?.displayName || `Seat ${pos + 1}`,
    ),
    [state?.currentHand?.recentActions, state?.seats],
  );
  const steps: ReplayStep[] = isLiveHand ? liveSteps : (replay?.steps ?? []);
  const livePos = Math.max(0, steps.length - 1);
  const isEnd = scrub == null;
  const pos = Math.min(isEnd ? livePos : scrub, livePos);

  useEffect(() => {
    try { setCollapsed(localStorage.getItem('poker.portraitDockCollapsed') === '1'); } catch { /* ignore */ }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem('poker.portraitDockCollapsed', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  // Reset the playhead when the selected hand changes.
  useEffect(() => { setScrub(null); setPlaying(false); }, [activeHandId]);

  const onSeek = (i: number) => { setPlaying(false); setScrub(Math.max(0, Math.min(livePos, i))); };
  const onLatest = () => { setPlaying(false); setScrub(null); };
  const onPick = (id: string | null) => { setPlaying(false); setScrub(null); replay?.onPick(id); };
  const onTogglePlay = () => { if (isEnd) setScrub(0); setPlaying((p) => !p); };
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setScrub((s) => {
        const cur = s == null ? livePos : s;
        if (cur >= livePos) { setPlaying(false); return livePos; }
        return cur + 1;
      });
    }, 850);
    return () => clearInterval(id);
  }, [playing, livePos]);

  const onScroll = () => {
    const el = pagesRef.current;
    if (!el || !el.clientWidth) return;
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  };
  const goPage = (i: number) => {
    const el = pagesRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  if (collapsed) {
    return (
      <div className="relative">
        <button type="button" onClick={toggleCollapsed} aria-label="Expand dock" className="w-full">
          <LiveActionPanel state={state} slim />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" style={{ height: 158 }}>
      <div className="absolute left-1/2 top-1 z-10 flex -translate-x-1/2 items-center gap-1.5">
        {Array.from({ length: DOCK_PAGES }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Page ${i + 1}`}
            onClick={() => goPage(i)}
            className="rounded-full transition-all"
            style={{ width: page === i ? 16 : 5, height: 5, background: page === i ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.25)' }}
          />
        ))}
      </div>
      <button type="button" onClick={toggleCollapsed} aria-label="Collapse dock" className="absolute right-2 top-0.5 z-10 text-[12px] leading-none text-white/40">▾</button>

      <div
        ref={pagesRef}
        onScroll={onScroll}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto pt-3.5"
        style={{ scrollbarWidth: 'none' }}
      >
        <div className="h-full w-full flex-[0_0_100%] snap-start">
          <LiveActionPanel state={state} onEmote={onPhraseReaction} preAction={preAction} onPreActionChange={onPreActionChange} />
        </div>
        <div className="h-full w-full flex-[0_0_100%] snap-start">
          <ReplayPage
            steps={steps} hands={hands} activeHandId={activeHandId} loading={replayLoading}
            pos={pos} isLive={isEnd} playing={playing}
            onSeek={onSeek} onTogglePlay={onTogglePlay} onLatest={onLatest} onFull={() => setFullReplay(true)} onPick={onPick}
          />
        </div>
        <div className="h-full w-full flex-[0_0_100%] snap-start">
          <ChatPage phrases={quickChatPhrases} onPhrase={onPhraseReaction} onFull={onOpenActivity} />
        </div>
        <div className="h-full w-full flex-[0_0_100%] snap-start">
          <StatsPage stats={stats} />
        </div>
        <div className="h-full w-full flex-[0_0_100%] snap-start">
          <TableInfoPage info={tableInfo} />
        </div>
      </div>

      {fullReplay && (
        <FullReplaySheet
          steps={steps} hands={hands} activeHandId={activeHandId} loading={replayLoading}
          pos={pos} playing={playing}
          onSeek={onSeek} onTogglePlay={onTogglePlay} onPick={onPick} onClose={() => setFullReplay(false)}
        />
      )}
    </div>
  );
}

const SHELL_SELECTOR = '[data-poker-shell]';

export const POKER_BOTTOM_RESERVE_VAR = '--poker-bottom-reserve';
export const POKER_SIDE_STRIP_W = 96;

export function PokerBottomBar({
  fullscreen = false,
  mobileLandscape = false,
  portrait = false,
  tournament: _tournament,
  quickChatPhrases,
  onPhraseReaction,
  preAction,
  onPreActionChange,
  onOpenActivity,
  replay,
  stats,
  tableInfo,
  renderedState,
  mySeat,
  actions,
  suppressed = false,
}: PokerBottomBarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const show = !suppressed && !!(renderedState && mySeat && actions);
  const actingPos = renderedState?.currentHand?.actingPosition ?? null;
  const myTurn = actingPos != null && mySeat != null && actingPos === (mySeat.position ?? -1);

  // Portrait turn-gate: when the player's turn arrives the dock STAYS exactly as it is and a
  // breathing "It's Your Turn / Click To Play" pill overhangs its top edge. The betting controls
  // only replace the dock once the player taps the pill. Re-arm (hide controls, re-show the pill)
  // on every fresh turn and whenever the turn ends.
  const turnStartedAt = renderedState?.currentHand?.turnStartedAt ?? null;
  const [betPanelOpen, setBetPanelOpen] = useState(false);
  useEffect(() => { setBetPanelOpen(false); }, [myTurn, turnStartedAt]);
  // Portrait, player's turn, controls not yet revealed → dock + pill. Once revealed → betting panel.
  const portraitDockVisible = portrait && !(myTurn && betPanelOpen);

  useLayoutEffect(() => {
    const shell = document.querySelector(SHELL_SELECTOR) as HTMLElement | null;
    if (!shell) return;

    const applyReserve = (px: number) => {
      shell.style.setProperty(POKER_BOTTOM_RESERVE_VAR, `${Math.max(0, Math.round(px))}px`);
    };

    if (!show || mobileLandscape) {
      applyReserve(0);
      return () => { shell.style.removeProperty(POKER_BOTTOM_RESERVE_VAR); };
    }

    const el = rootRef.current;
    if (!el) {
      applyReserve(0);
      return () => { shell.style.removeProperty(POKER_BOTTOM_RESERVE_VAR); };
    }

    const measure = () => applyReserve(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      shell.style.removeProperty(POKER_BOTTOM_RESERVE_VAR);
    };
  }, [show, fullscreen, mobileLandscape]);

  if (!show) return null;

  if (mobileLandscape) {
    return (
      <div
        ref={rootRef}
        data-poker-bottom
        data-poker-bottom-side
        className="pointer-events-auto fixed right-0 top-0 bottom-0 z-40"
        style={{
          width: POKER_SIDE_STRIP_W,
          background: 'linear-gradient(to left, rgba(5,8,20,0.92), rgba(5,8,20,0.78))',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {actions}
      </div>
    );
  }

  if (fullscreen) {
    return (
      <div
        ref={rootRef}
        data-poker-bottom
        className="pointer-events-auto absolute bottom-0 left-0 right-0 z-40"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 60%, transparent)' }}
      >
        <div className="px-4 pb-1 pt-2">
          <div
            className="mx-auto w-full max-w-[900px] rounded-sm px-4 py-2.5"
            style={{
              background: 'rgba(5,8,20,0.72)',
              backdropFilter: 'blur(18px)',
              WebkitBackdropFilter: 'blur(18px)',
              border: '1px solid rgba(255,255,255,0.07)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {actions}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      data-poker-bottom
      className="poker-dock-glass relative z-40 w-full shrink-0 pointer-events-auto"
    >
      {/* SVG displacement map for the liquid-glass refraction (consumed by .poker-dock-glass via
          backdrop-filter:url() where supported). Hidden; harmless where url() backdrops aren't. */}
      <svg aria-hidden width="0" height="0" style={{ position: 'absolute' }}>
        <filter id="poker-liquid-glass" x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.01 0.013" numOctaves="2" seed="7" result="n" />
          <feGaussianBlur in="n" stdDeviation="2.2" result="ns" />
          <feDisplacementMap in="SourceGraphic" in2="ns" scale="26" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      {/* Player's-turn dock chrome (portrait): the turn countdown drains across the dock's TOP
          BORDER, and a breathing "It's Your Turn / Click To Play" pill overhangs the top-center
          until tapped. Both sit on the dock root so they straddle its top edge. */}
      {portrait && myTurn && <DockTurnTimerBorder turnStartedAt={turnStartedAt} />}
      {portrait && myTurn && !betPanelOpen && (
        <YourTurnPill onClick={() => setBetPanelOpen(true)} />
      )}
      <div className="w-full max-sm:px-0 max-sm:pt-0 max-sm:pb-0 sm:px-3 sm:pt-1.5 sm:pb-[max(6px,env(safe-area-inset-bottom,0px))]">
        {portraitDockVisible ? (
          <PortraitOffTurnDock
            state={renderedState}
            quickChatPhrases={quickChatPhrases}
            onPhraseReaction={onPhraseReaction}
            preAction={preAction}
            onPreActionChange={onPreActionChange}
            onOpenActivity={onOpenActivity}
            replay={replay}
            stats={stats}
            tableInfo={tableInfo}
          />
        ) : actions}
      </div>
    </div>
  );
}
