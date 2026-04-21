'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { formatEther } from 'viem';
import { AnimatePresence, motion } from 'motion/react';
import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi';
import {
  TournamentListItem,
  PlayerTournamentHistoryItem,
  formatTimeRemaining,
  getDefaultTourCard,
  getExamplePrizeDistribution,
  PRIZE_PRESETS,
  PRIZE_DISTRIBUTION_LABELS,
  PrizeDistributionType,
  TIME_LIMIT_LABELS,
} from '@/lib/tournament-types';
import { getTableThemeInfo, BLACKJACK_IMAGE_BACKGROUNDS } from '@/app/BLACKJACK/constants';
import type { TableThemeInfo } from '@/hooks/use-blackjack-tables';
import { FreerollList } from './FreerollList';
import { TournamentCancelReclaim } from './TournamentCancelReclaim';
import { ConfirmActionCard } from '@/components/shared/ConfirmActionCard';
import { useOutsideClick } from '@/hooks/use-outside-click';
import type { BlackjackWebSocketClient, ChatMessagePayload } from '@/lib/websocket-client';
import { TOURNAMENT_PRIZE_ESCROW_ADDRESS } from '@/lib/contracts';
import { tournamentPrizeEscrowV2Abi } from '@/abi/tournament-prize-escrow-v2';
import { tournamentIdToBytes32 } from '@/lib/tournament-id-bytes32';
import { ERC20_ABI } from '@/abi/erc20';
import { useTokenInfo, type TokenInfo } from '@/hooks/use-token-info';
import { TokenWithLogo } from '@/components/Creators/TokenWithLogo';
import { Theme } from '@/lib/theme';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface LeaderboardEntry {
  entry_id: string;
  player_address: string;
  chips_remaining: number;
  hands_played: number;
  highest_chip_count: number;
  status: string;
  current_rank: number;
}

type LobbyTab = 'join' | 'my' | 'freeroll' | 'history';

interface TournamentBrowserProps {
  isOpen: boolean;
  /** When opening, switch to this tab (e.g. 'history' to open directly to My History) */
  initialTab?: LobbyTab;
  onClose: () => void;
  onJoin: (tournament: TournamentListItem) => void;
  onCreateNew: () => void;
  onRefresh: () => Promise<TournamentListItem[]>;
  onFetchLeaderboard?: (tournamentId: string) => Promise<LeaderboardEntry[]>;
  tournaments: TournamentListItem[];
  isLoading: boolean;
  /** When true, a join (approve + on-chain + server) is in progress — show on Join button */
  isJoinLoading?: boolean;
  playerBalance: bigint;
  /** For "My Tournaments" tab: filter by creator address */
  playerAddress?: string | null;
  /** Required to show Freeroll tab; when user joins a freeroll this is called */
  wsClient?: BlackjackWebSocketClient | null;
  onFreerollJoined?: (tournamentId: string) => void;
  /** My History tab: past tournaments this player entered */
  tournamentHistory?: PlayerTournamentHistoryItem[];
  isHistoryLoading?: boolean;
  onFetchHistory?: () => Promise<void | PlayerTournamentHistoryItem[]>;
  /** When provided, used to resolve table theme (kind + id) to label/src (e.g. from API tables). */
  getThemeInfo?: (theme: { kind: 'image' | 'video'; id: string }) => TableThemeInfo;
  /** When player is already in a tournament, pass its ID so we show "Resume" instead of "Join" */
  currentTournamentId?: string | null;
  /** Unregister from tournament during registration (MORBIUS platform only) */
  onUnregister?: (tournamentId: string) => Promise<boolean>;
}

// ============================
// Fund Tournament Escrow Modal (anyone can fund)
// ============================
const ESCROW_ZERO = '0x0000000000000000000000000000000000000000';
const PULSECHAIN = { id: 369, name: 'PulseChain', nativeCurrency: { name: 'Pulse', symbol: 'PLS', decimals: 18 }, rpcUrls: { default: { http: ['https://rpc.pulsechain.com'] } } };

/** For custom-token tournaments: use escrow total when funded, else prize_pool from DB. */
function getEffectivePrizeAmount(t: TournamentListItem): string {
  if (t.prizeTokenAddress && BigInt(t.escrowTotalDeposited ?? '0') > 0n) {
    return t.escrowTotalDeposited ?? '0';
  }
  return t.prizePool ?? '0';
}

function FundTournamentEscrowModal({
  tournament,
  onClose,
  onSuccess,
}: {
  tournament: TournamentListItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const tokenInfo = useTokenInfo(tournament.prizeTokenAddress);
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [step, setStep] = useState<'idle' | 'approving' | 'approved' | 'depositing' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const amountWei = BigInt(tournament.prizePool);
  const decimals = tournament.prizeTokenDecimals ?? 18;
  const token = (tournament.prizeTokenAddress ?? '').trim() as `0x${string}`;
  const escrow = TOURNAMENT_PRIZE_ESCROW_ADDRESS;
  const isEscrowConfigured = escrow !== ESCROW_ZERO;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: token || undefined,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address && escrow ? [address, escrow as `0x${string}`] : undefined,
    query: { enabled: !!address && !!token && !!escrow && amountWei > 0n },
  });

  useEffect(() => {
    if (step === 'idle' && allowance !== undefined && allowance >= amountWei && amountWei > 0n) {
      setStep('approved');
    }
  }, [step, allowance, amountWei]);

  const handleApprove = async () => {
    if (!address || !token || amountWei <= 0n) return;
    setError(null);
    setStep('approving');
    try {
      const hash = await writeContractAsync({
        address: token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [escrow, amountWei],
        account: address,
        chain: PULSECHAIN,
        maxPriorityFeePerGas: 200_000n, // PulseChain tip
      });
      if (publicClient && hash) {
        try {
          await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
        } catch {
          // Tx was broadcast; if wait times out or RPC fails, still proceed so user can deposit
        }
      }
      refetchAllowance();
      setStep('approved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed');
      setStep('idle');
    }
  };

  const handleDeposit = async () => {
    if (!address || !token || amountWei <= 0n) return;
    setError(null);
    setStep('depositing');
    try {
      const idBytes32 = tournamentIdToBytes32(tournament.id);
      const hash = await writeContractAsync({
        address: escrow as `0x${string}`,
        abi: tournamentPrizeEscrowV2Abi,
        functionName: 'depositPrizePool',
        args: [idBytes32, token, amountWei],
        account: address,
        chain: PULSECHAIN,
        maxPriorityFeePerGas: 200_000n, // PulseChain tip
      });
      if (publicClient && hash) {
        try {
          await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
        } catch {
          // Tx was broadcast; proceed to close
        }
      }
      setStep('done');
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deposit failed');
      setStep('approved');
    }
  };

  const humanAmount = Number(amountWei / BigInt(10 ** Math.max(0, decimals - 4))) / 10000;
  const symbol = tokenInfo?.symbol ?? '???';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gradient-to-b from-gray-900 to-gray-950 rounded-2xl border border-cyan-500/30 shadow-2xl max-w-sm w-full overflow-hidden">
        <div className="bg-gradient-to-r from-cyan-600 to-blue-600 p-4 text-center">
          <h3 className="text-lg font-bold text-white">Fund Prize Pool</h3>
          <p className="text-cyan-100 text-sm mt-0.5">{tournament.name}</p>
        </div>
        <div className="p-4 space-y-4">
          {!isEscrowConfigured ? (
            <p className="text-amber-400 text-xs">Prize escrow is not configured.</p>
          ) : (
            <>
              <p className="text-gray-400 text-sm">
                Required: <span className="text-white font-semibold">{humanAmount.toLocaleString()} {symbol}</span>
              </p>
              {error && <p className="text-red-400 text-xs">{error}</p>}
              {step === 'idle' && (
                <button onClick={handleApprove} className="w-full py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-medium hover:from-cyan-500 hover:to-blue-500">
                  Approve Token
                </button>
              )}
              {(step === 'approving' || step === 'approved') && (
                <>
                  {step === 'approving' && (
                    <div className="flex flex-col gap-2 py-2">
                      <div className="flex items-center gap-2 text-cyan-300 text-sm">
                        <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        Confirm in wallet...
                      </div>
                      <button
                        type="button"
                        onClick={() => setStep('approved')}
                        className="text-xs text-cyan-400/80 hover:text-cyan-300 hover:"
                      >
                        Already approved? Proceed to deposit
                      </button>
                    </div>
                  )}
                  {step === 'approved' && (
                    <button onClick={handleDeposit} className={`w-full py-2.5 rounded-lg ${Theme.cyan.gradient.button} ${Theme.cyan.gradient.buttonHover} text-white text-sm font-medium`}>
                      Deposit to Escrow
                    </button>
                  )}
                </>
              )}
              {step === 'depositing' && (
                <div className="flex items-center gap-2 py-2 text-cyan-300 text-sm">
                  <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Confirming deposit...
                </div>
              )}
            </>
          )}
          <button onClick={onClose} className="w-full py-2 rounded-lg border border-gray-600 text-gray-300 text-sm hover:bg-gray-800">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================
