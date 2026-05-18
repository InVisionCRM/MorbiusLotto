'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { sanitizeDecimalStringForParseEther } from '@/lib/sanitize-decimal-input';
import { getApiUrlOptional, getWebSocketUrlOptional } from '@/lib/api-urls';
import { BlackjackWebSocketClient, type SignTypedDataFn } from '@/lib/websocket-client';
import type { PokerTableSummary, PokerSeatState } from '@/lib/websocket-client';
import { Footer } from '@/components/shared/footer';
import { Theme } from '@/lib/theme';
import { GameWalletModal } from '@/components/shared/GameWalletModal';
import { GameFAQ } from '@/components/shared/GameFAQ';
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';
import { isAdminWallet } from '@/lib/admin';
import {
  getCashBuyInBoundsChips,
  POKER_CASH_MAX_BUY_IN_BB,
  POKER_CASH_MIN_BUY_IN_BB,
} from '@/lib/poker-buy-in';
import { formatChips, parseChipInput } from '@/lib/format-poker-chips';
import { PokerChipExchangeModal } from '@/components/poker/PokerChipExchangeModal';
import { InsufficientBalanceDialog } from '@/components/shared/InsufficientBalanceDialog';
import { PokerOnboardingWizard } from '@/components/poker/PokerOnboardingWizard';
import { PokerOnboardingChecklist } from '@/components/poker/PokerOnboardingChecklist';
import { PokerYourStatsPanel } from '@/components/poker/PokerYourStatsPanel';
import { PokerBalanceBar } from '@/components/poker/PokerBalanceBar';
import { usePokerOnboarding } from '@/hooks/use-poker-onboarding';
import { PokerBetaSplash } from '@/components/poker/PokerBetaSplash';
import { PokerHowToPlayModal } from '@/components/poker/PokerHowToPlayModal';
import { PokerStatsModal } from '@/components/poker/PokerStatsModal';
import { PokerHouseRecords } from '@/components/poker/PokerHouseRecords';
import { PokerTopPlayers } from '@/components/poker/PokerTopPlayers';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { PokerTournamentLobby } from '@/components/poker/tournament/PokerTournamentLobby';
import { PokerTournamentHistory } from '@/components/poker/tournament/PokerTournamentHistory';
import {
  MorbCard,
  MorbGradientButton,
  MorbSecondaryButton,
  MorbInput,
  MorbHeroAmount,
} from '@/components/ui/morb-card';
import { Lock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

function shortenHexAddress(addr: string | null | undefined): string {
  if (!addr || typeof addr !== 'string' || addr.length < 12) return '—';
  const a = addr.toLowerCase();
  return `${a.slice(0, 6)}\u2026${a.slice(-4)}`;
}

function formatTableAge(createdAt: string | null | undefined): string {
  if (!createdAt) return '—';
  try {
    return formatDistanceToNow(new Date(createdAt), { addSuffix: true });
  } catch {
    return '—';
  }
}

// Intro screen component (same style as Blackjack)
function IntroScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const duration = 2500;
    const fallbackTimeout = setTimeout(() => {
      setTimeout(onComplete, 200);
    }, duration);

    return () => clearTimeout(fallbackTimeout);
  }, [onComplete]);

  return (
    <div
      className="fixed inset-0 z-50"
      style={{
        backgroundImage:
          "linear-gradient(145deg, rgba(16, 26, 35, 0.78), rgba(10, 15, 20, 0.88)), url('/morbius/Morbius_Poker.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
      suppressHydrationWarning
    >
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-[30px]">
        <div className="relative w-24 h-32 shrink-0 overflow-visible">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="absolute items-center justify-center w-20 h-28 bg-white rounded-lg border-2 border-gray-300 shadow-lg"
              style={{
                transform: `translate(${i * 2}px, ${i * 2}px) rotate(${i * 10}deg)`,
                animation: `dealCard 0.5s ease-out ${i * 0.1}s both`,
                zIndex: 6 - i,
              }}
            >
              <div className="w-full h-full bg-gradient-to-br from-cyan-500 to-purple-700 rounded-lg flex items-center justify-center">
                <span className="text-white text-2xl font-bold">♠</span>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center shrink-0">
          <div className="text-white text-xl font-bold animate-pulse mb-2">
            DEALING CARDS...
          </div>
          <div className="text-gray-400 text-sm">
            Preparing provably fair Texas Hold&apos;em
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes dealCard {
          0% {
            transform: translate(0, -100px) rotate(0deg);
            opacity: 0;
          }
          100% {
            transform: translate(12px, 12px) rotate(30deg);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}

/** Hero card fill — outer shell and inner content column use the same value so they match pixel-for-pixel. */
const POKER_HERO_CARD_GRADIENT = 'linear-gradient(170deg, #0c1929 0%, #0a0f1a 40%, #0d1117 100%)';
/** Same stops as hero, angle + order flipped so it reads clearly against the hero strip (still matches palette). */
const POKER_HERO_CARD_GRADIENT_FLIPPED = 'linear-gradient(350deg, #0d1117 0%, #0a0f1a 40%, #0c1929 100%)';

export default function PokerLobbyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const [showIntro, setShowIntro] = useState(true);
  const [tables, setTables] = useState<PokerTableSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinModal, setJoinModal] = useState<{ tableId: string; hasPin: boolean; bigBlindChips: string } | null>(null);
  const [buyIn, setBuyIn] = useState('');
  const [joinPin, setJoinPin] = useState('');
  const [balance, setBalance] = useState<string | null>(null);
  const [chipBalance, setChipBalance] = useState<string | null>(null);
  const [createModal, setCreateModal] = useState<{ smallBlind: string; bigBlind: string; maxSeats: number; pinCode: string; pinEnabled: boolean } | null>(null);
  const [creating, setCreating] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [walletDefaultTab, setWalletDefaultTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [showChipExchange, setShowChipExchange] = useState(false);
  const [showInsufficientChips, setShowInsufficientChips] = useState(false);
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);

  const onboarding = usePokerOnboarding({
    address: address as `0x${string}` | undefined,
    isConnected,
    playBalanceWei: balance,
    chipBalance,
  });

  useEffect(() => {
    const open = () => setShowChipExchange(true);
    if (typeof window !== 'undefined') {
      window.addEventListener('sophie:open_poker_chip_exchange', open);
      return () => window.removeEventListener('sophie:open_poker_chip_exchange', open);
    }
  }, []);
  const [playersDropdownTableId, setPlayersDropdownTableId] = useState<string | null>(null);
  const [tablePlayers, setTablePlayers] = useState<{ tableId: string; seats: PokerSeatState[] } | null>(null);
  const [tablePlayersLoading, setTablePlayersLoading] = useState(false);
  const [removingTableId, setRemovingTableId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cash' | 'tournaments' | 'history'>('tournaments');
  const [tournamentCreateModalOpen, setTournamentCreateModalOpen] = useState(false);
  const [wsClient, setWsClient] = useState<BlackjackWebSocketClient | null>(null);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'history') {
      setActiveTab('history');
    } else if (t === 'cash') {
      setActiveTab('cash');
    } else if (t === 'tournaments') {
      setActiveTab('tournaments');
    } else {
      setActiveTab('tournaments');
      router.replace('/poker?tab=tournaments', { scroll: false });
    }
  }, [searchParams, router]);

  const setLobbyTab = useCallback(
    (tab: 'cash' | 'tournaments' | 'history') => {
      setActiveTab(tab);
      if (tab === 'tournaments') {
        router.replace('/poker?tab=tournaments', { scroll: false });
      } else if (tab === 'history') {
        router.replace('/poker?tab=history', { scroll: false });
      } else {
        router.replace('/poker?tab=cash', { scroll: false });
      }
    },
    [router],
  );

  useEffect(() => {
    if (activeTab !== 'tournaments') setTournamentCreateModalOpen(false);
  }, [activeTab]);

  const goToTournamentTable = useCallback(
    (tableId: string, tournamentId: string) => {
      router.push(`/poker/${tableId}?tournament=${tournamentId}`);
    },
    [router]
  );

  const clientRef = React.useRef<BlackjackWebSocketClient | null>(null);
  const isAdmin = isAdminWallet(address);

  const signTypedRef = useRef(signTypedDataAsync as SignTypedDataFn | undefined);
  signTypedRef.current = signTypedDataAsync as SignTypedDataFn | undefined;
  const stableSignTypedData = useCallback<SignTypedDataFn>((args) => {
    const fn = signTypedRef.current;
    if (!fn) return Promise.reject(new Error('Wallet signer not ready'));
    return fn(args);
  }, []);

  const joinBuyInOutOfRange = React.useMemo(() => {
    if (!joinModal) return false;
    const chipsStr = parseChipInput(buyIn);
    if (chipsStr === '0') return false;
    try {
      const c = BigInt(chipsStr);
      const { minChips, maxChips } = getCashBuyInBoundsChips(BigInt(joinModal.bigBlindChips));
      return c < minChips || c > maxChips;
    } catch {
      return true;
    }
  }, [joinModal, buyIn]);

  const fetchTablePlayers = React.useCallback((tableId: string) => {
    const client = clientRef.current;
    if (!client) return;
    setTablePlayersLoading(true);
    client
      .pokerGetState(tableId)
      .then((state) => setTablePlayers({ tableId, seats: state.seats }))
      .catch(() => setTablePlayers({ tableId, seats: [] }))
      .finally(() => setTablePlayersLoading(false));
  }, []);

  const openPlayersDropdown = React.useCallback((tableId: string) => {
    if (playersDropdownTableId === tableId) {
      setPlayersDropdownTableId(null);
      return;
    }
    setPlayersDropdownTableId(tableId);
    if (tablePlayers?.tableId !== tableId) fetchTablePlayers(tableId);
  }, [playersDropdownTableId, tablePlayers?.tableId, fetchTablePlayers]);

  function truncateAddress(addr: string): string {
    if (!addr || addr.length < 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
  }

  const removeTable = React.useCallback(async (tableId: string) => {
    if (!address || !isAdmin) return;
    setRemovingTableId(tableId);
    try {
      const res = await fetch(`/api/admin/poker/tables/${tableId}`, {
        method: 'DELETE',
        headers: { 'x-admin-wallet': address },
      });
      if (res.status === 204) {
        setTables((prev) => prev.filter((t) => t.id !== tableId));
        setPlayersDropdownTableId((id) => (id === tableId ? null : id));
        setTablePlayers((p) => (p?.tableId === tableId ? null : p));
      } else {
        const data = await res.json().catch(() => ({}));
        setError((data.error || data.message || 'Failed to remove table') as string);
      }
    } catch (e) {
      setError((e as Error).message ?? 'Failed to remove table');
    } finally {
      setRemovingTableId(null);
    }
  }, [address, isAdmin]);

  useEffect(() => {
    const wsUrl = getWebSocketUrlOptional();
    if (!wsUrl) {
      setError('WebSocket not configured');
      setLoading(false);
      return;
    }

    // Authenticated when wallet is connected so tournament join/create/events all work
    const client = address
      ? new BlackjackWebSocketClient(wsUrl, address.toLowerCase(), stableSignTypedData)
      : new BlackjackWebSocketClient(wsUrl);
    clientRef.current = client;

    const refreshTables = () => {
      client
        .pokerListTables()
        .then((res) => {
          setTables(res.tables ?? []);
          setError(null);
        })
        .catch(() => {});
    };

    const onReconnected = () => {
      refreshTables();
    };

    const onPokerChipBal = (s: string) => setChipBalance(s);
    client.on('reconnected', onReconnected);
    client.on('poker_chip_balance', onPokerChipBal);

    // Listen for broadcast table list updates
    client.on('poker_table_list', (payload: { tables: PokerTableSummary[] }) => {
      setTables(payload.tables ?? []);
    });

    // Navigate to tournament table when tournament starts (regardless of active tab).
    // MTT: `tableAssignments` maps wallet → tableId; pick the caller's own assignment so each
    // player navigates to their own table, not the broadcaster's first table.
    client.on('poker_tournament_started', (payload: {
      tournamentId: string;
      tableId: string;
      tableAssignments?: Record<string, string>;
    }) => {
      if (!payload?.tableId || !payload?.tournamentId) return;
      const me = address?.toLowerCase() ?? null;
      const targetTableId =
        me && payload.tableAssignments && payload.tableAssignments[me]
          ? payload.tableAssignments[me]
          : payload.tableId;
      router.push(`/poker/${targetTableId}?tournament=${payload.tournamentId}`);
    });

    client
      .connect()
      .then(() => {
        setWsClient(client);
        const fromWs = client.getPokerChipBalanceString();
        if (fromWs != null) setChipBalance(fromWs);
        return client.pokerListTables();
      })
      .then((res) => {
        setTables(res.tables ?? []);
        setError(null);
      })
      .catch((err) => {
        setError(err?.message ?? 'Failed to load tables');
        setTables([]);
      })
      .finally(() => setLoading(false));

    // Poll every 5s for fresh table list (lobby broadcasts not guaranteed)
    const interval = setInterval(() => {
      refreshTables();
    }, 5000);

    return () => {
      clearInterval(interval);
      client.off('reconnected', onReconnected);
      client.off('poker_chip_balance', onPokerChipBal);
      client.disconnect();
      clientRef.current = null;
      setWsClient(null);
    };
  }, [address, stableSignTypedData, router]);

  const refreshLobbyBalances = useCallback(() => {
    if (!address || !getApiUrlOptional()) {
      setBalance(null);
      setChipBalance(null);
      return;
    }
    const apiUrl = getApiUrlOptional();
    if (!apiUrl) return;
    const addr = address.toLowerCase();
    fetch(`${apiUrl}/api/player/${addr}/balance`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => (data?.balance != null ? setBalance(String(data.balance)) : setBalance(null)))
      .catch(() => setBalance(null));
    fetch(`${apiUrl}/api/poker/chips/balance?address=${encodeURIComponent(addr)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => (data?.balance != null ? setChipBalance(String(data.balance)) : setChipBalance(null)))
      .catch(() => setChipBalance(null));
  }, [address]);

  useEffect(() => {
    refreshLobbyBalances();
  }, [refreshLobbyBalances]);

  /** Navigate to table page with join params; table page will connect once and call pokerJoinTable. */
  const handleJoin = () => {
    if (!joinModal || !address) return;
    setError(null);
    if (joinModal.hasPin && !/^\d{4}$/.test(joinPin)) {
      setError('Enter the 4-digit PIN to join this private table');
      return;
    }
    const buyInChipsStr = parseChipInput(buyIn);
    if (buyInChipsStr === '0') {
      setError('Enter a buy-in in whole chips');
      return;
    }
    const bbChips = BigInt(joinModal.bigBlindChips);
    const { minChips, maxChips } = getCashBuyInBoundsChips(bbChips);
    let bi: bigint;
    try {
      bi = BigInt(buyInChipsStr);
    } catch {
      setError('Invalid buy-in amount');
      return;
    }
    if (bi < minChips || bi > maxChips) {
      setError(
        `Buy-in must be between ${POKER_CASH_MIN_BUY_IN_BB} and ${POKER_CASH_MAX_BUY_IN_BB} big blinds (${formatChips(minChips)}–${formatChips(maxChips)} chips).`
      );
      return;
    }
    const targetTableId = joinModal.tableId;
    const pin = joinModal.hasPin ? joinPin : '';
    setJoinModal(null);
    setJoinPin('');
    const pinParam = pin ? `&pin=${encodeURIComponent(pin)}` : '';
    router.push(`/poker/${targetTableId}?join=1&buyIn=${encodeURIComponent(buyInChipsStr)}${pinParam}`);
  };

  const handleCreateTable = async () => {
    if (!createModal || !address || !wsClient) return;
    if (createModal.pinEnabled && !/^\d{4}$/.test(createModal.pinCode)) {
      setError('PIN must be exactly 4 digits');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      // Server stores blinds as chip integers (1 chip = 1 MORBIUS). User input is whole MORBIUS.
      const sbChips = (() => {
        const n = Number(sanitizeDecimalStringForParseEther(createModal.smallBlind));
        return Number.isFinite(n) && n > 0 ? Math.floor(n).toString() : '0';
      })();
      const bbChips = (() => {
        const n = Number(sanitizeDecimalStringForParseEther(createModal.bigBlind));
        return Number.isFinite(n) && n > 0 ? Math.floor(n).toString() : '0';
      })();
      const pinCode = createModal.pinEnabled ? createModal.pinCode : undefined;
      const { tableId } = await wsClient.pokerCreateTable(sbChips, bbChips, createModal.maxSeats, pinCode);
      const createdPin = pinCode || '';
      setCreateModal(null);
      // Auto-join creator at max buy-in (100 BB) — matches cash-game rules
      const bbChipsBig = (() => {
        try { return BigInt(bbChips); } catch { return 0n; }
      })();
      const { maxChips } = getCashBuyInBoundsChips(bbChipsBig);
      const buyInChips = maxChips.toString();
      const pinParam = createdPin ? `&pin=${encodeURIComponent(createdPin)}` : '';
      router.push(`/poker/${tableId}?join=1&buyIn=${encodeURIComponent(buyInChips)}${pinParam}`);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to create table');
    } finally {
      setCreating(false);
    }
  };

  if (showIntro) {
    return <IntroScreen onComplete={() => setShowIntro(false)} />;
  }

  return (
    <>
      <PokerBetaSplash />
      <GlobalMainNav
        page="poker"
        pokerLobbyTab={activeTab}
        onPokerLobbyTabChange={setLobbyTab}
      >
        <div
          className="relative min-h-screen h-full w-full flex flex-col text-white"
          style={{
            backgroundImage:
              "linear-gradient(to bottom, rgba(8,12,20,0.88), rgba(2,6,17,0.92) 50%, rgba(8,12,20,0.94)), url('/morbius/Morbius_Poker.png')",
            backgroundSize: 'cover',
            backgroundPosition: 'center top',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed',
          }}
        >
          <div className="absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(34,211,238,0.10),transparent_70%)] pointer-events-none" />
          <div className="relative flex-1 w-full max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-8">
            {/* ── Hero Section ── */}
            <div
              className="relative mb-6 flex min-h-[17rem] w-full flex-col overflow-hidden rounded-3xl border border-white/25 sm:mb-8 sm:min-h-[20rem] md:min-h-[22rem]"
              style={{
                background: POKER_HERO_CARD_GRADIENT,
                boxShadow: '0 0 80px rgba(34,211,238,0.07), 0 2px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(34,211,238,0.1)',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {/* Top glow line */}
              <div className="h-px w-full shrink-0 bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

              {/* Decorative card fan — positioned behind content */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[45%] pointer-events-none select-none opacity-[0.04]">
                <div className="relative w-[400px] h-[300px]">
                  {[
                    { r: -25, x: -60, y: 0 },
                    { r: -10, x: -20, y: -10 },
                    { r: 5, x: 20, y: -10 },
                    { r: 20, x: 60, y: 0 },
                  ].map((c, i) => (
                    <div
                      key={i}
                      className="absolute left-1/2 top-1/2 w-[140px] h-[200px] rounded-2xl border-2 border-white/30 bg-white/10"
                      style={{
                        transform: `translate(-50%, -50%) rotate(${c.r}deg) translateX(${c.x}px) translateY(${c.y}px)`,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="relative flex min-h-0 w-full flex-1 flex-col self-stretch overflow-hidden">
                <div
                  className="relative z-10 box-border flex min-h-full w-full flex-1 flex-col px-5 py-10 text-center text-slate-200 sm:px-10 sm:py-12"
                  style={{
                    background: POKER_HERO_CARD_GRADIENT,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  {/* Live badge */}
                  <div
                    className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full mb-6 sm:mb-8"
                    style={{
                      background: 'rgba(34,211,238,0.06)',
                      border: '1px solid rgba(34,211,238,0.15)',
                      boxShadow: '0 0 20px rgba(34,211,238,0.08)',
                    }}
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                    </span>
                    <span className="text-[11px] sm:text-xs font-bold tracking-[0.2em] uppercase text-cyan-400">
                      {tables.length > 0 ? `${tables.length} Live Table${tables.length !== 1 ? 's' : ''}` : 'No Active Tables'}
                    </span>
                  </div>

                  {/* Main title */}
                  <h1
                    className="text-5xl sm:text-6xl md:text-7xl font-black tracking-[-3px] leading-[1] mb-8 sm:mb-10"
                    style={{
                      background: 'linear-gradient(180deg, #ffffff 0%, #e2e8f0 40%, #64748b 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))',
                    }}
                  >
                    Texas Hold&apos;em
                  </h1>

                  {/* CTA buttons */}
                  <div className="flex justify-center gap-3 flex-wrap">
                    {isConnected && (
                      <button
                        type="button"
                        onClick={() => setCreateModal({ smallBlind: '10', bigBlind: '20', maxSeats: 10, pinCode: '', pinEnabled: false })}
                        className="flex items-center gap-2 px-7 py-3.5 rounded-2xl text-white text-sm font-bold hover:-translate-y-0.5 transition-all"
                        style={{
                          background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                          boxShadow: '0 4px 24px rgba(6,182,212,0.3), 0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
                        }}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M12 5v14M5 12h14" /></svg>
                        Create Cash Game
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setLobbyTab('tournaments');
                        setTournamentCreateModalOpen(true);
                      }}
                      className="flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-bold text-black transition-all hover:brightness-105 active:scale-[0.99]"
                      style={{
                        background: 'linear-gradient(180deg, #eab308, #ca8a04)',
                        boxShadow: '0 2px 12px rgba(234, 179, 8, 0.25)',
                      }}
                    >
                      Create Tournament
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push('/poker/tournaments/create-mtt')}
                      className="relative flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-bold text-white transition-all hover:brightness-110 active:scale-[0.99]"
                      style={{
                        background: 'linear-gradient(135deg, #0891b2, #2563eb)',
                        boxShadow: '0 2px 12px rgba(6, 182, 212, 0.3), 0 0 0 1px rgba(34,211,238,0.2)',
                      }}
                    >
                      Create MTT
                      <span
                        className="rounded-full bg-cyan-300/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-cyan-100"
                        style={{ letterSpacing: '0.15em' }}
                      >
                        new
                      </span>
                    </button>
                    {address && (
                      <button
                        type="button"
                        onClick={() => setShowStatsModal(true)}
                        className="flex items-center gap-2 px-6 py-3.5 rounded-2xl text-slate-400 text-sm font-medium hover:text-white transition-all"
                        style={{
                          background: 'rgba(30,41,59,0.5)',
                          border: '1px solid rgba(51,65,85,0.5)',
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                        }}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 3v18h18" /><path d="M7 15l4-4 4 4 5-5" /></svg>
                        My Stats
                      </button>
                    )}
                    <Link
                      href="/creators"
                      className="flex items-center gap-2 px-6 py-3.5 rounded-2xl text-slate-400 text-sm font-medium hover:text-white transition-all"
                      style={{
                        background: 'rgba(30,41,59,0.5)',
                        border: '1px solid rgba(51,65,85,0.5)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                      }}
                    >
                      Creator Dashboard
                    </Link>
                    <button
                      type="button"
                      onClick={() => setShowHowToPlay(true)}
                      className="flex items-center gap-2 px-6 py-3.5 rounded-2xl text-slate-400 text-sm font-medium hover:text-white transition-all"
                      style={{
                        background: 'rgba(30,41,59,0.5)',
                        border: '1px solid rgba(51,65,85,0.5)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                      }}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                      How to Play
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowHowToPlay(true)}
                      className="flex items-center gap-2 px-6 py-3.5 rounded-2xl text-slate-400 text-sm font-medium hover:text-white transition-all"
                      style={{
                        background: 'rgba(30,41,59,0.5)',
                        border: '1px solid rgba(51,65,85,0.5)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                      }}
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        <path d="M8 7h8M8 11h6" />
                      </svg>
                      Tutorial
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-4 sm:mb-6">
              <PokerOnboardingChecklist
                step={onboarding.currentStep}
                isConnected={isConnected}
                dismissed={onboarding.dismissed}
                onResume={() => setShowOnboardingWizard(true)}
                onDismiss={onboarding.dismiss}
              />
            </div>

            {isConnected && address && (
              <div className="mb-6 sm:mb-8">
                <PokerBalanceBar
                  address={address.toLowerCase()}
                  morbiusBalanceWei={balance}
                  chipBalance={chipBalance}
                  onDeposit={() => { setWalletDefaultTab('deposit'); setShowDepositModal(true); }}
                  onWithdraw={() => { setWalletDefaultTab('withdraw'); setShowDepositModal(true); }}
                  onOpenExchange={() => setShowChipExchange(true)}
                />
              </div>
            )}

            {isConnected && address && (
              <div className="mb-6 sm:mb-8">
                <PokerYourStatsPanel
                  address={address.toLowerCase()}
                  onOpenAllStats={() => setShowStatsModal(true)}
                />
              </div>
            )}

            <PokerHouseRecords />

            {/* Tab bar */}
            <div
              className="flex items-center gap-1 px-5 sm:px-10 py-3.5 sm:py-4 mb-6 sm:mb-8 rounded-2xl border border-white/25"
              style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.2))' }}
            >
                <button
                  type="button"
                  onClick={() => setLobbyTab('tournaments')}
                  className={`relative px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    activeTab === 'tournaments'
                      ? 'bg-cyan-500/[0.12] text-cyan-400'
                      : 'text-white hover:text-white/85'
                  }`}
                >
                  Tournaments
                </button>
                <button
                  type="button"
                  onClick={() => setLobbyTab('cash')}
                  className={`px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    activeTab === 'cash'
                      ? 'bg-cyan-500/[0.12] text-cyan-400'
                      : 'text-white hover:text-white/85'
                  }`}
                >
                  Cash Games
                  {tables.length > 0 && activeTab === 'cash' && (
                    <span className="ml-2 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400">{tables.length}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setLobbyTab('history')}
                  className={`relative px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                    activeTab === 'history'
                      ? 'bg-cyan-500/[0.12] text-cyan-400'
                      : 'text-white hover:text-white/85'
                  }`}
                >
                  History
                </button>
            </div>
            {activeTab === 'tournaments' && (
              <div className="surface-splash-panel !border-white/10 overflow-hidden">
                <div className="surface-splash-panel-glow" aria-hidden />
                <div
                  className="relative z-10 box-border flex w-full min-h-0 flex-col p-3 sm:p-5"
                  style={{
                    background: POKER_HERO_CARD_GRADIENT_FLIPPED,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <div className="w-full max-w-full">
                    {!isConnected && (
                      <p className="text-sm text-cyan-200/80 mb-4 rounded-lg border border-white/20 bg-cyan-500/5 px-3 py-2">
                        Connect your wallet to create or join Sit &amp; Go tournaments.
                      </p>
                    )}
                    <PokerTournamentLobby
                      wsClient={wsClient}
                      myAddress={address}
                      onGoToTable={goToTournamentTable}
                      createModalOpen={tournamentCreateModalOpen}
                      onCreateModalOpenChange={setTournamentCreateModalOpen}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="surface-splash-panel !border-white/10 overflow-hidden">
                <div className="surface-splash-panel-glow" aria-hidden />
                <div className="relative z-10 p-3 sm:p-5">
                  <PokerTournamentHistory myAddress={address} />
                </div>
              </div>
            )}

            {activeTab === 'cash' && error && <p className="text-red-400 mb-4">{error}</p>}
            {activeTab === 'cash' && !loading && tables.length === 0 && !error && (
              <p className="text-slate-400">
                No tables available. {isConnected ? 'Click "Create table" above to start one.' : 'Connect your wallet to create a table.'}
              </p>
            )}
            {activeTab === 'cash' && !loading && tables.length > 0 && (
              <div
                className="surface-splash-panel overflow-x-auto lg:overflow-x-visible border-2 !border-[rgba(255,255,255,0.1)]"
              >
                <div className="surface-splash-panel-glow" aria-hidden />
                <div className="relative z-10 min-w-0">
                  <table className="w-full border-collapse text-sm text-slate-200 min-w-0">
                  <thead>
                    <tr className="border-b border-slate-600/50">
                      <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Blinds
                      </th>
                      <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Table
                      </th>
                      <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Creator
                      </th>
                      <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                        Running
                      </th>
                      <th className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Seats
                      </th>
                      <th className="py-2.5 px-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 w-[8.5rem]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tables.map((t) => {
                      const isPlaying = t.status === 'playing';
                      const hasPlayers = t.seatedCount > 0;
                      const tableStatusLabel = isPlaying
                        ? 'In progress'
                        : hasPlayers
                          ? 'Live'
                          : 'Waiting for players';
                      const openSeats = t.maxSeats - t.seatedCount;
                      const cashTh = 'py-2.5 px-3 align-middle border-b border-slate-600/35';
                      const btnSecondary =
                        'inline-flex h-8 min-w-[5.75rem] items-center justify-center rounded-lg border border-slate-500/55 bg-black/30 text-xs font-semibold text-slate-200 hover:border-white/35 hover:bg-white/[0.04] transition-colors';
                      const btnPrimary =
                        'inline-flex h-8 min-w-[5.75rem] items-center justify-center rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-500 text-xs font-semibold text-white shadow-sm hover:opacity-95 transition-opacity';
                      const btnGhost =
                        'inline-flex h-8 items-center justify-center rounded-lg px-2 text-xs font-semibold text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] transition-colors disabled:opacity-40';
                      return (
                        <React.Fragment key={t.id}>
                          <tr className="hover:bg-white/[0.03]">
                            <td className={`${cashTh} tabular-nums`}>
                              <div className="font-medium text-slate-100">
                                {formatChips(t.smallBlind)} / {formatChips(t.bigBlind)}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">No-limit Hold&apos;em</div>
                            </td>
                            <td className={cashTh}>
                              <div className="font-medium text-slate-200">{tableStatusLabel}</div>
                              {t.hasPin ? (
                                <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                                  <Lock className="w-3.5 h-3.5 text-amber-400/90 shrink-0" aria-hidden />
                                  <span className="text-amber-400/90 font-medium">Private</span>
                                </div>
                              ) : null}
                            </td>
                            <td className={`${cashTh} font-mono text-xs text-slate-300`}>
                              <span title={t.creatorAddress ?? undefined}>{shortenHexAddress(t.creatorAddress)}</span>
                            </td>
                            <td className={`${cashTh} text-xs text-slate-400 whitespace-nowrap`}>
                              {formatTableAge(t.createdAt)}
                            </td>
                            <td className={`${cashTh} tabular-nums`}>
                              <div className="font-medium text-slate-100">
                                {t.seatedCount}/{t.maxSeats}{' '}
                                <span className="text-slate-500 font-normal">seated</span>
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {openSeats} open
                              </div>
                            </td>
                            <td className={`${cashTh} text-right`}>
                              <div className="inline-flex flex-col items-end gap-1.5">
                                <div className="flex items-center justify-end gap-2">
                                  <Link href={`/poker/${t.id}`} className={btnSecondary}>
                                    Watch
                                  </Link>
                                  {isConnected && (
                                    onboarding.currentStep < 4 ? (
                                      <button
                                        type="button"
                                        onClick={() => setShowOnboardingWizard(true)}
                                        className={btnPrimary}
                                        style={{
                                          background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                                          boxShadow: '0 6px 20px -6px rgba(245,158,11,0.5)',
                                        }}
                                        title="You need chips to sit — we'll walk you through it"
                                      >
                                        Get chips →
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const bbChips = BigInt(t.bigBlind);
                                          const { maxChips } = getCashBuyInBoundsChips(bbChips);
                                          setBuyIn(maxChips.toString());
                                          setJoinModal({ tableId: t.id, hasPin: t.hasPin, bigBlindChips: t.bigBlind });
                                          setJoinPin('');
                                        }}
                                        className={btnPrimary}
                                      >
                                        Sit
                                      </button>
                                    )
                                  )}
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openPlayersDropdown(t.id)}
                                    className={btnGhost}
                                  >
                                    {playersDropdownTableId === t.id ? 'Hide roster' : 'Roster'}
                                  </button>
                                  {isAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => removeTable(t.id)}
                                      disabled={removingTableId === t.id}
                                      className={btnGhost}
                                    >
                                      {removingTableId === t.id ? '…' : 'Remove'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                          {playersDropdownTableId === t.id && (
                            <tr className="bg-black/20">
                              <td colSpan={6} className="px-3 py-3 border-b border-slate-600/35">
                                <div className="rounded-lg border border-slate-600/50 overflow-hidden bg-black/25">
                                  <div className="px-3 py-2 border-b border-slate-600/45">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                      Seated players
                                    </span>
                                  </div>
                                  <div className="px-3 py-2 max-h-32 overflow-y-auto md:max-h-24">
                                    {tablePlayersLoading ? (
                                      <p className="text-slate-500 text-sm py-1">Loading…</p>
                                    ) : tablePlayers?.tableId === t.id ? (
                                      (() => {
                                        const seated = tablePlayers.seats.filter((s) => s.playerAddress);
                                        if (seated.length === 0) {
                                          return <p className="text-slate-500 text-sm py-1">No players seated</p>;
                                        }
                                        return (
                                          <ul className="divide-y divide-slate-700/40">
                                            {seated.map((s) => (
                                              <li
                                                key={s.position}
                                                className="flex items-center justify-between gap-3 py-2 text-sm text-slate-300"
                                              >
                                                <span className="font-medium text-slate-400 shrink-0">
                                                  Seat {s.position + 1}
                                                </span>
                                                <span
                                                  className="font-mono text-slate-300 truncate text-right"
                                                  title={s.playerAddress ?? ''}
                                                >
                                                  {s.playerAddress ? truncateAddress(s.playerAddress) : '—'}
                                                </span>
                                              </li>
                                            ))}
                                          </ul>
                                        );
                                      })()
                                    ) : (
                                      <p className="text-slate-500 text-sm py-1">No players seated</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            <PokerTopPlayers myAddress={address ?? null} />

            <div className="mt-6">
              <GameFAQ
                game="poker"
                addresses={[
                  { label: 'MORBIUS Token', address: MORBIUS_TOKEN_ADDRESS },
                ]}
              />
            </div>
          </div>

          {joinModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div
              className="bg-gradient-to-br from-slate-900 to-slate-800 border-2 border-white/25 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden"
              style={Theme.panel?.base}
            >
              <div className="p-4 border-b border-white/25">
                <h3 className="text-lg font-semibold text-cyan-400 flex items-center gap-2">
                  Join Table
                  {joinModal.hasPin && (
                    <span className="flex items-center gap-1 text-xs font-medium text-amber-400">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C9.24 2 7 4.24 7 7v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V7c0-2.76-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3v3H9V7c0-1.66 1.34-3 3-3zm0 10c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z" /></svg>
                      Private
                    </span>
                  )}
                </h3>
              </div>
              <div className="p-4 space-y-4">
                {joinModal.hasPin && (
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Table PIN</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={joinPin}
                      onChange={(e) => setJoinPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="Enter 4-digit PIN"
                      className="w-full rounded-lg bg-slate-800 border border-amber-500/40 px-3 py-2 text-white text-center tracking-[0.5em] text-lg font-mono"
                      autoFocus
                    />
                  </div>
                )}
                {chipBalance != null && (() => {
                  try {
                    return BigInt(parseChipInput(buyIn)) > BigInt(chipBalance);
                  } catch {
                    return false;
                  }
                })() && (
                  <p className="text-amber-400 text-sm">
                    Insufficient poker chips. <button type="button" onClick={() => setShowDepositModal(true)} className="underline hover:text-amber-300">Get chips</button>
                  </p>
                )}
                <div className="rounded-lg bg-slate-800/80 border border-white/20 px-3 py-2.5 space-y-1">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    <span className="text-cyan-400/90 font-medium">Cash buy-in:</span>{' '}
                    {joinModal ? (
                      <>
                        For this table:{' '}
                        <span className="text-slate-300 tabular-nums">
                          {formatChips(getCashBuyInBoundsChips(BigInt(joinModal.bigBlindChips)).minChips)} –{' '}
                          {formatChips(getCashBuyInBoundsChips(BigInt(joinModal.bigBlindChips)).maxChips)}
                        </span>{' '}
                        chips (off-chain).
                      </>
                    ) : null}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    No in-table top-ups — leave and rejoin to change your stack.
                  </p>
                </div>
                <label className="block text-sm text-slate-400">Buy-in (whole chips)</label>
                <input
                  type="text"
                  value={buyIn}
                  onChange={(e) => setBuyIn(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full rounded-lg bg-slate-800 border border-white/25 px-3 py-2 text-white"
                />
                {joinBuyInOutOfRange && buyIn.trim() !== '' && (
                  <p className="text-amber-400/90 text-xs">
                    Enter between {formatChips(getCashBuyInBoundsChips(BigInt(joinModal.bigBlindChips)).minChips)} and{' '}
                    {formatChips(getCashBuyInBoundsChips(BigInt(joinModal.bigBlindChips)).maxChips)} chips.
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setJoinModal(null)}
                    className="flex-1 py-2 rounded-lg border border-slate-500 text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const insufficient = chipBalance != null && (() => {
                        try { return BigInt(parseChipInput(buyIn)) > BigInt(chipBalance); }
                        catch { return false; }
                      })();
                      if (insufficient) {
                        setShowInsufficientChips(true);
                        return;
                      }
                      handleJoin();
                    }}
                    disabled={
                      joinBuyInOutOfRange
                      || (joinModal.hasPin && !/^\d{4}$/.test(joinPin))
                    }
                    className="flex-1 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 text-white disabled:opacity-50"
                  >
                    Join
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

          <PokerHowToPlayModal isOpen={showHowToPlay} onClose={() => setShowHowToPlay(false)} />
          <PokerStatsModal
            isOpen={showStatsModal}
            onClose={() => setShowStatsModal(false)}
            playerAddress={address ?? null}
          />

          {createModal && (() => {
            const sb = Number(createModal.smallBlind) || 0;
            const bb = Number(createModal.bigBlind) || 0;
            const blindsValid = sb > 0 && bb > 0;
            const pinValid = !createModal.pinEnabled || /^\d{4}$/.test(createModal.pinCode);
            const canCreate = !creating && blindsValid && pinValid;
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                <MorbCard className="w-full max-w-sm" beams glowIntensity="normal">
                  <div className="p-5 space-y-4">
                    <MorbHeroAmount
                      label="CASH GAME · MORBIUS"
                      amount={blindsValid ? `${sb} / ${bb}` : '— / —'}
                      ticker="SB / BB"
                      secondary={`Up to ${createModal.maxSeats} seats`}
                    />

                    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3 space-y-2.5">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300/70">Table setup</p>
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Small blind</label>
                          <MorbInput
                            type="text"
                            inputMode="decimal"
                            value={createModal.smallBlind}
                            onChange={(e) => setCreateModal((m) => m ? { ...m, smallBlind: e.target.value } : null)}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Big blind</label>
                          <MorbInput
                            type="text"
                            inputMode="decimal"
                            value={createModal.bigBlind}
                            onChange={(e) => setCreateModal((m) => m ? { ...m, bigBlind: e.target.value } : null)}
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">Max seats (2–10)</label>
                        <MorbInput
                          type="number"
                          min={2}
                          max={10}
                          value={createModal.maxSeats}
                          onChange={(e) => setCreateModal((m) => m ? { ...m, maxSeats: Math.min(10, Math.max(2, Number(e.target.value) || 10)) } : null)}
                        />
                      </div>
                      <p className="text-[10px] text-slate-500">Blinds are in MORBIUS (e.g. 10 = 10 MORBIUS).</p>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Lock className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-xs text-slate-200">Private table</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setCreateModal((m) => m ? { ...m, pinEnabled: !m.pinEnabled, pinCode: '' } : null)}
                          aria-pressed={createModal.pinEnabled}
                          className={`relative w-9 h-5 rounded-full transition-colors ${createModal.pinEnabled ? 'bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'bg-slate-700'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${createModal.pinEnabled ? 'translate-x-4' : ''}`} />
                        </button>
                      </div>
                      {createModal.pinEnabled && (
                        <div>
                          <label className="block text-[10px] uppercase tracking-wider text-slate-400 mb-1">4-digit PIN</label>
                          <MorbInput
                            type="text"
                            inputMode="numeric"
                            maxLength={4}
                            value={createModal.pinCode}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                              setCreateModal((m) => m ? { ...m, pinCode: v } : null);
                            }}
                            placeholder="0000"
                            className="text-center tracking-[0.5em] font-mono"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">Share this PIN with invited players.</p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <MorbSecondaryButton
                        type="button"
                        onClick={() => setCreateModal(null)}
                        className="flex-1"
                      >
                        Cancel
                      </MorbSecondaryButton>
                      <MorbGradientButton
                        type="button"
                        onClick={handleCreateTable}
                        disabled={!canCreate}
                        loading={creating}
                        className="flex-1"
                      >
                        {creating ? 'Creating…' : 'Create table'}
                      </MorbGradientButton>
                    </div>
                  </div>
                </MorbCard>
              </div>
            );
          })()}

          <Footer />
        </div>
      </GlobalMainNav>

      <GameWalletModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        balanceLabel="Poker Balance"
        defaultTab={walletDefaultTab}
      />
      <PokerChipExchangeModal
        isOpen={showChipExchange}
        onClose={() => setShowChipExchange(false)}
        walletAddress={address ?? null}
        onExchangeComplete={refreshLobbyBalances}
      />
      <InsufficientBalanceDialog
        isOpen={showInsufficientChips}
        onClose={() => setShowInsufficientChips(false)}
        title="Not Enough Poker Chips"
        message="Your poker chip balance isn't enough for this buy-in. Walk through deposit and chip exchange in a guided flow, or open the exchange directly."
        required={(() => { try { return `${formatChips(BigInt(parseChipInput(buyIn)))} chips`; } catch { return undefined; } })()}
        balance={chipBalance != null ? `${formatChips(BigInt(chipBalance))} chips` : undefined}
        actionLabel="Walk me through it"
        onOpenExchange={() => setShowOnboardingWizard(true)}
      />

      <PokerOnboardingWizard
        isOpen={showOnboardingWizard}
        onClose={() => setShowOnboardingWizard(false)}
        step={onboarding.currentStep}
        isConnected={isConnected}
        walletMorbiusWei={onboarding.walletMorbiusWei}
        playBalanceWei={onboarding.playBalanceBn}
        chipsBn={onboarding.chipsBn}
        onOpenDeposit={() => setShowDepositModal(true)}
        onOpenExchange={() => setShowChipExchange(true)}
      />
    </>
  );
}
