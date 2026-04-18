'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  usePokerTournament,
  POKER_TOURNAMENT_DEFAULT_CONFIG,
  type PokerTournamentSummary,
  type CreatePokerTournamentParams,
} from '@/hooks/use-poker-tournament';
import type { BlackjackWebSocketClient } from '@/lib/websocket-client';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
import { isAdminWallet } from '@/lib/admin';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tournamentFinishOrdinal(rank: number): string {
  const j = rank % 10;
  const k = rank % 100;
  if (j === 1 && k !== 11) return `${rank}st`;
  if (j === 2 && k !== 12) return `${rank}nd`;
  if (j === 3 && k !== 13) return `${rank}rd`;
  return `${rank}th`;
}

const MORBIUS_DECIMALS = 18n;

/** 48 slots per day: :00 and :30, labels in 12h AM/PM (local). */
function useThirtyMinuteTimeOptions(): { value: string; label: string }[] {
  return useMemo(() => {
    const out: { value: string; label: string }[] = [];
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 30]) {
        const d = new Date(2000, 0, 1, h, m, 0, 0);
        out.push({
          value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
          label: format(d, 'h:mm a'),
        });
      }
    }
    return out;
  }, []);
}

function localYyyyMmDd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function parseMorbiusInput(val: string): bigint {
  try {
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) return 0n;
    return BigInt(Math.round(num)) * 10n ** MORBIUS_DECIMALS;
  } catch { return 0n; }
}

function isZeroBuyInWei(wei: string): boolean {
  try {
    return BigInt(wei || '0') === 0n;
  } catch {
    return true;
  }
}

function formatMorbius(wei: string | bigint): string {
  try {
    return formatMorbiusFloor(wei, { compact: false });
  } catch {
    return '0';
  }
}