// Dynamic tournament timer
// ============================
// Formats a millisecond duration into a short human string
function formatMs(ms: number): string {
  if (ms <= 0) return '0m';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

// Component for countdown timer badge
function CountdownTimer({ targetDate, label, color, size = 'small' }: { targetDate: string | null | undefined; label: string; color: string; size?: 'small' | 'medium' }) {
  const [, setTick] = useState(0);
  
  useEffect(() => {
    if (!targetDate) return;
    const target = new Date(targetDate).getTime();
    const update = () => {
      const now = Date.now();
      if (now < target) {
        setTick((v) => v + 1);
      }
    };
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);
  
  if (!targetDate) return null;
  const target = new Date(targetDate).getTime();
  const now = Date.now();
  const remaining = Math.max(0, target - now);
  
  if (remaining === 0 || now >= target) return null;
  
  const textSize = size === 'small' ? 'text-[9px]' : 'text-[10px]';
  const displayText = label ? `${label}: ${formatMs(remaining)}` : formatMs(remaining);
  
  return (
    <span className={`px-2 py-0.5 rounded-full ${color} text-white ${textSize} font-medium shadow-lg`}>
      {displayText}
    </span>
  );
}

interface TimerInput {
  endsAt: string | null;
  tournamentType?: string | null;
  scheduledStartAt?: string | null;
  registrationOpensAt?: string | null;
  currentPhase?: string | null;
  status?: 'registration' | 'active' | 'completed' | 'cancelled';
  entryCount?: number;
  minPlayers?: number;
}

function useTournamentTimer(t: TimerInput): { label: string; color: string } | null {
  const [, setTick] = useState(0);

  // Find the nearest future timestamp we need to count down to
  const targetTs = useMemo(() => {
    const now = Date.now();
    const candidates: number[] = [];
    if (t.endsAt) candidates.push(new Date(t.endsAt).getTime());
    if (t.scheduledStartAt) candidates.push(new Date(t.scheduledStartAt).getTime());
    if (t.registrationOpensAt) candidates.push(new Date(t.registrationOpensAt).getTime());
    // Pick the earliest future timestamp, or the most recent past one for "Ended" display
    const future = candidates.filter((c) => c > now);
    if (future.length > 0) return Math.min(...future);
    if (candidates.length > 0) return Math.max(...candidates);
    return null;
  }, [t.endsAt, t.scheduledStartAt, t.registrationOpensAt]);

  useEffect(() => {
    if (targetTs === null) return;
    const getInterval = () => {
      const remaining = targetTs - Date.now();
      return remaining < 5 * 60 * 1000 ? 1000 : 60_000;
    };
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        setTick((v) => v + 1);
        if (Date.now() < targetTs) schedule();
      }, getInterval());
    };
    schedule();
    return () => clearTimeout(timer);
  }, [targetTs]);

  // Compute display state
  const now = Date.now();
  const isFreeroll = t.tournamentType === 'freeroll';

  if (isFreeroll) {
    const regOpens = t.registrationOpensAt ? new Date(t.registrationOpensAt).getTime() : null;
    const startAt = t.scheduledStartAt ? new Date(t.scheduledStartAt).getTime() : null;
    const phase = t.currentPhase;

    // Before registration opens
    if (regOpens && now < regOpens) {
      return { label: `Reg opens ${formatMs(regOpens - now)}`, color: 'bg-blue-500/90' };
    }

    // Registration phase — countdown to start
    if (phase === 'registration' && startAt && now < startAt) {
      return { label: `Starts in ${formatMs(startAt - now)}`, color: 'bg-cyan-500/90' };
    }

    // Active — show time remaining via endsAt or calculated end
    if (phase === 'active') {
      const endsAtMs = t.endsAt ? new Date(t.endsAt).getTime() : null;
      // Freerolls without explicit endsAt: compute from scheduledStartAt + durationMinutes if available
      if (endsAtMs && now < endsAtMs) {
        const rem = endsAtMs - now;
        if (rem < 5 * 60 * 1000) return { label: `${formatMs(rem)} left`, color: 'bg-red-500/90' };
        if (rem < 30 * 60 * 1000) return { label: `${formatMs(rem)} left`, color: 'bg-orange-500/90' };
        return { label: `${formatMs(rem)} left`, color: 'bg-cyan-500/90' };
      }
      return { label: 'Live', color: 'bg-cyan-500/90' };
    }

    if (phase === 'completed') {
      return { label: 'Completed', color: 'bg-gray-500/90' };
    }

    // Fallback for freerolls with a start time in the future
    if (startAt && now < startAt) {
      return { label: `Starts ${formatMs(startAt - now)}`, color: 'bg-cyan-500/90' };
    }
  }

  // Standard tournaments — registration shows player count, active shows endsAt
  if (t.status === 'registration') {
    const min = t.minPlayers ?? 2;
    const count = t.entryCount ?? 0;
    return { label: `${count}/${min} players`, color: 'bg-blue-500/90' };
  }

  if (!t.endsAt) return null;

  const endTime = new Date(t.endsAt).getTime();
  const remaining = endTime - now;
  if (remaining <= 0) return { label: 'Ended', color: 'bg-red-500/90' };

  const text = formatMs(remaining);
  if (remaining < 5 * 60 * 1000) return { label: `${text} left`, color: 'bg-red-500/90' };
  if (remaining < 30 * 60 * 1000) return { label: `${text} left`, color: 'bg-orange-500/90' };
  return { label: `${text} left`, color: 'bg-amber-500/90' };
}

