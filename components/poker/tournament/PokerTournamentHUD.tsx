'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PokerTournamentState } from '@/hooks/use-poker-tournament';
import { formatChips as formatChipsLib } from '@/lib/format-poker-chips';
import { useSidebar } from '@/components/ui/sidebar';

interface Props {
  state: PokerTournamentState;
  myAddress: string;
}

// ── Formatters ─────────────────────────────────────────────────────────────

function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
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

function isZeroBuyInChips(wei: string): boolean {
  try {
    return BigInt(wei || '0') === 0n;
  } catch {
    return true;
  }
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
      className="self-center w-12 h-px"
      style={{ background: 'rgba(255,255,255,0.09)' }}
    />
  );
}

/** Collapsed-rail stat cell: Jost title (small) above Jost value (larger). */
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
    <div className="flex flex-col items-center justify-center gap-0.5 w-full">
      <span
        className="font-jost-normal text-[9px] uppercase tracking-[0.14em]"
        style={{ color: 'rgba(255,255,255,0.45)' }}
      >
        {label}
      </span>
      <span
        className="font-jost text-[14px] tabular-nums flex items-center gap-0.5"
        style={{ color: 'rgba(255,255,255,0.95)', letterSpacing: '-0.01em' }}
      >
        {value}
        {valueSuffix}
      </span>
    </div>
  );
}

/** Expanded-panel block: centered Jost label above centered Jost value, with optional sub-line. */
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
    <div className="flex flex-col items-center gap-1 px-2 py-3">
      <span
        className="font-jost-normal text-[10px] uppercase tracking-[0.18em]"
        style={{ color: 'rgba(255,255,255,0.45)' }}
      >
        {label}
      </span>
      <span
        className="font-jost text-[26px] tabular-nums leading-none"
        style={{ color: 'rgba(255,255,255,0.98)', letterSpacing: '-0.01em' }}
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
  const prizeLabel = (() => {
    try {
      return formatChipsLib(state.prizePool);
    } catch {
      return '—';
    }
  })();

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
    <div className="flex flex-col items-stretch justify-between h-full w-full py-6 px-1">
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
                className="text-[10px]"
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
            color: 'rgba(255,255,255,0.98)',
            letterSpacing: '-0.02em',
            textTransform: 'uppercase',
          }}
        >
          {state.name}
        </h3>
        <div
          className="mt-1.5 font-jost-normal text-[10px] tracking-[0.18em] uppercase flex items-center justify-center gap-1.5"
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          {isZeroBuyInChips(state.buyInAmount) && <span>Freeroll</span>}
          {isZeroBuyInChips(state.buyInAmount) && <span style={{ color: 'rgba(255,255,255,0.2)' }}>·</span>}
          <span>Hand {state.handNumber}</span>
        </div>
      </div>

      <BlockDivider />

      {/* Blinds — current + next */}
      <ExpandedBlock
        label="Blinds"
        value={`${formatChipsLib(state.smallBlind)} / ${formatChipsLib(state.bigBlind)}`}
        sub={nextBlindsStr ? <>Next: <span className="font-jost" style={{ color: 'rgba(255,255,255,0.8)' }}>{nextBlindsStr}</span></> : null}
      />

      <BlockDivider />

      {/* Your stack */}
      {me && <ExpandedBlock label="Your Stack" value={stackFull} />}

      {me && <BlockDivider />}

      {/* Rank */}
      {myRank != null && <ExpandedBlock label="Rank" value={rankLongStr} />}

      {myRank != null && <BlockDivider />}

      {/* Players left */}
      <ExpandedBlock label="Players Left" value={playersLeftFull} />

      <BlockDivider />

      {/* Prize pool */}
      <ExpandedBlock label="Prize Pool" value={prizeLabel} />

      <BlockDivider />

      {/* Leaderboard — slightly different treatment: list under a centered heading */}
      <div className="px-4 pt-3 pb-1">
        <div
          className="font-jost-normal text-[10px] uppercase tracking-[0.18em] text-center mb-2"
          style={{ color: 'rgba(255,255,255,0.45)' }}
        >
          Leaderboard
        </div>
        <div className="flex flex-col gap-1">
          {sortedByChips.slice(0, 6).map((p, i) => {
            const isMe = p.playerAddress.toLowerCase() === myAddress.toLowerCase();
            return (
              <div
                key={p.playerAddress}
                className={`flex justify-between items-center gap-2 min-w-0 px-2 py-1 rounded ${isMe ? '' : ''}`}
                style={{
                  background: isMe ? 'rgba(255,255,255,0.06)' : 'transparent',
                  borderLeft: isMe ? '2px solid rgba(255,255,255,0.5)' : '2px solid transparent',
                }}
              >
                <span
                  className="font-jost-normal text-[12px] truncate min-w-0"
                  style={{ color: isMe ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.75)' }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.35)' }}>#{i + 1}</span>{' '}
                  {shortAddr(p.playerAddress)}
                </span>
                <span
                  className="font-jost text-[12px] tabular-nums shrink-0"
                  style={{ color: isMe ? 'rgba(255,255,255,0.98)' : 'rgba(255,255,255,0.8)' }}
                >
                  {formatChipsLib(p.chipsRemaining)}
                </span>
              </div>
            );
          })}
          {sortedByChips.length > 6 && (
            <div
              className="font-jost-normal text-[10px] text-center mt-0.5"
              style={{ color: 'rgba(255,255,255,0.4)' }}
            >
              +{sortedByChips.length - 6} more
            </div>
          )}
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
