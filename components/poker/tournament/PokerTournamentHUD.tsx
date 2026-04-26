'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PokerTournamentState, PokerTournamentPlayer } from '@/hooks/use-poker-tournament';
import { formatChips as formatChipsLib, toChipInt } from '@/lib/format-poker-chips';
import { formatUnits } from 'viem';
import { useSidebar } from '@/components/ui/sidebar';

interface Props {
  state: PokerTournamentState;
  myAddress: string;
}

// ── Formatters ─────────────────────────────────────────────────────────────

/** Wallet fallback in leaderboard: last 4 characters only. */
function addrLast4(addr: string): string {
  const a = addr.trim();
  if (!a) return '';
  return a.length <= 4 ? a : a.slice(-4);
}

function playerDisplayLabel(p: PokerTournamentPlayer): string {
  const n = p.displayName?.trim();
  if (n) return n;
  return addrLast4(p.playerAddress);
}

function playerIsOut(p: PokerTournamentPlayer): boolean {
  return p.status === 'busted' || p.status === 'completed';
}

function formatCompactChips(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.floor(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatBlindShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.floor(n / 1000)}K`;
  return String(n);
}

/**
 * Human-readable amount in the prize unit. Routes:
 *  - chip-int → "12,345"
 *  - token-wei → "1.2345 0xABcd…1234"
 *
 * Pass `bareAmount=true` to get just the numeric portion (no token tail) — used for
 * per-player prize-share rows where the column header already implies the unit.
 */
function formatPrizeAmount(
  amount: bigint | string,
  prizeTokenAddress: string | null | undefined,
  prizeTokenDecimals: number | null | undefined,
  prizeTokenSymbol: string | null | undefined,
  opts: { bareAmount?: boolean } = {},
): string {
  if (!prizeTokenAddress) {
    try {
      return formatChipsLib(typeof amount === 'bigint' ? amount.toString() : amount);
    } catch { return '—'; }
  }
  const dec = prizeTokenDecimals ?? 18;
  let bn: bigint;
  try {
    bn = typeof amount === 'bigint' ? amount : BigInt(amount || '0');
  } catch { return '—'; }
  let human: string;
  try {
    human = formatUnits(bn, dec);
  } catch { return '—'; }
  const trimmed = human.includes('.') ? human.replace(/\.?0+$/, '') : human;
  if (opts.bareAmount) return trimmed;
  const ticker = prizeTokenSymbol?.trim()
    ? prizeTokenSymbol.trim()
    : `${prizeTokenAddress.slice(0, 6)}…${prizeTokenAddress.slice(-4)}`;
  return `${trimmed} ${ticker}`;
}

function isZeroBuyInChips(wei: string): boolean {
  try {
    return BigInt(wei || '0') === 0n;
  } catch {
    return true;
  }
}

/** Integer chip share of `pool` for a payout percentage (0–100). */
function chipShareForPercent(pool: bigint, pct: number): bigint {
  if (pool <= 0n || !Number.isFinite(pct) || pct <= 0) return 0n;
  const p = Math.min(100, Math.max(0, Math.round(pct)));
  return (pool * BigInt(p)) / 100n;
}

// ── Burst queue types ──────────────────────────────────────────────────────

type Burst = {
  id: string;
  text: string;
  /** 'red' = elimination stage 1; 'black' = everything else */
  tone: 'red' | 'black';
};

const BURST_MS = 1200;

// ── Shared atomic pieces ──────────────────────────────────────────────────

function Divider() {
  return (
    <div
      className="self-center w-7 h-px"
      style={{ background: 'rgba(255,255,255,0.08)' }}
    />
  );
}

/** Collapsed-rail stat cell: tiny uppercase label above tabular value, tightly stacked. */
function CollapsedStat({
  label,
  value,
  valueSuffix,
}: {
  label: string;
  value: string;
  valueSuffix?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center w-full leading-none">
      <span
        className="font-jost-normal text-[8px] uppercase tracking-[0.18em]"
        style={{ color: 'rgba(255,255,255,0.38)' }}
      >
        {label}
      </span>
      <span
        className="font-jost text-[13px] tabular-nums flex items-center gap-0.5 mt-1"
        style={{ color: 'rgba(255,255,255,0.96)', letterSpacing: '-0.01em' }}
      >
        {value}
        {valueSuffix}
      </span>
    </div>
  );
}

/** Expanded-panel hero block: large centered value with label and optional sub-line. */
function ExpandedBlock({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-2 py-4">
      <span
        className="font-jost-normal text-[10px] uppercase tracking-[0.2em]"
        style={{ color: 'rgba(255,255,255,0.42)' }}
      >
        {label}
      </span>
      <span
        className="font-jost text-[28px] tabular-nums leading-none"
        style={{ color: 'rgba(255,255,255,0.98)', letterSpacing: '-0.02em' }}
      >
        {value}
      </span>
      {sub ? (
        <span
          className="font-jost-normal text-[10px] tracking-wide"
          style={{ color: 'rgba(255,255,255,0.55)' }}
        >
          {sub}
        </span>
      ) : null}
    </div>
  );
}

/** Compact stat tile used inside the 2-col secondary grid in the expanded panel. */
function StatTile({
  label,
  value,
  sub,
  align = 'left',
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <div
      className={`flex flex-col gap-1 px-3 py-2.5 ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}
    >
      <span
        className="font-jost-normal text-[9px] uppercase tracking-[0.18em]"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        {label}
      </span>
      <span
        className="font-jost text-[17px] tabular-nums leading-none"
        style={{ color: 'rgba(255,255,255,0.96)', letterSpacing: '-0.01em' }}
      >
        {value}
      </span>
      {sub ? (
        <span
          className="font-jost-normal text-[9px] tracking-wide"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          {sub}
        </span>
      ) : null}
    </div>
  );
}