// ============================
// Truncate address helper
// ============================
function truncAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ============================
// Section Header
// ============================
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-gray-300 text-sm font-semibold mb-2 flex items-center gap-2 border-b border-gray-700 pb-1">
      {children}
    </h4>
  );
}

// ============================
// Tournament Comments
// ============================
function TournamentComments({
  tournamentId,
  wsClient,
  isParticipant,
}: {
  tournamentId: string;
  wsClient: BlackjackWebSocketClient | null;
  isParticipant: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessagePayload[]>([]);
  const [input, setInput] = useState('');
  const [joined, setJoined] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const roomId = `tournament:${tournamentId}`;

  useEffect(() => {
    if (!wsClient || !isParticipant) return;

    let mounted = true;

    const joinChat = async () => {
      try {
        const result = await wsClient.joinRoom(roomId);
        if (mounted) {
          setMessages(result.recentMessages || []);
          setJoined(true);
        }
      } catch {
        // Participant check may fail — that's OK
      }
    };

    const handleMessage = (payload: ChatMessagePayload) => {
      if (payload.roomId === roomId) {
        setMessages((prev) => [...prev, payload]);
      }
    };

    wsClient.on('chat_message', handleMessage);
    joinChat();

    return () => {
      mounted = false;
      wsClient.off('chat_message');
    };
  }, [wsClient, isParticipant, roomId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!wsClient || !input.trim() || !joined) return;
    wsClient.sendChatMessage(roomId, input.trim());
    setInput('');
  };

  if (!isParticipant) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
        Join tournament to comment
      </div>
    );
  }

  return (
    <div>
      <div className="max-h-40 overflow-y-auto space-y-1.5 mb-2 scrollbar-thin">
        {messages.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-2">No comments yet</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="flex gap-2 text-xs">
              <span className="text-cyan-400 font-mono shrink-0">
                {m.displayName || (m.senderAddress ? truncAddr(m.senderAddress) : 'System')}
              </span>
              <span className="text-gray-300 break-all">{m.text}</span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a comment..."
          maxLength={500}
          className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ============================
// Expanded Card Detail View
// ============================
function ExpandedCardContent({
  tournament,
  tokenInfo,
  playerBalance,
  playerAddress,
  wsClient,
  onJoin,
  onFundNow,
  onUnregister,
  onClose,
  entries,
  loadingEntries,
  getThemeInfo,
  currentTournamentId,
  isJoinLoading,
}: {
  tournament: TournamentListItem;
  tokenInfo: TokenInfo | null;
  playerBalance: bigint;
  playerAddress?: string | null;
  wsClient?: BlackjackWebSocketClient | null;
  onJoin: (tournament: TournamentListItem) => void;
  onFundNow?: (tournament: TournamentListItem) => void;
  onUnregister?: (tournamentId: string) => Promise<boolean>;
  onClose?: () => void;
  entries: LeaderboardEntry[];
  loadingEntries: boolean;
  getThemeInfo?: (theme: { kind: 'image' | 'video'; id: string }) => TableThemeInfo;
  currentTournamentId?: string | null;
  isJoinLoading?: boolean;
}) {
  const buyInBigInt = BigInt(tournament.buyInAmount);
  const canAfford = playerBalance >= buyInBigInt;
  const isFull = tournament.maxPlayers !== null && tournament.entryCount >= tournament.maxPlayers;
  const isAlreadyIn = Boolean(currentTournamentId && tournament.id === currentTournamentId);
  const isCustomToken = Boolean(tournament.prizeTokenAddress);
  const notFunded = isCustomToken && !tournament.escrowFunded;

  // Determine if current player is a participant
  const isParticipant = useMemo(() => {
    if (!playerAddress) return false;
    const norm = playerAddress.toLowerCase();
    return entries.some((e) => e.player_address.toLowerCase() === norm);
  }, [entries, playerAddress]);

  const canUnregister =
    tournament.status === 'registration' &&
    isParticipant &&
    !isCustomToken &&
    tournament.onChainTournamentId == null &&
    onUnregister != null;

  // Prize distribution
  const prizePreset = PRIZE_PRESETS.find((p) => p.id === tournament.prizeDistributionType);
  let prizePercentages = prizePreset?.percentages ?? [56, 20, 10, 2, 2, 2, 2, 2, 2, 2];
  if (!Array.isArray(prizePercentages) || prizePercentages.length === 0) {
    prizePercentages = [56, 20, 10, 2, 2, 2, 2, 2, 2, 2];
  }
  const prizePool = BigInt(getEffectivePrizeAmount(tournament));
  const prizeDistribution = getExamplePrizeDistribution(prizePool, prizePercentages);
  const decimals = tournament.prizeTokenDecimals ?? 18;

  // Table theme info (use hook resolver when provided, else static constants)
  const themeInfo = getThemeInfo ? getThemeInfo(tournament.tableTheme) : getTableThemeInfo(tournament.tableTheme);

  // Time limit label
  const timeLimitLabel =
    tournament.timeLimitMinutes === null
      ? TIME_LIMIT_LABELS['null']
      : TIME_LIMIT_LABELS[tournament.timeLimitMinutes] ?? `${tournament.timeLimitMinutes}m`;

  const formatPrize = (amount: bigint) => {
    if (tournament.prizeTokenAddress) {
      return `${Number(amount / BigInt(10 ** Math.max(0, decimals - 4))) / 10000} ${tokenInfo?.symbol || '???'}`;
    }
    return `${Number(formatEther(amount)).toLocaleString()} MORBIUS`;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5 [scrollbar-width:thin]">
        {/* a. Overview Section */}
        <div>
          <SectionHeader>Overview</SectionHeader>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <div className="text-gray-500">Creator</div>
            <div className="text-gray-200 font-mono">
              {tournament.creatorAddress ? truncAddr(tournament.creatorAddress) : 'System'}
            </div>
            <div className="text-gray-500">Type</div>
            <div className="text-gray-200">{tournament.tournamentType === 'freeroll' ? 'Freeroll' : 'Standard'}</div>
            <div className="text-gray-500">Private</div>
            <div className="text-gray-200">{tournament.isPrivate ? 'Yes' : 'No'}</div>
            <div className="text-gray-500">Time Limit</div>
            <div className="text-gray-200">{timeLimitLabel}</div>
            <div className="text-gray-500">Max Hands</div>
            <div className="text-gray-200">{tournament.maxHands}</div>
            <div className="text-gray-500">Starting Chips</div>
            <div className="text-gray-200">{tournament.startingChips.toLocaleString()}</div>
            <div className="text-gray-500">Players</div>
            <div className="text-gray-200">
              {tournament.entryCount}
              {tournament.status === 'registration'
                ? ` / ${tournament.minPlayers ?? 2} (min to start)`
                : tournament.maxPlayers
                  ? ` / ${tournament.maxPlayers}`
                  : ''}
            </div>
            {isCustomToken && (
              <>
                <div className="text-gray-500">Prize pool</div>
                <div className="text-gray-200 flex items-center gap-2 flex-wrap">
                  {notFunded ? (
                    <>
                      <span className="text-amber-400 font-medium">Not Funded</span>
                      {onFundNow && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onFundNow(tournament); }}
                          className="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium"
                        >
                          Fund Now
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="text-cyan-400 font-medium">
                      {(() => {
                        const amt = BigInt(getEffectivePrizeAmount(tournament));
                        const dec = tournament.prizeTokenDecimals ?? 18;
                        const human = Number(amt / BigInt(10 ** dec)).toLocaleString();
                        return `${human} ${tokenInfo?.symbol ?? 'token'}`;
                      })()}
                    </span>
                  )}
                </div>
              </>
            )}
            <div className="text-gray-500">Created</div>
            <div className="text-gray-200">
              {new Date(tournament.createdAt).toLocaleDateString()}
            </div>
            {tournament.tournamentType === 'freeroll' && tournament.registrationOpensAt && (
              <>
                <div className="text-gray-500">Registration Opens</div>
                <div className="text-gray-200 flex items-center gap-2">
                  <span>{new Date(tournament.registrationOpensAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <CountdownTimer targetDate={tournament.registrationOpensAt} label="" color="bg-blue-500/80" size="medium" />
                </div>
              </>
            )}
            {tournament.tournamentType === 'freeroll' && tournament.scheduledStartAt && (
              <>
                <div className="text-gray-500">Scheduled Start</div>
                <div className="text-gray-200 flex items-center gap-2">
                  <span>{new Date(tournament.scheduledStartAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <CountdownTimer targetDate={tournament.scheduledStartAt} label="" color="bg-cyan-500/80" size="medium" />
                </div>
              </>
            )}
            {tournament.tournamentType === 'freeroll' && tournament.durationMinutes && (
              <>
                <div className="text-gray-500">Duration</div>
                <div className="text-gray-200">
                  {tournament.durationMinutes >= 60 ? `${Math.floor(tournament.durationMinutes / 60)}h ${tournament.durationMinutes % 60}m` : `${tournament.durationMinutes}m`}
                </div>
              </>
            )}
            {tournament.tournamentType === 'freeroll' && tournament.currentPhase && (
              <>
                <div className="text-gray-500">Phase</div>
                <div className="text-gray-200 capitalize">{tournament.currentPhase.replace(/_/g, ' ')}</div>
              </>
            )}
          </div>
        </div>

        {/* b. Prize Structure Section */}
        <div>
          <SectionHeader>Prize Structure</SectionHeader>
          <p className="text-xs text-gray-400 mb-2">
            {PRIZE_DISTRIBUTION_LABELS[tournament.prizeDistributionType as PrizeDistributionType] || tournament.prizeDistributionType.replace(/_/g, ' ')}
            {tournament.prizeTokenAddress && tokenInfo && (
              <span className="ml-2 inline-flex items-center gap-1">
                {tokenInfo.logoUrl && (
                  <img src={tokenInfo.logoUrl} alt="" className="w-3.5 h-3.5 rounded-full inline" />
                )}
                <span className="text-cyan-400">{tokenInfo.name}</span>
                <span className="font-mono text-gray-600 text-[10px]">
                  {truncAddr(tournament.prizeTokenAddress)}
                </span>
              </span>
            )}
          </p>
          {prizeDistribution.length > 0 ? (
            <div className="rounded-lg overflow-hidden border border-gray-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-800/80 text-gray-400">
                    <th className="text-left px-3 py-1.5">Rank</th>
                    <th className="text-right px-3 py-1.5">%</th>
                    <th className="text-right px-3 py-1.5">Est. Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {prizeDistribution.map((d) => (
                    <tr
                      key={d.rank}
                      className={`border-t border-gray-700/50 ${
                        d.rank === 1
                          ? 'bg-cyan-500/5'
                          : d.rank === 2
                          ? 'bg-gray-400/5'
                          : d.rank === 3
                          ? 'bg-orange-500/5'
                          : ''
                      }`}
                    >
                      <td className="px-3 py-1.5 text-gray-300">
                        {d.rank === 1 ? '1st' : d.rank === 2 ? '2nd' : d.rank === 3 ? '3rd' : `${d.rank}th`}
                      </td>
                      <td className="px-3 py-1.5 text-right text-gray-300">{d.percentage}%</td>
                      <td className="px-3 py-1.5 text-right text-cyan-400 font-mono">
                        {formatPrize(d.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-xs">No prize pool yet</p>
          )}
        </div>

        {/* c. Table Theme Preview */}
        <div>
          <SectionHeader>Table Theme</SectionHeader>
          <div className="flex items-center gap-3">
            <div className="w-24 h-16 rounded-lg overflow-hidden border border-gray-700 bg-gray-800 shrink-0">
              <img
                src={themeInfo.kind === 'video' ? BLACKJACK_IMAGE_BACKGROUNDS[0].src : themeInfo.src}
                alt={themeInfo.label}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-gray-300 text-sm">{themeInfo.label}</span>
          </div>
        </div>

        {/* d. Players Section */}
        <div>
          <SectionHeader>Players ({entries.length})</SectionHeader>
          {loadingEntries ? (
            <div className="flex justify-center py-4">
              <svg className="animate-spin h-5 w-5 text-cyan-400" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
          ) : entries.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-2">No players yet</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
              {entries.map((entry, index) => (
                <div
                  key={entry.entry_id}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs ${
                    index === 0
                      ? 'bg-cyan-500/10 border border-cyan-500/30'
                      : index === 1
                      ? 'bg-gray-400/10 border border-gray-400/30'
                      : index === 2
                      ? 'bg-orange-500/10 border border-orange-500/30'
                      : 'bg-gray-800/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        index === 0
                          ? 'bg-cyan-500 text-black'
                          : index === 1
                          ? 'bg-gray-400 text-black'
                          : index === 2
                          ? 'bg-orange-500 text-black'
                          : 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {entry.current_rank || index + 1}
                    </span>
                    <span className="text-gray-300 font-mono">
                      {truncAddr(entry.player_address)}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        entry.status === 'playing'
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : entry.status === 'busted'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-blue-500/20 text-blue-400'
                      }`}
                    >
                      {entry.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-400">
                    <span>{entry.hands_played} hands</span>
                    <span className="text-cyan-400 font-semibold">
                      {entry.chips_remaining.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* f. Creator Actions (Cancel/Reclaim) */}
        {tournament.creatorAddress && playerAddress && 
         tournament.creatorAddress.toLowerCase() === playerAddress.toLowerCase() && (
          <div>
            <SectionHeader>Creator Actions</SectionHeader>
            <TournamentCancelReclaim
              tournamentId={tournament.id}
              tournamentName={tournament.name}
              status={tournament.status as 'registration' | 'active' | 'completed' | 'cancelled'}
              creatorAddress={tournament.creatorAddress}
              playerAddress={playerAddress}
              prizeTokenAddress={tournament.prizeTokenAddress ?? tournament.escrowToken ?? undefined}
              prizePool={getEffectivePrizeAmount(tournament)}
              entryCount={tournament.entryCount}
              onChainTournamentId={tournament.onChainTournamentId ?? undefined}
              wsClient={wsClient ?? null}
            />
          </div>
        )}

        {/* g. Share Section */}
        <div>
          <SectionHeader>Share</SectionHeader>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const url = `${window.location.origin}/BLACKJACK?tournament=${tournament.id}`;
                navigator.clipboard.writeText(url);
              }}
              className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium transition-colors"
            >
              Copy Link
            </button>
            <button
              onClick={() => {
                const url = `${window.location.origin}/BLACKJACK?tournament=${tournament.id}`;
                const text = `Join "${tournament.name}" tournament on MORBlotto! ${url}`;
                window.open(
                  `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
                  '_blank'
                );
              }}
              className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium transition-colors"
            >
              Share on X
            </button>
          </div>
        </div>

        {/* h. Comments Section */}
        <div>
          <SectionHeader>Comments</SectionHeader>
          <TournamentComments
            tournamentId={tournament.id}
            wsClient={wsClient ?? null}
            isParticipant={isParticipant}
          />
        </div>
      </div>

      {/* i. Join / Fund / Resume / Leave Button - sticky bottom */}
      <div className="p-4 border-t border-gray-700 bg-gray-900/80 space-y-2">
        {canUnregister && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (!onUnregister) return;
              const success = await onUnregister(tournament.id);
              if (success && onClose) onClose();
            }}
            className="w-full py-2.5 rounded-xl font-medium bg-gray-600 hover:bg-gray-500 text-white border border-gray-500"
          >
            Leave Tournament (Refund)
          </button>
        )}
        {notFunded && onFundNow && !isAlreadyIn && (
          <button
            onClick={(e) => { e.stopPropagation(); onFundNow(tournament); }}
            className="w-full py-3 rounded-xl font-semibold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-lg"
          >
            Fund Prize Pool
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (!isJoinLoading) onJoin(tournament);
          }}
          disabled={isJoinLoading || (!isAlreadyIn && (!canAfford || isFull || notFunded))}
          className={`w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
            isAlreadyIn || (canAfford && !isFull && !notFunded)
              ? `${Theme.cyan.gradient.button} ${Theme.cyan.gradient.buttonHover} text-white`
              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          {isJoinLoading ? (
            <>
              <svg className="animate-spin h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Confirm in wallet...</span>
            </>
          ) : isAlreadyIn ? (
            'Resume Tournament'
          ) : notFunded ? (
            'Fund pool first'
          ) : isFull ? (
            'Tournament Full'
          ) : !canAfford ? (
            'Insufficient Balance'
          ) : (
            'Join Tournament'
          )}
        </button>
      </div>
    </div>
  );
}

// ============================
// Compact Tournament Card
// ============================
function TournamentCard({
  tournament,
  playerBalance,
  onJoin,
  onSelect,
  onFundNow,
}: {
  tournament: TournamentListItem;
  playerBalance: bigint;
  onJoin: (tournament: TournamentListItem) => void;
  onSelect: (tournament: TournamentListItem) => void;
  onFundNow?: (tournament: TournamentListItem) => void;
}) {
  const isCustomToken = Boolean(tournament.prizeTokenAddress || (tournament.escrowToken && BigInt(tournament.escrowTotalDeposited ?? '0') > 0n));
  const prizeTokenAddress = tournament.prizeTokenAddress || tournament.escrowToken || null;
  const tokenInfo = useTokenInfo(prizeTokenAddress);
  const timer = useTournamentTimer(tournament);

  const buyInBigInt = BigInt(tournament.buyInAmount);
  const tournamentImage = tournament.customImage || getDefaultTourCard(tournament.id);
  const notFunded = isCustomToken && !tournament.escrowFunded;

  return (
    <motion.div
      layoutId={`card-${tournament.id}`}
      onClick={() => onSelect(tournament)}
      className="rounded-xl border border-gray-600 hover:border-cyan-500/30 transition-all overflow-hidden cursor-pointer group"
      style={Theme.panel.base}
    >
      {/* Tournament Image (3:2 aspect ratio) */}
      <motion.div layoutId={`image-${tournament.id}`} className="relative">
        <div className="aspect-[3/2] overflow-hidden">
          <img
            src={tournamentImage}
            alt={tournament.name}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent">
            {/* Prize token badge - center: custom token when set, else MORBIUS */}
            <div className="absolute inset-0 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-black/60 backdrop-blur-sm border border-white/10">
                <TokenWithLogo address={prizeTokenAddress} logoSize="lg" variant="symbol" className="text-white hover:text-cyan-400" />
              </div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-3">
              <motion.h3
                layoutId={`title-${tournament.id}`}
                className="text-white font-bold text-lg truncate"
              >
                {tournament.name}
              </motion.h3>
              {tournament.creatorAddress && (
                <p className="text-gray-400 text-xs">
                  by {truncAddr(tournament.creatorAddress)}
                </p>
              )}
            </div>
          </div>

          {/* Badges top-right */}
          <div className="absolute top-2.5 right-2.5 flex flex-wrap gap-1.5 justify-end">
            {tournament.status === 'registration' && (
              <span className="px-2 py-0.5 rounded-full bg-blue-500/90 text-white text-[10px] font-medium shadow-lg">
                Registration
              </span>
            )}
            {tournament.tournamentType === 'freeroll' && (
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/90 text-white text-[10px] font-medium shadow-lg">
                Freeroll
              </span>
            )}
            {tournament.isPrivate && (
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/70 text-white text-[10px] font-medium shadow-lg">
                Private
              </span>
            )}
            {timer && (
              <span className={`px-2 py-0.5 rounded-full ${timer.color} text-white text-[10px] font-medium shadow-lg`}>
                {timer.label}
              </span>
            )}
          </div>

          {/* Freeroll timers - registration opens and game starts */}
          {tournament.tournamentType === 'freeroll' && (
            <div className="absolute bottom-2.5 left-2.5 flex flex-col gap-1">
              <CountdownTimer targetDate={tournament.registrationOpensAt} label="Reg" color="bg-blue-500/80" />
              <CountdownTimer targetDate={tournament.scheduledStartAt} label="Start" color="bg-cyan-500/80" />
            </div>
          )}

          {/* Quick stats top-left */}
          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 text-cyan-400 text-[10px] font-bold">
              <img src="/morbius/MorbiusLogo-2.svg" alt="" className="w-3.5 h-3.5 object-contain shrink-0" />
              {Number(formatEther(buyInBigInt)).toLocaleString()} MORBIUS
            </span>
            <span className="px-2 py-0.5 rounded-full bg-black/60 text-cyan-400 text-[10px] font-bold">
              {tournament.entryCount}{tournament.maxPlayers ? `/${tournament.maxPlayers}` : ''} players
            </span>
          </div>
        </div>
      </motion.div>

      {/* Quick info bar */}
      <div className="px-3 py-2 flex items-center justify-between text-xs flex-wrap gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-gray-400">Pool: </span>
          {isCustomToken ? (
            notFunded ? (
              <>
                <span className="text-amber-400 font-semibold">Not Funded</span>
                {onFundNow && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onFundNow(tournament); }}
                    className="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-[10px] font-medium"
                  >
                    Fund Now
                  </button>
                )}
              </>
            ) : (
              <span className="text-cyan-400 font-semibold">
                {(() => {
                  const amt = BigInt(getEffectivePrizeAmount(tournament));
                  const decimals = tournament.prizeTokenDecimals ?? 18;
                  const human = Number(amt / BigInt(10 ** decimals)).toLocaleString();
                  return `${human} ${tokenInfo?.symbol ?? 'token'}`;
                })()}
              </span>
            )
          ) : (
            <span className="text-cyan-400 font-semibold">
              {Number(formatEther(BigInt(getEffectivePrizeAmount(tournament)))).toLocaleString()} MORBIUS
            </span>
          )}
        </div>
        <span className="text-gray-500">
          {PRIZE_DISTRIBUTION_LABELS[tournament.prizeDistributionType as PrizeDistributionType] ?? tournament.prizeDistributionType.replace(/_/g, ' ')}
        </span>
      </div>
    </motion.div>
  );
}

// ============================
// Expanded Card Overlay
// ============================
function ExpandedCard({
  tournament,
  onClose,
  onJoin,
  onFundNow,
  onUnregister,
  playerBalance,
  playerAddress,
  wsClient,
  getThemeInfo,
  currentTournamentId,
  isJoinLoading,
}: {
  tournament: TournamentListItem;
  onClose: () => void;
  onJoin: (tournament: TournamentListItem) => void;
  onFundNow?: (tournament: TournamentListItem) => void;
  onUnregister?: (tournamentId: string) => Promise<boolean>;
  playerBalance: bigint;
  playerAddress?: string | null;
  wsClient?: BlackjackWebSocketClient | null;
  getThemeInfo?: (theme: { kind: 'image' | 'video'; id: string }) => TableThemeInfo;
  currentTournamentId?: string | null;
  isJoinLoading?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const prizeTokenAddress = tournament.prizeTokenAddress || tournament.escrowToken || null;
  const tokenInfo = useTokenInfo(prizeTokenAddress);
  const timer = useTournamentTimer(tournament);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [pendingJoin, setPendingJoin] = useState<TournamentListItem | null>(null);

  const tournamentImage = tournament.customImage || getDefaultTourCard(tournament.id);

  useOutsideClick(ref as React.RefObject<HTMLDivElement>, onClose);

  // Escape key to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = 'auto';
    };
  }, [onClose]);

  // Fetch entries
  useEffect(() => {
    if (!wsClient) {
      setLoadingEntries(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const result = await wsClient.sendRequest('tournament_entries_list', { tournamentId: tournament.id });
        if (!cancelled && result?.entries) {
          setEntries(result.entries);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoadingEntries(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wsClient, tournament.id]);

  return (
    <div className="fixed inset-0 grid place-items-center z-[100] p-4">
      {/* Close button - mobile */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.05 } }}
        className="absolute top-4 right-4 z-[110] flex items-center justify-center bg-gray-800 border border-gray-600 rounded-full w-8 h-8 text-white hover:bg-gray-700"
        onClick={onClose}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </motion.button>

      <motion.div
        layoutId={`card-${tournament.id}`}
        ref={ref}
        className="w-full max-w-lg h-full max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ ...Theme.panel.base, border: `1px solid ${Theme.cyan.rgba.border}` }}
      >
        {/* Image header */}
        <motion.div layoutId={`image-${tournament.id}`} className="relative shrink-0">
          <div className="aspect-[3/1] overflow-hidden">
            <img
              src={tournamentImage}
              alt={tournament.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-black/40 to-transparent" />
            {/* Prize token badge - center: custom token when set, else MORBIUS */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-black/60 backdrop-blur-sm border border-white/10">
                <TokenWithLogo address={prizeTokenAddress} logoSize="lg" variant="symbol" className="text-white hover:text-cyan-400" />
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="absolute top-3 right-3 flex flex-wrap gap-1.5 justify-end">
            {tournament.isPrivate && (
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/70 text-white text-[10px] font-medium">
                Private
              </span>
            )}
            {timer && (
              <span className={`px-2 py-0.5 rounded-full ${timer.color} text-white text-[10px] font-medium`}>
                {timer.label}
              </span>
            )}
          </div>

          {/* Title overlay */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
            <motion.h3
              layoutId={`title-${tournament.id}`}
              className="text-white font-bold text-xl"
            >
              {tournament.name}
            </motion.h3>
            <div className="flex items-center gap-3 mt-1 text-xs">
              <span className="inline-flex items-center gap-1.5 text-cyan-400 font-bold">
                <img src="/morbius/MorbiusLogo-2.svg" alt="" className="w-4 h-4 object-contain shrink-0" />
                {Number(formatEther(BigInt(tournament.buyInAmount))).toLocaleString()} MORBIUS
              </span>
              <span className="text-cyan-400 font-bold">
                {tournament.entryCount}{tournament.maxPlayers ? `/${tournament.maxPlayers}` : ''} players
              </span>
              <span className="text-cyan-400 font-bold">
                Pool: {tournament.prizeTokenAddress || tournament.escrowToken ? (
                  tokenInfo
                    ? `${Number(BigInt(getEffectivePrizeAmount(tournament)) / BigInt(10 ** (tournament.prizeTokenDecimals ?? 18))).toLocaleString()} ${tokenInfo.symbol}`
                    : `${Number(BigInt(getEffectivePrizeAmount(tournament)) / BigInt(10 ** (tournament.prizeTokenDecimals ?? 18))).toLocaleString()} token`
                ) : (
                  `${Number(formatEther(BigInt(getEffectivePrizeAmount(tournament)))).toLocaleString()} MORBIUS`
                )}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Scrollable content + join button */}
        <motion.div
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex-1 flex flex-col overflow-hidden min-h-0"
        >
          <ExpandedCardContent
            tournament={tournament}
            tokenInfo={tokenInfo}
            playerBalance={playerBalance}
            playerAddress={playerAddress}
            wsClient={wsClient}
            onJoin={(t) => setPendingJoin(t)}
            onFundNow={onFundNow}
            onUnregister={onUnregister}
            onClose={onClose}
            entries={entries}
            loadingEntries={loadingEntries}
            getThemeInfo={getThemeInfo}
            currentTournamentId={currentTournamentId}
            isJoinLoading={isJoinLoading}
          />
        </motion.div>
      </motion.div>

      {pendingJoin && (() => {
        const t = pendingJoin;
        const buyInBigInt = BigInt(t.buyInAmount);
        const isFreeroll = t.tournamentType === 'freeroll';
        const isCustomToken = Boolean(t.prizeTokenAddress);
        const prizePool = BigInt(getEffectivePrizeAmount(t));
        const decimals = t.prizeTokenDecimals ?? 18;
        const prizeDisplay = isCustomToken
          ? `${Number(prizePool / BigInt(10 ** decimals)).toLocaleString()} ${tokenInfo?.symbol ?? 'token'}`
          : `${Number(formatEther(prizePool)).toLocaleString()} MORBIUS`;
        const buyInDisplay = isFreeroll ? 'Free' : `${Number(formatEther(buyInBigInt)).toLocaleString()} MORBIUS`;
        const prizePreset = PRIZE_PRESETS.find(p => p.id === t.prizeDistributionType);
        const prizeLabel = prizePreset?.name ?? PRIZE_DISTRIBUTION_LABELS[t.prizeDistributionType as keyof typeof PRIZE_DISTRIBUTION_LABELS] ?? t.prizeDistributionType;
        const timeLimitLabel = t.timeLimitMinutes === null || t.timeLimitMinutes === undefined
          ? TIME_LIMIT_LABELS['null']
          : TIME_LIMIT_LABELS[t.timeLimitMinutes] ?? `${t.timeLimitMinutes}m`;
        const canAfford = playerBalance >= buyInBigInt;
        return (
          <ConfirmActionCard
            title={isFreeroll ? 'Join Freeroll' : 'Join Tournament'}
            subtitle={t.name}
            rows={[
              { label: 'Buy-in', value: buyInDisplay, accent: 'yellow' },
              { label: 'Prize Pool', value: prizeDisplay, accent: 'yellow' },
              { label: 'Prize Distribution', value: prizeLabel, accent: 'cyan' },
              { label: 'Starting Chips', value: t.startingChips.toLocaleString(), accent: 'green' },
              { label: 'Max Hands', value: t.maxHands, accent: 'white' },
              { label: 'Time Limit', value: timeLimitLabel, accent: 'white' },
              { label: 'Players', value: `${t.entryCount}${t.maxPlayers ? `/${t.maxPlayers}` : ''}`, accent: 'white' },
              { label: 'Private', value: t.isPrivate ? 'Yes' : 'No', accent: 'white' },
            ]}
            onBack={() => setPendingJoin(null)}
            onConfirm={() => { setPendingJoin(null); onJoin(t); }}
            confirmLabel={isFreeroll ? 'Join Freeroll' : 'Join Tournament'}
            isLoading={isJoinLoading}
            disabled={!canAfford}
            warning={!canAfford && !isFreeroll ? 'Insufficient balance' : undefined}
          />
        );
      })()}
    </div>
  );
}

// ============================
// My History content (past tournaments this player entered)
// Expandable table: click row to expand full stats, payouts, rankings, time remaining
// ============================
function MyHistoryContent({
  history,
  isLoading,
  playerAddress,
  onFetchHistory,
}: {
  history: PlayerTournamentHistoryItem[];
  isLoading: boolean;
  playerAddress?: string | null;
  onFetchHistory?: () => Promise<void | PlayerTournamentHistoryItem[]>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Re-render every minute so "time remaining" for in-progress entries stays current (hooks at top)
  const [, setTick] = useState(0);
  useEffect(() => {
    const hasInProgress = history.some((h) => h.entryStatus === 'playing' && h.endsAt);
    if (!hasInProgress) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [history]);

  if (!playerAddress) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-gray-400">Connect your wallet to see your tournament history.</p>
      </div>
    );
  }
  if (isLoading && history.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <svg className="animate-spin h-8 w-8 text-cyan-400 mx-auto mb-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="text-gray-400">Loading history...</p>
        </div>
      </div>
    );
  }
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="text-6xl mb-4">📋</div>
        <p className="text-gray-400">You haven&apos;t entered any tournaments yet.</p>
        <p className="text-gray-500 text-sm mt-1">Join one from the Browse tab to see it here.</p>
        {onFetchHistory && (
          <button
            type="button"
            onClick={() => onFetchHistory()}
            className="mt-4 px-4 py-2 rounded-lg text-sm font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 transition-colors"
          >
            Refresh
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-gray-400">
          Every tournament you&apos;ve entered. Click a row to expand details. Prizes are paid automatically when the tournament ends.
        </p>
        {onFetchHistory && (
          <button
            type="button"
            onClick={() => onFetchHistory()}
            disabled={isLoading}
            className="shrink-0 ml-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        )}
      </div>
      <div className="rounded-xl border border-cyan-500/30 overflow-hidden" style={{ background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))', boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)', border: '1px inset rgba(60, 60, 60, 0.5)' }}>
        <Table>
          <TableHeader>
            <TableRow className="border-gray-600/50 hover:bg-transparent">
              <TableHead className="text-gray-400 font-medium">Tournament</TableHead>
              <TableHead className="text-gray-400 font-medium">Status</TableHead>
              <TableHead className="text-gray-400 font-medium">Result</TableHead>
              <TableHead className="text-gray-400 font-medium">Date</TableHead>
              <TableHead className="text-gray-400 font-medium w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((item) => {
              const hasPrize = BigInt(item.prizeWon) > 0n;
              const prizeHuman = formatEther(BigInt(item.prizeWon));
              const isCustomToken = Boolean(item.prizeTokenAddress);
              const outcome =
                item.entryStatus === 'busted'
                  ? 'Busted out'
                  : item.entryStatus === 'completed' && item.finalRank != null
                    ? `Rank #${item.finalRank}`
                    : item.entryStatus === 'playing'
                      ? 'In progress'
                      : 'Completed';
              const dateStr = item.boughtInAt
                ? new Date(item.boughtInAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '';
              const timeRemaining =
                item.entryStatus === 'playing' && item.endsAt ? formatTimeRemaining(item.endsAt) : null;
              const isExpanded = expandedId === item.entryId;

              return (
                <React.Fragment key={item.entryId}>
                  <TableRow
                    className={`cursor-pointer border-gray-600/50 transition-colors ${
                      isExpanded ? 'bg-cyan-500/10' : 'hover:bg-gray-800/60'
                    }`}
                    onClick={() => setExpandedId(isExpanded ? null : item.entryId)}
                  >
                    <TableCell className="font-medium text-white">{item.tournamentName}</TableCell>
                    <TableCell>
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          item.tournamentStatus === 'completed'
                            ? 'bg-slate-600 text-gray-300'
                            : item.tournamentStatus === 'active'
                              ? 'bg-cyan-500/20 text-cyan-300'
                              : 'bg-gray-600 text-gray-400'
                        }`}
                      >
                        {item.tournamentStatus}
                      </span>
                    </TableCell>
                    <TableCell className="text-gray-300">{outcome}</TableCell>
                    <TableCell className="text-gray-500 text-sm">{dateStr}</TableCell>
                    <TableCell className="w-8">
                      <svg
                        className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </TableCell>
                  </TableRow>
                  {isExpanded && (
                    <TableRow className="border-gray-600/50 bg-gray-900/80 hover:bg-gray-900/80">
                      <TableCell colSpan={5} className="p-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">Stats</p>
                            <p className="text-gray-300">Hands played: <strong className="text-white">{item.handsPlayed}</strong></p>
                            <p className="text-gray-300">Highest chips: <strong className="text-cyan-400">{item.highestChipCount.toLocaleString()}</strong></p>
                            <p className="text-gray-300">Chips remaining: <strong className="text-white">{item.chipsRemaining.toLocaleString()}</strong></p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">Ranking</p>
                            <p className="text-gray-300">
                              {item.finalRank != null ? (
                                <>Final rank: <strong className="text-cyan-400">#{item.finalRank}</strong></>
                              ) : (
                                <>Status: <strong className="text-white">{outcome}</strong></>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">Payout</p>
                            {hasPrize ? (
                              <>
                                <p className="text-cyan-400 font-medium">
                                  {Number(prizeHuman).toLocaleString()} {isCustomToken ? 'tokens' : 'MORBIUS'}
                                </p>
                                <p className="text-gray-500 text-xs">
                                  {isCustomToken ? 'Sent to wallet when ended' : 'Added to platform balance'}
                                </p>
                              </>
                            ) : (
                              <p className="text-gray-500">—</p>
                            )}
                          </div>
                          <div>
                            <p className="text-gray-500 text-xs uppercase tracking-wider mb-0.5">Time</p>
                            {timeRemaining ? (
                              <p className="text-cyan-300 font-medium">Time left: {timeRemaining}</p>
                            ) : item.endedAt ? (
                              <p className="text-gray-400">Ended {new Date(item.endedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                            ) : (
                              <p className="text-gray-500">—</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ============================
// How Payouts Work (collapsible info)
// ============================
function HowPayoutsWork() {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-t border-gray-700 bg-gray-800/40 shadow-inner">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left text-sm text-gray-300 hover:text-cyan-300 transition-colors"
      >
        <span className="font-medium">How payouts work</span>
        <svg
          className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-3 pt-0 text-xs text-gray-400 space-y-1.5 border-t border-gray-700/50">
          <ul className="list-disc list-inside space-y-1 text-gray-300">
            <li><strong className="text-cyan-400/90">MORBIUS pools:</strong> Prize pool is the sum of buy-ins. When the tournament ends, winners are ranked by chips; each gets a share of the pool (e.g. 40% / 20% / 10% for top 3). Payouts are added to your platform balance.</li>
            <li><strong className="text-cyan-400/90">Custom token pools:</strong> The creator (or anyone) funds the prize escrow on-chain. Same ranking and percentages apply; payouts are sent in that token from the escrow contract to your wallet.</li>
            <li><strong className="text-cyan-400/90">Fees:</strong> A small platform fee (and optional creator fee) is taken from the prize pool before player shares are calculated. You see the net distributable pool in the prize structure.</li>
            <li><strong className="text-cyan-400/90">When:</strong> Payouts run automatically once every player has finished (busted or completed max hands). No action needed from you.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================
// Main TournamentBrowser
// ============================
export function TournamentBrowser({
  isOpen,
  initialTab = 'join',
  onClose,
  onJoin,
  onCreateNew,
  onRefresh,
  onFetchLeaderboard,
  tournaments,
  isLoading,
  isJoinLoading = false,
  playerBalance,
  playerAddress,
  wsClient,
  onFreerollJoined,
  tournamentHistory = [],
  isHistoryLoading = false,
  onFetchHistory,
  getThemeInfo,
  currentTournamentId,
  onUnregister,
}: TournamentBrowserProps) {
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<LobbyTab>('join');
  const [activeTournament, setActiveTournament] = useState<TournamentListItem | null>(null);
  const [fundModalTournament, setFundModalTournament] = useState<TournamentListItem | null>(null);

  // When modal opens, switch to initialTab so e.g. "View tournament history" opens to History tab
  useEffect(() => {
    if (isOpen && initialTab) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Auto-refresh on open for Browse and My Tournaments
  useEffect(() => {
    if (isOpen && (activeTab === 'join' || activeTab === 'my')) {
      handleRefresh();
    }
  }, [isOpen, activeTab]);

  // Fetch My History when opening that tab (guard against re-fetch while loading)
  const historyFetchedRef = useRef(false);
  useEffect(() => {
    if (isOpen && activeTab === 'history' && onFetchHistory && !isHistoryLoading) {
      if (!historyFetchedRef.current) {
        historyFetchedRef.current = true;
        onFetchHistory();
      }
    }
    // Reset the flag when the modal closes so the next open re-fetches
    if (!isOpen) {
      historyFetchedRef.current = false;
    }
  }, [isOpen, activeTab, onFetchHistory, isHistoryLoading]);

  // Close expanded card when browser closes
  useEffect(() => {
    if (!isOpen) setActiveTournament(null);
  }, [isOpen]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const normalizedAddress = playerAddress?.toLowerCase() ?? '';
  const myTournaments = normalizedAddress
    ? tournaments.filter((t) => (t.creatorAddress ?? '').toLowerCase() === normalizedAddress)
    : [];
  const displayList = activeTab === 'my' ? myTournaments : tournaments;
  const showEmptyMessage = activeTab === 'my' ? myTournaments.length === 0 : tournaments.length === 0;
  const emptyCopy =
    activeTab === 'my'
      ? "You haven't created any tournaments yet."
      : 'No active tournaments. Be the first to create one!';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative rounded-2xl max-w-4xl w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col" style={{ ...Theme.panel.base, border: `1px solid ${Theme.cyan.rgba.border}` }}>
        {/* Header */}
        <div className={`${Theme.cyan.gradient.button} p-4 flex items-center justify-between`}>
          <h2 className="text-2xl font-bold text-white">Tournament Lobby</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <svg
                className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs: Browse | My Tournaments | Freeroll */}
        <div className="flex gap-1 px-4 pt-2 pb-0 border-b border-gray-600">
          <button
            onClick={() => setActiveTab('join')}
            className={`px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === 'join' ? 'bg-gray-800 text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            Browse
          </button>
          <button
            onClick={() => setActiveTab('my')}
            className={`px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === 'my' ? 'bg-gray-800 text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            My Tournaments
          </button>
          {wsClient && (
            <button
              onClick={() => setActiveTab('freeroll')}
              className={`px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors ${
                activeTab === 'freeroll' ? 'bg-gray-800 text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-white'
              }`}
            >
              Freeroll
            </button>
          )}
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === 'history' ? 'bg-gray-800 text-cyan-400 border-b-2 border-cyan-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            My History
          </button>
        </div>

        {/* How payouts work - collapsible */}
        <HowPayoutsWork />

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'freeroll' && wsClient ? (
            <FreerollList wsClient={wsClient} onJoined={onFreerollJoined} />
          ) : activeTab === 'history' ? (
            <MyHistoryContent
              history={tournamentHistory}
              isLoading={isHistoryLoading}
              playerAddress={playerAddress}
              onFetchHistory={onFetchHistory}
            />
          ) : isLoading && displayList.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <svg className="animate-spin h-8 w-8 text-cyan-400 mx-auto mb-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-gray-400">Loading tournaments...</p>
              </div>
            </div>
          ) : showEmptyMessage ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="text-6xl mb-4">🏆</div>
                <p className="text-gray-400 mb-2">{emptyCopy}</p>
                {activeTab === 'my' && (
                  <button
                    onClick={onCreateNew}
                    className="mt-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium"
                  >
                    Create Blackjack tournament
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayList.map((tournament) => (
                <TournamentCard
                  key={tournament.id}
                  tournament={tournament}
                  playerBalance={playerBalance}
                  onJoin={onJoin}
                  onSelect={setActiveTournament}
                  onFundNow={(t) => setFundModalTournament(t)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-600" style={Theme.panel.base}>
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-gray-400">Your Balance: </span>
              <span className="text-cyan-400 font-semibold">
                {Number(formatEther(playerBalance)).toLocaleString()} MORBIUS
              </span>
            </div>
            <button
              onClick={onCreateNew}
              className={`px-6 py-3 rounded-xl ${Theme.cyan.gradient.button} ${Theme.cyan.gradient.buttonHover} text-white font-semibold transition-all`}
            >
              + Create Blackjack tournament
            </button>
          </div>
        </div>
      </div>

      {/* Expanded card overlay */}
      <AnimatePresence>
        {activeTournament && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-[90]"
              onClick={() => setActiveTournament(null)}
            />
            <ExpandedCard
              tournament={activeTournament}
              onClose={() => setActiveTournament(null)}
              onJoin={onJoin}
              onFundNow={(t) => setFundModalTournament(t)}
              onUnregister={onUnregister}
              playerBalance={playerBalance}
              playerAddress={playerAddress}
              wsClient={wsClient}
              getThemeInfo={getThemeInfo}
              currentTournamentId={currentTournamentId}
              isJoinLoading={isJoinLoading}
            />
          </>
        )}
      </AnimatePresence>

      {/* Fund tournament escrow modal (anyone can fund) */}
      {fundModalTournament && (
        <FundTournamentEscrowModal
          tournament={fundModalTournament}
          onClose={() => setFundModalTournament(null)}
          onSuccess={handleRefresh}
        />
      )}
    </div>
  );
}

export default TournamentBrowser;