async function requestTournamentBotBootstrap(
  tournamentId: string,
  numBots: number,
  walletAddress: string,
  pinCode?: string,
): Promise<{ numBots: number }> {
  const res = await fetch('/api/admin/poker/tournament-bots/bootstrap', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-wallet': walletAddress,
    },
    body: JSON.stringify({
      tournamentId,
      numBots,
      ...(pinCode && pinCode.length > 0 ? { pinCode } : {}),
    }),
  });
  const raw = await res.text().catch(() => '');
  let data: { error?: string; numBots?: number } = {};
  if (raw) {
    try {
      data = JSON.parse(raw) as typeof data;
    } catch {
      /* ignore */
    }
  }
  if (!res.ok) {
    throw new Error(data.error || raw || `HTTP ${res.status}`);
  }
  return { numBots: typeof data.numBots === 'number' ? data.numBots : numBots };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useCountdown(targetIso: string | null): string | null {
  const [display, setDisplay] = useState<string | null>(null);

  useEffect(() => {
    if (!targetIso) { setDisplay(null); return; }
    const update = () => {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) { setDisplay('Starting now'); return; }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      if (h > 0) setDisplay(`${h}h ${m}m`);
      else if (m > 0) setDisplay(`${m}m ${s}s`);
      else setDisplay(`${s}s`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  return display;
}

// ---------------------------------------------------------------------------
// TournamentCard
// ---------------------------------------------------------------------------

function TournamentCard({
  t,
  myAddress,
  onJoin,
  onCancel,
  onAddTournamentBots,
  tournamentBotsBusy,
  isJoining,
  isCancelling,
}: {
  t: PokerTournamentSummary;
  myAddress?: string;
  onJoin: (tournamentId: string, pinCode?: string) => void;
  onCancel: (tournamentId: string) => void;
  onAddTournamentBots?: (tournamentId: string, numBots: number, pinCode?: string) => void;
  tournamentBotsBusy?: boolean;
  isJoining?: boolean;
  isCancelling?: boolean;
}) {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [botCount, setBotCount] = useState(2);
  const [botPin, setBotPin] = useState('');
  const isPrivate = t.isPrivate === true;

  const spots = t.maxPlayers - t.registeredCount;
  const isFull = spots <= 0;
  const isActive = t.status === 'active';
  const isScheduled = !!t.scheduledStartAt && new Date(t.scheduledStartAt) > new Date();
  const countdown = useCountdown(isScheduled ? t.scheduledStartAt : null);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/8 transition-colors p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h4 className="font-semibold text-white truncate">{t.name}</h4>
            {isZeroBuyInWei(t.buyInAmount) && (
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-cyan-500/35 text-cyan-300/95 bg-cyan-500/10 shrink-0">
                Freeroll
              </span>
            )}
          </div>
          <p className="text-xs text-white/50 mt-0.5">
            by {t.creatorAddress ? `${t.creatorAddress.slice(0, 6)}…${t.creatorAddress.slice(-4)}` : 'Unknown'}
          </p>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium shrink-0 ${
          isActive
            ? 'bg-green-500/20 text-green-300 border-green-500/30'
            : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
        }`}>
          {isActive ? 'In Progress' : 'Open'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-wide">Buy-in</div>
          <div className="text-sm font-semibold text-white mt-0.5">
            {isZeroBuyInWei(t.buyInAmount) ? 'Free' : formatMorbius(t.buyInAmount)}
          </div>
          <div className="text-[10px] text-white/30">MORBIUS</div>
        </div>
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-wide">Players</div>
          <div className="text-sm font-semibold text-white mt-0.5">{t.registeredCount} / {t.maxPlayers}</div>
          <div className="text-[10px] text-white/30">
            {isFull ? 'Full' : `${spots} spot${spots === 1 ? '' : 's'} left`}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-white/40 uppercase tracking-wide">Prize Pool</div>
          <div className="text-sm font-semibold text-yellow-300 mt-0.5">{formatMorbius(t.prizePool)}</div>
          <div className="text-[10px] text-white/30">MORBIUS</div>
        </div>
      </div>

      <div className="mt-3 text-[11px] text-white/40">
        {isScheduled
          ? `Scheduled · Stack: ${t.startingStack.toLocaleString()} chips`
          : `SNG · Start: ${t.minPlayers} players · Stack: ${t.startingStack.toLocaleString()} chips`
        }
      </div>

      {isScheduled && countdown && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-[10px] text-white/40 uppercase tracking-wide">Starts in</span>
          <span className="text-xs font-bold text-cyan-400 tabular-nums">{countdown}</span>
        </div>
      )}

      {/* Already registered */}
      {t.isRegistered && !isActive && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/30 px-3 py-2">
          <span className="text-green-400 text-xs font-semibold">✓ Registered</span>
          {isScheduled && countdown && (
            <span className="text-white/40 text-xs ml-1">Starts in {countdown}</span>
          )}
          {t.status === 'registration' && t.creatorAddress?.toLowerCase() === myAddress?.toLowerCase() && (
            <button
              onClick={() => onCancel(t.tournamentId)}
              disabled={isCancelling}
              className="ml-auto text-[11px] text-red-400/70 hover:text-red-400 disabled:opacity-40 border border-red-500/20 hover:border-red-500/40 rounded px-2 py-0.5 transition-colors"
            >
              {isCancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
        </div>
      )}

      {/* Join button — only show if not registered, not active, not full */}
      {!t.isRegistered && !isActive && !isFull && (
        <div className="mt-3">
          {showPin ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="Enter PIN"
                className="flex-1 rounded-lg bg-white/10 border border-white/20 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/40"
              />
              <button
                onClick={() => { onJoin(t.tournamentId, pin); setShowPin(false); }}
                className="rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black font-semibold text-sm px-3 py-1.5 transition-colors"
              >
                Join
              </button>
            </div>
          ) : (
            <button
              onClick={() => onJoin(t.tournamentId)}
              disabled={isJoining}
              className="w-full rounded-lg bg-yellow-500 hover:bg-yellow-400 disabled:opacity-60 disabled:cursor-not-allowed text-black font-semibold text-sm py-2 transition-colors"
            >
              {isJoining ? 'Joining…' : isScheduled ? 'Register' : 'Join Tournament'}
            </button>
          )}
        </div>
      )}

      {isActive && !t.isRegistered && (
        <div className="mt-3 text-center text-xs text-white/30 py-1">
          Tournament in progress
        </div>
      )}

      {isActive && t.isRegistered && (
        <div className="mt-3 text-center text-xs text-green-400/60 py-1">
          You are playing in this tournament
        </div>
      )}

      {myAddress && t.status === 'registration' && !isActive && onAddTournamentBots && (
        <div
          className="mt-3 rounded-lg border border-cyan-500/25 p-3 space-y-2"
          style={{
            background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.5), rgba(40, 40, 40, 0.35))',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.5), 0 1px 2px rgba(0, 0, 0, 0.4)',
          }}
        >
          <div className="text-[11px] font-semibold text-cyan-200/90">AI players (server)</div>
          <p className="text-[10px] text-white/45 leading-snug">
            Starts bot processes on the API host so they register here before the game begins (same idea as cash-table bots).
          </p>
          <div className="flex flex-wrap gap-2 items-center">
            <label className="text-[10px] text-white/50 flex items-center gap-1">
              Count
              <input
                type="number"
                min={1}
                max={10}
                value={botCount}
                onChange={(e) => setBotCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                className="w-14 rounded bg-white/10 border border-white/15 px-2 py-1 text-xs text-white"
              />
            </label>
            {isPrivate && (
              <input
                type="text"
                value={botPin}
                onChange={(e) => setBotPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="PIN"
                className="flex-1 min-w-[4rem] rounded-lg bg-white/10 border border-white/15 px-2 py-1 text-xs text-white placeholder:text-white/30"
              />
            )}
            <button
              type="button"
              disabled={tournamentBotsBusy || (isPrivate && botPin.length < 4)}
              onClick={() => onAddTournamentBots(t.tournamentId, botCount, isPrivate ? botPin : undefined)}
              className="rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-95 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 transition-opacity"
            >
              {tournamentBotsBusy ? 'Starting…' : 'Add bots'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreateModal
// ---------------------------------------------------------------------------

const STARTING_STACK_PRESETS = [
  { value: '1000', label: '1,000 (short)' },
  { value: '2500', label: '2,500' },
  { value: '5555', label: '5,555' },
  { value: '10000', label: '10,000 (deep)' },
] as const;

function defaultWinnerTakesAllPrizeRowCount(n: number): number[] {
  return Array.from({ length: n }, (_, i) => (i === 0 ? 100 : 0));
}

function finishOrdinal(rank: number): string {
  const j = rank % 10;
  const k = rank % 100;
  if (j === 1 && k !== 11) return `${rank}st`;
  if (j === 2 && k !== 12) return `${rank}nd`;
  if (j === 3 && k !== 13) return `${rank}rd`;
  return `${rank}th`;
}

function CreateModal({ creatorAddress, onClose, onCreate }: {
  creatorAddress?: string;
  onClose: () => void;
  onCreate: (params: CreatePokerTournamentParams, opts: { addBots: number }) => Promise<void>;
}) {
  const [name, setName] = useState('My SNG');
  const [isFreeroll, setIsFreeroll] = useState(false);
  const [fundFromPromo, setFundFromPromo] = useState(false);
  const [buyIn, setBuyIn] = useState('1000');
  const [guaranteedPool, setGuaranteedPool] = useState('5000');
  const [startingStack, setStartingStack] = useState<string>('10000');
  const [minPlayers, setMinPlayers] = useState('2');
  const [maxPlayers, setMaxPlayers] = useState('6');
  const [isPrivate, setIsPrivate] = useState(false);
  const [privatePin, setPrivatePin] = useState('');
  const [botsToAdd, setBotsToAdd] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  /** yyyy-MM-dd in local time; empty = SNG auto-start */
  const [scheduledDate, setScheduledDate] = useState('');
  /** HH:mm 24h, only :00 or :30 — paired with scheduledDate */
  const [scheduledTime, setScheduledTime] = useState('19:00');
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  const timeOptions = useThirtyMinuteTimeOptions();
  const minScheduleDate = useMemo(() => localYyyyMmDd(new Date()), []);

  const showPromoOption = isFreeroll && isAdminWallet(creatorAddress);

  useEffect(() => {
    if (!isFreeroll) setFundFromPromo(false);
  }, [isFreeroll]);

  const prizeSlotCount = useMemo(() => {
    const minP = Math.max(2, Math.min(10, parseInt(minPlayers, 10) || 2));
    const rawMax = parseInt(maxPlayers, 10);
    const maxP = Math.max(
      minP,
      Math.max(2, Math.min(10, Number.isFinite(rawMax) ? rawMax : 6)),
    );
    return maxP;
  }, [minPlayers, maxPlayers]);

  const [prizePercents, setPrizePercents] = useState<number[]>(() => defaultWinnerTakesAllPrizeRowCount(6));

  useEffect(() => {
    setPrizePercents((prev) => {
      const next = prev.slice(0, prizeSlotCount);
      while (next.length < prizeSlotCount) next.push(0);
      if (next.length === prev.length && next.every((v, i) => v === prev[i])) return prev;
      return next;
    });
  }, [prizeSlotCount]);

  const prizeSum = prizePercents.reduce((a, b) => a + b, 0);

  const level1Blinds = POKER_TOURNAMENT_DEFAULT_CONFIG.blindSchedule[0];
  const startingStackPreview = Math.max(
    100,
    parseInt(startingStack, 10) || Number(STARTING_STACK_PRESETS[STARTING_STACK_PRESETS.length - 1].value),
  );
  const bigBlindStart = level1Blinds.bigBlind > 0 ? level1Blinds.bigBlind : 1;
  const startingBigBlindDepth =
    Math.round((startingStackPreview / bigBlindStart) * 10) / 10;

  const handleCreate = async () => {
    if (!name.trim()) return;
    const buyWei = isFreeroll ? 0n : parseMorbiusInput(buyIn);
    const guaranteeWei = isFreeroll ? parseMorbiusInput(guaranteedPool) : 0n;
    if (!isFreeroll && buyWei <= 0n) return;
    if (isFreeroll && guaranteeWei <= 0n) return;
    const pinDigits = privatePin.replace(/\D/g, '').slice(0, 12);
    const pinForCreate = isPrivate && pinDigits.length >= 4 ? pinDigits : undefined;

    setScheduleError(null);
    let scheduledStartAt: string | null = null;
    if (scheduledDate.trim()) {
      const parts = scheduledDate.split('-').map(Number);
      const timeParts = scheduledTime.split(':').map(Number);
      if (parts.length !== 3 || timeParts.length !== 2) {
        setScheduleError('Pick a valid date and time.');
        return;
      }
      const [y, mo, d] = parts;
      const [hh, mm] = timeParts;
      if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d) || !Number.isFinite(hh) || !Number.isFinite(mm)) {
        setScheduleError('Pick a valid date and time.');
        return;
      }
      if (mm !== 0 && mm !== 30) {
        setScheduleError('Time must be on a 30-minute mark.');
        return;
      }
      const local = new Date(y, mo - 1, d, hh, mm, 0, 0);
      if (local.getTime() < Date.now() + 60_000) {
        setScheduleError('Start must be at least 1 minute from now.');
        return;
      }
      scheduledStartAt = local.toISOString();
    }

    setIsSubmitting(true);
    try {
      await onCreate(
        {
          name:                  name.trim(),
          buyInAmount:           buyWei.toString(),
          ...(isFreeroll
            ? {
                guaranteedPrizePool: guaranteeWei.toString(),
                ...(fundFromPromo ? { guaranteedPrizePoolSource: 'platform_promo' as const } : {}),
              }
            : {}),
          prizeDistributionType: 'custom',
          prizePercentages:      [...prizePercents],
          config:                {
            ...POKER_TOURNAMENT_DEFAULT_CONFIG,
            startingStack: Math.max(
              100,
              parseInt(startingStack, 10) || Number(STARTING_STACK_PRESETS[STARTING_STACK_PRESETS.length - 1].value),
            ),
            minPlayers:    Math.max(2, Math.min(10, parseInt(minPlayers, 10) || 2)),
            maxPlayers:    prizeSlotCount,
          },
          isPrivate,
          ...(pinForCreate ? { pinCode: pinForCreate } : {}),
          scheduledStartAt,
        },
        { addBots: Math.max(0, Math.min(10, Math.floor(botsToAdd))) },
      );
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="border border-cyan-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl"
        style={{
          background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.95), rgba(40, 40, 40, 0.85))',
          boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.6), 0 8px 32px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Create tournament</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors text-xl leading-none">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Tournament Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg bg-white/8 border border-white/15 px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              maxLength={40}
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isFreeroll}
              onChange={(e) => {
                setIsFreeroll(e.target.checked);
                if (!e.target.checked) setFundFromPromo(false);
              }}
              className="rounded"
            />
            <span className="text-sm text-white/70">
              Freeroll (guaranteed prize pool at create)
            </span>
          </label>

          {isFreeroll && !fundFromPromo && (
            <p className="text-[11px] text-white/45 leading-snug -mt-1">
              Charged from your in-app MORBIUS balance when you tap Create (same balance as Plinko and other games).
            </p>
          )}

          {showPromoOption && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={fundFromPromo}
                onChange={(e) => setFundFromPromo(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-amber-200/85">
                Admin promo (fund from your wallet — must be in ADMIN_WALLETS)
              </span>
            </label>
          )}

          {isFreeroll && fundFromPromo && (
            <p className="text-[11px] text-amber-200/65 leading-snug -mt-1">
              Uses your connected wallet&apos;s in-app balance (same as a normal freeroll you fund). Only wallets listed in{' '}
              <span className="font-mono text-[10px]">ADMIN_WALLETS</span> can enable this. Cancel refunds the pool to you.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">
                {isFreeroll ? 'Guaranteed pool (MORBIUS)' : 'Buy-in (MORBIUS)'}
              </label>
              <input
                type="number"
                min="1"
                value={isFreeroll ? guaranteedPool : buyIn}
                onChange={(e) => (isFreeroll ? setGuaranteedPool(e.target.value) : setBuyIn(e.target.value))}
                className="w-full rounded-lg bg-white/8 border border-white/15 px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              />
            </div>
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Starting stack (chips)</label>
              <Select value={startingStack} onValueChange={setStartingStack}>
                <SelectTrigger
                  className="w-full h-auto min-h-[42px] rounded-lg bg-white/8 border border-white/15 px-3 py-2 text-white text-sm focus:ring-1 focus:ring-cyan-500/50 [&_svg]:text-white/60"
                >
                  <SelectValue placeholder="Stack size" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border border-cyan-500/30 text-white shadow-xl z-[200]">
                  {STARTING_STACK_PRESETS.map((p) => (
                    <SelectItem
                      key={p.value}
                      value={p.value}
                      className="focus:bg-cyan-500/15 focus:text-white cursor-pointer"
                    >
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            className="rounded-xl px-3 py-2.5 border border-cyan-500/20"
            style={{
              background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
              boxShadow:
                'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div className="text-[11px] font-semibold text-cyan-200/90 mb-1">Blinds at start (level 1)</div>
            <p className="text-xs text-white/75">
              SB <span className="text-white tabular-nums font-medium">{level1Blinds.smallBlind}</span>
              <span className="text-white/35 mx-1">/</span>
              BB <span className="text-white tabular-nums font-medium">{level1Blinds.bigBlind}</span>
              <span className="text-white/45"> — tournament chips (fixed schedule; not calculated from buy-in)</span>
            </p>
            <p className="text-[11px] text-white/50 mt-1.5 leading-snug">
              With a starting stack of{' '}
              <span className="text-white/70 tabular-nums">{startingStackPreview.toLocaleString()}</span>, you begin
              about <span className="text-cyan-200/80 tabular-nums">{startingBigBlindDepth}</span> big blinds deep.
            </p>
            <p className="text-[11px] text-white/45 mt-2 leading-snug border-t border-white/10 pt-2">
              <span className="text-white/55">Why &quot;starting stack&quot;?</span> Buy-in is MORBIUS (prize pool /
              entry). Starting stack is play chips at the table — separate so you can run a short-stack (faster) or
              deep-stack (more room to maneuver) structure without changing the buy-in.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Min Players</label>
              <input
                type="number"
                min="2"
                max="10"
                value={minPlayers}
                onChange={(e) => setMinPlayers(e.target.value)}
                className="w-full rounded-lg bg-white/8 border border-white/15 px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              />
            </div>
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">Max Players</label>
              <input
                type="number"
                min="2"
                max="10"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
                className="w-full rounded-lg bg-white/8 border border-white/15 px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
              />
            </div>
          </div>

          <div
            className="rounded-xl px-3 py-2.5 border border-cyan-500/20"
            style={{
              background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
              boxShadow:
                'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="text-[11px] font-semibold text-cyan-200/90">
                Prize split <span className="text-white/40 font-normal">(% after table fees)</span>
                <span className="text-white/35"> · {prizeSlotCount} payout row{prizeSlotCount === 1 ? '' : 's'} (max seats)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setPrizePercents(defaultWinnerTakesAllPrizeRowCount(prizeSlotCount))}
                  className="text-[10px] rounded-md border border-white/15 bg-white/5 px-2 py-1 text-white/75 hover:bg-white/10"
                >
                  Winner takes all
                </button>
                <button
                  type="button"
                  disabled={prizeSlotCount < 3}
                  onClick={() => {
                    const row = defaultWinnerTakesAllPrizeRowCount(prizeSlotCount);
                    row[0] = 50;
                    row[1] = 30;
                    row[2] = 20;
                    setPrizePercents(row);
                  }}
                  className="text-[10px] rounded-md border border-white/15 bg-white/5 px-2 py-1 text-white/75 hover:bg-white/10 disabled:opacity-35"
                >
                  Top 3 (50/30/20)
                </button>
              </div>
            </div>
            <p className="text-[10px] text-white/45 leading-snug mb-2">
              Leave places at 0% if they are not paid. Integer percents only; all rows together must total 100%.
            </p>
            <div className="rounded-lg border border-white/10 overflow-hidden max-h-48 overflow-y-auto">
              <div className="grid grid-cols-[1fr_3.5rem] gap-0 bg-white/5 text-[10px] uppercase tracking-wide text-white/50 px-2 py-1.5 sticky top-0">
                <span>Place</span>
                <span className="text-right">%</span>
              </div>
              {prizePercents.map((pct, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_3.5rem] gap-2 items-center border-t border-white/10 px-2 py-1.5"
                >
                  <span className="text-xs text-white/80">{finishOrdinal(i + 1)}</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={pct}
                    onChange={(e) => {
                      const n = parseInt(e.target.value, 10);
                      const v = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
                      setPrizePercents((prev) => {
                        const next = [...prev];
                        next[i] = v;
                        return next;
                      });
                    }}
                    className="w-full rounded bg-white/10 border border-white/15 px-1.5 py-1 text-xs text-white tabular-nums text-right focus:outline-none focus:border-cyan-500/40"
                  />
                </div>
              ))}
            </div>
            <p className={`text-[11px] mt-2 tabular-nums ${prizeSum === 100 ? 'text-emerald-200/85' : 'text-amber-200/90'}`}>
              Total: {prizeSum}%{' '}
              {prizeSum !== 100 ? '— must equal 100%' : '(ready)'}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs text-white/50 uppercase tracking-wide block">
              Scheduled start{' '}
              <span className="normal-case text-white/35">(optional — leave date empty for SNG auto-start)</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-white/40 uppercase tracking-wide block mb-1">Date</span>
                <input
                  type="date"
                  value={scheduledDate}
                  min={minScheduleDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full rounded-lg bg-white/8 border border-white/15 px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/40 [color-scheme:dark]"
                />
              </div>
              <div>
                <span className="text-[10px] text-white/40 uppercase tracking-wide block mb-1">Time (30 min, local)</span>
                <Select
                  value={scheduledTime}
                  onValueChange={setScheduledTime}
                  disabled={!scheduledDate}
                >
                  <SelectTrigger
                    className="w-full h-auto min-h-[42px] rounded-lg bg-white/8 border border-white/15 px-3 py-2 text-white text-sm focus:ring-1 focus:ring-cyan-500/50 disabled:opacity-45 [&_svg]:text-white/60"
                  >
                    <SelectValue placeholder={scheduledDate ? 'Select time' : 'Pick a date first'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60 bg-slate-900 border border-cyan-500/30 text-white shadow-xl z-[200]">
                    {timeOptions.map((o) => (
                      <SelectItem
                        key={o.value}
                        value={o.value}
                        className="focus:bg-cyan-500/15 focus:text-white cursor-pointer"
                      >
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {scheduleError && (
              <p className="text-xs text-red-400">{scheduleError}</p>
            )}
            {scheduledDate ? (
              <button
                type="button"
                onClick={() => {
                  setScheduledDate('');
                  setScheduleError(null);
                }}
                className="text-xs text-cyan-400/90 hover:text-cyan-300 underline-offset-2 hover:underline"
              >
                Clear scheduled start
              </button>
            ) : null}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => {
                setIsPrivate(e.target.checked);
                if (!e.target.checked) setPrivatePin('');
              }}
              className="rounded"
            />
            <span className="text-sm text-white/70">Private (PIN-protected)</span>
          </label>

          {isPrivate && (
            <div>
              <label className="text-xs text-white/50 uppercase tracking-wide block mb-1">
                Room PIN <span className="normal-case text-white/35">(optional — 4–12 digits, or random)</span>
              </label>
              <input
                type="text"
                value={privatePin}
                onChange={(e) => setPrivatePin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="e.g. 1234"
                className="w-full rounded-lg bg-white/8 border border-white/15 px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500/40"
              />
            </div>
          )}

          <div
            className="rounded-lg border border-cyan-500/20 p-3 space-y-2"
            style={{ background: 'rgba(0,0,0,0.2)' }}
          >
            <label className="text-xs text-cyan-200/90 font-semibold block">AI players after create</label>
            <p className="text-[10px] text-white/45 leading-snug">
              Optional. Runs on the game server (bot wallets + DATABASE_URL). They register before the tournament starts.
            </p>
            <input
              type="number"
              min={0}
              max={10}
              value={botsToAdd}
              onChange={(e) => setBotsToAdd(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
              className="w-full rounded-lg bg-white/8 border border-white/15 px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
            />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-white/15 text-white/60 text-sm py-2 hover:border-white/30 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={
              isSubmitting
              || !name.trim()
              || prizeSum !== 100
              || prizePercents.length !== prizeSlotCount
              || (!isFreeroll && parseMorbiusInput(buyIn) <= 0n)
              || (isFreeroll && parseMorbiusInput(guaranteedPool) <= 0n)
            }
            className="flex-1 rounded-lg bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-black font-semibold text-sm py-2 transition-colors"
          >
            {isSubmitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Lobby
// ---------------------------------------------------------------------------

interface PokerTournamentLobbyProps {
  wsClient: BlackjackWebSocketClient | null;
  myAddress?: string;
  /** Called when a tournament's poker table is ready and player should navigate to it. */
  onGoToTable?: (tableId: string, tournamentId: string) => void;
}

export function PokerTournamentLobby({ wsClient, myAddress, onGoToTable }: PokerTournamentLobbyProps) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [tournamentBotsBusyId, setTournamentBotsBusyId] = useState<string | null>(null);

  const meLower = myAddress?.toLowerCase() ?? null;
  const refreshTournamentsRef = useRef<(() => Promise<void>) | null>(null);

  const tournamentHook = usePokerTournament({
    wsClient,
    onTournamentStarted: (tournamentId, tableId) => {
      onGoToTable?.(tableId, tournamentId);
    },
    onTournamentCompleted: (winners) => {
      const myWin = meLower ? winners.find((w) => w.address.toLowerCase() === meLower) : undefined;
      if (myWin) {
        const prizeWei = BigInt(myWin.prizeAmount || '0');
        if (prizeWei > 0n) {
          toast.success(
            `You finished ${tournamentFinishOrdinal(myWin.rank)} — ${formatMorbiusFloor(myWin.prizeAmount)} MORBIUS added to your balance.`,
          );
        } else {
          toast.info(`Tournament complete. You finished ${tournamentFinishOrdinal(myWin.rank)}.`);
        }
      } else if (meLower) {
        toast.info('Tournament complete. You did not cash this time — thanks for playing.');
      }
      void wsClient?.syncBalance().catch(() => {});
      if (meLower && meLower.length === 42) {
        queryClient.invalidateQueries({ queryKey: ['player-server-balance', meLower] });
      }
      void refreshTournamentsRef.current?.();
    },
  });

  refreshTournamentsRef.current = tournamentHook.refreshTournaments;

  const {
    openTournaments,
    isLoadingTournaments,
    refreshTournaments,
    createTournament,
    joinTournament,
    cancelTournament,
    myTableId,
    myTournamentId,
  } = tournamentHook;

  const handleJoin = async (tournamentId: string, pinCode?: string) => {
    if (joiningId) return;
    setJoiningId(tournamentId);
    setJoinError(null);
    setJoinSuccess(null);
    try {
      const result = await joinTournament(tournamentId, pinCode);
      if (result?.autoStarted && result.tableId) {
        onGoToTable?.(result.tableId, tournamentId);
      } else if (result && !result.autoStarted) {
        setJoinSuccess("You're registered! Your seat will be assigned automatically when the tournament starts.");
        await refreshTournaments();
      }
    } catch (err) {
      setJoinError((err as Error).message ?? 'Failed to join');
    } finally {
      setJoiningId(null);
    }
  };

  const handleAddTournamentBots = async (tournamentId: string, numBots: number, pinCode?: string) => {
    if (!myAddress) {
      toast.error('Connect your wallet');
      return;
    }
    setTournamentBotsBusyId(tournamentId);
    setJoinError(null);
    try {
      const { numBots: started } = await requestTournamentBotBootstrap(tournamentId, numBots, myAddress, pinCode);
      toast.success(`Started ${started} tournament bot player(s)`);
      await refreshTournaments();
    } catch (err) {
      const msg = (err as Error).message ?? 'Failed to start tournament bots';
      setJoinError(msg);
      toast.error(msg);
    } finally {
      setTournamentBotsBusyId(null);
    }
  };

  const handleCreate = async (params: CreatePokerTournamentParams, opts: { addBots: number }) => {
    setJoinError(null);
    try {
      const result = await createTournament(params);
      if (!result?.tournamentId) {
        setJoinError('Failed to create tournament');
        return;
      }
      if (params.isPrivate && result.pinCode) {
        toast.message(`Private tournament PIN: ${result.pinCode}`, { duration: 14_000 });
      }
      if (opts.addBots > 0 && myAddress) {
        try {
          const pinForBots = params.isPrivate ? (result.pinCode ?? undefined) : undefined;
          const { numBots: started } = await requestTournamentBotBootstrap(
            result.tournamentId,
            opts.addBots,
            myAddress,
            pinForBots,
          );
          toast.success(`Tournament created — started ${started} bot(s)`);
        } catch (botErr) {
          const bmsg = (botErr as Error).message ?? 'Bots failed to start';
          setJoinError(bmsg);
          toast.error(`${bmsg} You can still use “Add bots” on the tournament card.`);
        }
      } else {
        toast.success('Tournament created');
      }
    } catch (err) {
      setJoinError((err as Error).message ?? 'Failed to create');
    }
  };

  const handleCancel = async (tournamentId: string) => {
    if (cancellingId) return;
    setCancellingId(tournamentId);
    setJoinError(null);
    try {
      await cancelTournament(tournamentId);
      await refreshTournaments();
    } catch (err) {
      setJoinError((err as Error).message ?? 'Failed to cancel');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Poker Tournaments</h2>
        <div className="flex gap-2">
          <button
            onClick={refreshTournaments}
            className="text-xs text-white/40 hover:text-white/70 transition-colors px-2 py-1 rounded-lg border border-white/10 hover:border-white/20"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            + Create SNG
          </button>
        </div>
      </div>

      {/* Error */}
      {joinError && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-2">
          {joinError}
        </div>
      )}

      {/* Registration success */}
      {joinSuccess && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-2 flex items-start justify-between gap-2">
          <span>{joinSuccess}</span>
          <button onClick={() => setJoinSuccess(null)} className="text-green-400/60 hover:text-green-400 shrink-0 text-base leading-none">×</button>
        </div>
      )}

      {/* Go to active tournament */}
      {myTournamentId && myTableId && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/30 px-4 py-3 flex items-center justify-between">
          <span className="text-yellow-300 text-sm font-medium">You are in an active tournament</span>
          <button
            onClick={() => onGoToTable?.(myTableId, myTournamentId)}
            className="text-xs bg-yellow-500 hover:bg-yellow-400 text-black font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            Go to Table →
          </button>
        </div>
      )}

      {/* Tournament list */}
      {isLoadingTournaments ? (
        <div className="text-center text-white/30 text-sm py-8">Loading tournaments…</div>
      ) : openTournaments.length === 0 ? (
        <div className="text-center text-white/30 text-sm py-8">
          No open poker tournaments.<br />
          <span className="text-xs">Create one to get started!</span>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {openTournaments.map((t) => (
            <TournamentCard
              key={t.tournamentId}
              t={t}
              myAddress={myAddress}
              onJoin={handleJoin}
              onCancel={handleCancel}
              onAddTournamentBots={handleAddTournamentBots}
              tournamentBotsBusy={tournamentBotsBusyId === t.tournamentId}
              isJoining={joiningId === t.tournamentId}
              isCancelling={cancellingId === t.tournamentId}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateModal
          creatorAddress={myAddress}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