function BlockDivider() {
  return (
    <div
      className="mx-5 h-px"
      style={{ background: 'rgba(255,255,255,0.07)' }}
    />
  );
}

// ── Main component ────────────────────────────────────────────────────────

export function PokerTournamentHUD({ state, myAddress }: Props) {
  const { open } = useSidebar();

  // Derived data
  const me = state.players.find(
    (p) => p.playerAddress.toLowerCase() === myAddress.toLowerCase(),
  );
  const activePlayers = state.players.filter((p) => p.status === 'playing');
  const sortedByChips = [...activePlayers].sort((a, b) => b.chipsRemaining - a.chipsRemaining);

  /** Active (by chips), then everyone out (by finishing rank, worst first). */
  const leaderboardRows = useMemo(() => {
    const playing = state.players.filter((p) => p.status === 'playing');
    playing.sort((a, b) => b.chipsRemaining - a.chipsRemaining);
    const out = state.players.filter((p) => p.status !== 'playing');
    out.sort((a, b) => {
      const ra = a.finalRank ?? -1;
      const rb = b.finalRank ?? -1;
      if (ra !== rb) return rb - ra;
      return a.playerAddress.localeCompare(b.playerAddress);
    });
    return [...playing, ...out];
  }, [state.players]);

  const splits = state.prizeSplitPercentages ?? [];
  const poolBn = useMemo(() => toChipInt(state.prizePool), [state.prizePool]);

  const myRank = me
    ? sortedByChips.findIndex((p) => p.playerAddress.toLowerCase() === myAddress.toLowerCase()) + 1
    : null;

  // Next blinds from schedule (if available)
  const schedule = state.pokerConfig?.blindSchedule;
  const nextLevel = schedule?.find((lvl) => lvl.level === state.blindLevel + 1);
  const nextBlindsStr = nextLevel
    ? `${formatBlindShort(nextLevel.smallBlind)}/${formatBlindShort(nextLevel.bigBlind)}`
    : null;

  // Rank change indicator (▲ / ▼)
  const prevRankRef = useRef<number | null>(null);
  const [rankDelta, setRankDelta] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    if (myRank == null) return;
    const prev = prevRankRef.current;
    prevRankRef.current = myRank;
    if (prev == null || prev === myRank) return;
    setRankDelta(myRank < prev ? 'up' : 'down');
    const t = setTimeout(() => setRankDelta(null), 3000);
    return () => clearTimeout(t);
  }, [myRank]);

  // ── Burst queue ──────────────────────────────────────────────────────────
  const [activeBurst, setActiveBurst] = useState<Burst | null>(null);
  const burstQueueRef = useRef<Burst[]>([]);
  const burstPlayingRef = useRef(false);
  const prevActiveCountRef = useRef<number | null>(null);
  const prevBlindLevelRef = useRef<number | null>(null);

  const drainBurstQueue = () => {
    if (burstPlayingRef.current) return;
    const next = burstQueueRef.current.shift();
    if (!next) return;
    burstPlayingRef.current = true;
    setActiveBurst(next);
    setTimeout(() => {
      burstPlayingRef.current = false;
      setActiveBurst(null);
      if (burstQueueRef.current.length > 0) {
        // small beat between bursts so each one registers
        setTimeout(drainBurstQueue, 80);
      }
    }, BURST_MS);
  };

  const enqueueBursts = (items: Burst[]) => {
    burstQueueRef.current.push(...items);
    drainBurstQueue();
  };

  // Elimination detection
  useEffect(() => {
    const count = activePlayers.length;
    const prev = prevActiveCountRef.current;
    prevActiveCountRef.current = count;
    if (prev == null) return;
    if (count < prev) {
      const eliminated = prev - count;
      // One red burst for any elim count; multiple knockouts in the same snapshot are bundled.
      const elimText =
        eliminated === 1 ? 'PLAYER OUT' : `${eliminated} PLAYERS ELIMINATED`;
      enqueueBursts([
        { id: `elim-${Date.now()}`, text: elimText, tone: 'red' },
        { id: `elim-left-${Date.now()}`, text: `${count} LEFT`, tone: 'black' },
      ]);
    }
  }, [activePlayers.length, state.smallBlind, state.bigBlind]);

  // Blind-change detection (fires independent of elimination)
  useEffect(() => {
    const lvl = state.blindLevel;
    const prev = prevBlindLevelRef.current;
    prevBlindLevelRef.current = lvl;
    if (prev == null) return;
    if (lvl > prev) {
      const blindLine = `${formatBlindShort(state.smallBlind)}/${formatBlindShort(state.bigBlind)}`;
      enqueueBursts([
        {
          id: `blind-${Date.now()}`,
          text: `BLINDS INCREASE TO ${blindLine}`,
          tone: 'black',
        },
      ]);
    }
  }, [state.blindLevel, state.smallBlind, state.bigBlind]);

  // ── Precomputed strings ──────────────────────────────────────────────────
  const blindStr = `${formatBlindShort(state.smallBlind)}/${formatBlindShort(state.bigBlind)}`;
  const stackShort = me ? formatCompactChips(me.chipsRemaining) : '—';
  const stackFull = me ? formatChipsLib(me.chipsRemaining) : '—';
  const rankStr = myRank != null ? `#${myRank}` : '—';
  const rankLongStr = myRank != null ? `#${myRank} / ${activePlayers.length}` : '—';
  const playersLeftShort = `${activePlayers.length}`;
  const playersLeftFull = `${activePlayers.length}`;
  const prizeLabel = formatPrizeAmount(state.prizePool, state.prizeTokenAddress, state.prizeTokenDecimals, state.prizeTokenSymbol);

  // ── Burst overlay ────────────────────────────────────────────────────────
  const burstOverlay = (
    <AnimatePresence>
      {activeBurst && (
        <motion.div
          key={activeBurst.id}
          className="absolute inset-0 z-40 flex items-center justify-center"
          style={{
            background: activeBurst.tone === 'red' ? 'rgba(220,38,38,0.98)' : 'rgba(0,0,0,0.96)',
            color: '#ffffff',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.span
            className={
              open
                ? 'font-jost text-center px-3 select-none'
                : 'font-jost-normal text-center uppercase tracking-[0.14em] select-none px-1'
            }
            style={
              open
                ? {
                    letterSpacing: '-0.01em',
                    fontSize: 30,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    color: '#ffffff',
                  }
                : {
                    fontSize: 10,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    color: '#ffffff',
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    letterSpacing: '0.14em',
                  }
            }
            initial={{ scale: 0.92, y: 6 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          >
            {activeBurst.text}
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ── Collapsed rail content ───────────────────────────────────────────────
  const collapsedContent = (
    <div className="flex flex-col items-center justify-center h-full w-full px-1">
      <div
        className="flex flex-col items-stretch w-full gap-3 py-4 px-1 rounded-lg"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.008) 100%)',
          border: '1px solid rgba(255,255,255,0.05)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        <CollapsedStat label="Blinds" value={blindStr} />
        <Divider />
        <CollapsedStat label="Stack" value={stackShort} />
        <Divider />
        <CollapsedStat
          label="Rank"
          value={rankStr}
          valueSuffix={
            <AnimatePresence>
              {rankDelta && (
                <motion.span
                  key={rankDelta}
                  initial={{ opacity: 0, y: rankDelta === 'up' ? 4 : -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="text-[9px]"
                  style={{ color: rankDelta === 'up' ? 'rgba(52,211,153,1)' : 'rgba(239,68,68,1)' }}
                >
                  {rankDelta === 'up' ? '▲' : '▼'}
                </motion.span>
              )}
            </AnimatePresence>
          }
        />
        <Divider />
        <CollapsedStat label="Left" value={playersLeftShort} />
      </div>
    </div>
  );

  // ── Expanded panel content ───────────────────────────────────────────────
  const expandedContent = (
    <div className="flex flex-col h-full w-full min-h-0 pt-6 pb-4 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.12) transparent' }}>
      {/* Tournament name (hero) */}
      <div className="px-4 pb-3 text-center">
        <h3
          className="font-jost leading-[0.95] break-words"
          style={{
            fontSize: 28,
            color: 'rgba(0, 191, 255, 0.98)',
            letterSpacing: '-0.02em',
            textTransform: 'uppercase',
          }}
        >
          {state.name}
        </h3>
        <div
          className="mt-1.5 font-jost-normal text-[10px] tracking-[0.18em] uppercase flex items-center justify-center gap-1.5"
          style={{ color: 'rgba(255, 255, 255, 0.5)' }}
        >
          {isZeroBuyInChips(state.buyInAmount) && <span>Freeroll</span>}
          {isZeroBuyInChips(state.buyInAmount) && <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>}
          <span>Hand {state.handNumber}</span>
        </div>
      </div>

      <BlockDivider />

      {/* Blinds — hero (current + next) */}
      <ExpandedBlock
        label="Blinds"
        value={`${formatChipsLib(state.smallBlind)} / ${formatChipsLib(state.bigBlind)}`}
        sub={nextBlindsStr ? <>Next <span className="font-jost" style={{ color: 'rgba(255,255,255,0.8)' }}>{nextBlindsStr}</span></> : null}
      />

      {/* Secondary stats — 2-col grid card */}
      <div className="px-4 pt-1 pb-4">
        <div
          className="grid grid-cols-2 rounded-lg overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          {me ? (
            <StatTile label="Your Stack" value={stackFull} />
          ) : (
            <StatTile label="Your Stack" value="—" />
          )}
          <StatTile
            label="Rank"
            value={myRank != null ? `#${myRank}` : '—'}
            sub={myRank != null ? `of ${activePlayers.length}` : undefined}
            align="right"
          />
          <div className="col-span-2 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
          <StatTile label="Players Left" value={playersLeftFull} />
          <StatTile label="Prize Pool" value={prizeLabel} align="right" />
        </div>
      </div>

      <BlockDivider />

      {/* Leaderboard — slightly different treatment: list under a centered heading */}
      <div className="px-4 pt-3 pb-1">
        <div
          className="font-jost font-bold text-[14px] uppercase tracking-[0.18em] text-center mb-2"
          style={{ color: 'rgb(255, 251, 0)' }}
        >
          Leaderboard
        </div>
        <div
          className="grid grid-cols-[minmax(0,1fr)_minmax(3.5rem,max-content)_minmax(3.25rem,max-content)] gap-x-2 gap-y-0.5 items-start px-2 mb-1"
          style={{ color: 'rgba(255,255,255,0.38)' }}
        >
          <span className="font-jost-normal text-[9px] uppercase tracking-[0.14em]">Player</span>
          <span className="font-jost-normal text-[9px] uppercase tracking-[0.14em] text-right">Stack</span>
          <span className="font-jost-normal text-[9px] uppercase tracking-[0.14em] text-right">Prize</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {leaderboardRows.map((p) => {
            const isMe = p.playerAddress.toLowerCase() === myAddress.toLowerCase();
            const out = playerIsOut(p);
            const rankAmongActive = out
              ? null
              : sortedByChips.findIndex((x) => x.playerAddress.toLowerCase() === p.playerAddress.toLowerCase()) + 1;
            const podium =
              !out && rankAmongActive != null && rankAmongActive >= 1 && rankAmongActive <= 3
                ? (rankAmongActive as 1 | 2 | 3)
                : null;
            const namePx = podium === 1 ? 17 : podium === 2 ? 14.5 : podium === 3 ? 13 : 12;
            const rankNumPx = podium === 1 ? 13 : podium === 2 ? 11.5 : podium === 3 ? 10.5 : 12;
            const chipPx = podium === 1 ? 15 : podium === 2 ? 13.5 : podium === 3 ? 12.5 : 12;
            const rankPrefix =
              rankAmongActive != null && rankAmongActive > 0 ? (
                <span
                  className="shrink-0 tabular-nums"
                  style={{
                    color:
                      podium === 1
                        ? 'rgba(34,211,238,0.75)'
                        : podium === 2
                          ? 'rgba(255,255,255,0.42)'
                          : podium === 3
                            ? 'rgba(255,255,255,0.38)'
                            : 'rgba(255,255,255,0.35)',
                    fontSize: rankNumPx,
                    fontWeight: podium === 1 ? 600 : 500,
                    letterSpacing: podium === 1 ? '0.02em' : undefined,
                  }}
                >
                  #{rankAmongActive}
                </span>
              ) : null;
            const outLabel =
              p.status === 'completed' && p.finalRank === 1
                ? 'Winner'
                : p.status === 'completed' && p.finalRank != null
                  ? `Finished · #${p.finalRank}`
                  : p.status === 'busted'
                    ? p.finalRank != null
                      ? `Eliminated · #${p.finalRank}`
                      : 'Eliminated'
                    : null;
            const rowBg =
              podium === 1
                ? 'linear-gradient(90deg, rgba(34,211,238,0.12) 0%, rgba(34,211,238,0.02) 55%, transparent 100%)'
                : podium === 2
                  ? 'linear-gradient(90deg, rgba(255,255,255,0.07) 0%, transparent 70%)'
                  : podium === 3
                    ? 'linear-gradient(90deg, rgba(255,255,255,0.045) 0%, transparent 65%)'
                    : isMe
                      ? 'rgba(255,255,255,0.06)'
                      : 'transparent';
            const rowBorderLeft =
              podium === 1
                ? '3px solid rgba(34,211,238,0.45)'
                : podium === 2
                  ? '2px solid rgba(255,255,255,0.28)'
                  : podium === 3
                    ? '2px solid rgba(180,130,70,0.45)'
                    : isMe
                      ? '2px solid rgba(255,255,255,0.5)'
                      : '2px solid transparent';
            const splitPct =
              splits.length === 0
                ? undefined
                : out && p.finalRank != null && p.finalRank >= 1
                  ? splits[p.finalRank - 1]
                  : !out &&
                      rankAmongActive != null &&
                      rankAmongActive >= 1 &&
                      rankAmongActive <= splits.length
                    ? splits[rankAmongActive - 1]
                    : undefined;
            const prizePx = podium === 1 ? 12 : podium === 2 ? 10.5 : podium === 3 ? 10 : 9;
            const prizeShareBn =
              splitPct != null && Number.isFinite(splitPct) && splitPct >= 0
                ? chipShareForPercent(poolBn, splitPct)
                : 0n;
            const showPrizeChips = poolBn > 0n && splitPct != null && splitPct > 0;
            return (
              <div
                key={p.playerAddress}
                className="grid grid-cols-[minmax(0,1fr)_minmax(3.5rem,max-content)_minmax(3.25rem,max-content)] gap-x-2 items-start min-w-0 px-2 rounded"
                style={{
                  background: rowBg,
                  borderLeft: rowBorderLeft,
                  opacity: out ? 0.72 : 1,
                  paddingTop: podium === 1 ? 10 : podium ? 7 : 6,
                  paddingBottom: podium === 1 ? 10 : podium ? 7 : 6,
                  boxShadow:
                    podium === 1 ? 'inset 0 1px 0 rgba(255,255,255,0.06)' : undefined,
                }}
              >
                <span
                  className={`truncate min-w-0 flex flex-col gap-0.5 ${podium ? 'font-jost' : 'font-jost-normal'}`}
                  style={{
                    color: isMe ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.78)',
                    fontSize: namePx,
                    lineHeight: podium === 1 ? 1.15 : 1.2,
                    fontWeight: podium === 1 ? 600 : podium ? 500 : 400,
                    letterSpacing: podium === 1 ? '-0.02em' : '-0.01em',
                  }}
                >
                  <span className="truncate min-w-0 flex items-baseline gap-1.5 min-w-0">
                    {rankPrefix}
                    <span className="truncate min-w-0" style={{ fontSize: 'inherit' }}>
                      {playerDisplayLabel(p)}
                    </span>
                  </span>
                  {outLabel ? (
                    <span
                      className="font-jost-normal text-[9px] uppercase tracking-wide truncate"
                      style={{
                        color:
                          p.status === 'completed' && p.finalRank === 1
                            ? 'rgba(52,211,153,0.95)'
                            : p.status === 'completed'
                              ? 'rgba(255,255,255,0.5)'
                              : 'rgba(248,113,113,0.9)',
                      }}
                    >
                      {outLabel}
                    </span>
                  ) : null}
                </span>
                <span
                  className="font-jost tabular-nums shrink-0 self-start text-right"
                  style={{
                    color: isMe ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.82)',
                    fontSize: chipPx,
                    fontWeight: podium === 1 ? 600 : 500,
                    letterSpacing: podium === 1 ? '-0.02em' : undefined,
                  }}
                >
                  {out ? '—' : formatChipsLib(p.chipsRemaining)}
                </span>
                <div className="flex flex-col items-end justify-start min-w-0 self-start text-right leading-tight">
                  {splitPct != null && Number.isFinite(splitPct) && splitPct >= 0 ? (
                    <>
                      <span
                        className="font-jost tabular-nums"
                        style={{
                          fontSize: prizePx,
                          color: isMe ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.78)',
                          fontWeight: podium === 1 ? 600 : 500,
                        }}
                      >
                        {splitPct}%
                      </span>
                      {showPrizeChips ? (
                        <span
                          className="font-jost-normal tabular-nums text-[8px] mt-0.5"
                          style={{ color: 'rgba(255,255,255,0.42)' }}
                        >
                          {formatPrizeAmount(prizeShareBn, state.prizeTokenAddress, state.prizeTokenDecimals, state.prizeTokenSymbol, { bareAmount: true })}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span
                      className="font-jost tabular-nums"
                      style={{
                        fontSize: prizePx,
                        color: 'rgba(255,255,255,0.32)',
                      }}
                    >
                      —
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── Wrapper ──────────────────────────────────────────────────────────────
  return (
    <div className="relative flex flex-col h-full w-full min-h-0 select-none">
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.div
            key="expanded"
            className="h-full w-full min-h-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {expandedContent}
          </motion.div>
        ) : (
          <motion.div
            key="collapsed"
            className="h-full w-full min-h-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
          >
            {collapsedContent}
          </motion.div>
        )}
      </AnimatePresence>

      {burstOverlay}
    </div>
  );
}
