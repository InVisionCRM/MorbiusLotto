'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
import { formatChips } from '@/lib/format-poker-chips';
import { formatPokerLastActionLine } from '@/lib/format-poker-last-action';
import { POKER_CASH_MIN_BUY_IN_BB, POKER_CASH_MAX_BUY_IN_BB, POKER_CHIP_WEI } from '@/lib/poker-buy-in';
import type { BlackjackWebSocketClient, PokerTableState } from '@/lib/websocket-client';
import { DEFAULT_POKER_THEME, getPokerThemeVars } from '@/lib/poker-themes';
import { PokerThemeProvider } from '@/components/poker/PokerThemeContext';
import { PokerActions } from '@/components/poker/PokerActions';
import { PokerTableEffectProvider } from '@/hooks/use-poker-table-effect';
import { useQuickChatPhrases } from '@/hooks/useQuickChatPhrases';
import { useProfileWs } from '@/contexts/profile-ws-context';
import { isAdminWallet } from '@/lib/admin';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PokerBetaSplash } from '@/components/poker/PokerBetaSplash';
import { useSpeechCommands, type PokerSpeechAction } from '@/hooks/use-speech-commands';
import { useSpeechEnabled } from '@/hooks/use-speech-enabled';
import { SpeechHUD } from '@/components/shared/SpeechHUD';
import { SpeechConfirmDialog } from '@/components/shared/SpeechConfirmDialog';
import { SophieSplashModal } from '@/components/shared/SophieSplashModal';
import { PokerHeaderBar } from './PokerHeaderBar';
import { PokerTableView } from './PokerTableView';
import { PokerPopups } from './PokerPopups';
import { PokerPanels } from './PokerPanels';
import { PokerBottomBar, POKER_BOTTOM_RESERVE_VAR } from './PokerBottomBar';
import { usePokerConnection } from './PokerConnection';
import { usePokerActionsLogic } from './PokerActionsLogic';
import { usePokerSeatOverlays } from './PokerSeatOverlays';
import { usePokerMobileZoomLock } from './PokerMobileZoomLock';
import { usePokerTurnClock } from './PokerTurnClock';
import { usePokerTableSounds } from './PokerSounds';
import { usePokerTableTournamentHud } from '@/hooks/use-poker-tournament';
import { TournamentBlindIncreaseOverlay } from '@/components/poker/tournament/TournamentBlindIncreaseOverlay';
import { PokerTournamentHUD } from '@/components/poker/tournament/PokerTournamentHUD';
import { PokerActivityFeed } from '@/components/poker/PokerActivityFeed';
import { Sidebar, SidebarBody } from '@/components/ui/sidebar';
import {
  applyPokerE2EMockAction,
  POKER_E2E_MOCK_ADDRESS,
  type PokerE2ETestApi,
} from './e2e-mock';

function tournamentFinishOrdinal(rank: number): string {
  const j = rank % 10;
  const k = rank % 100;
  if (j === 1 && k !== 11) return `${rank}st`;
  if (j === 2 && k !== 12) return `${rank}nd`;
  if (j === 3 && k !== 13) return `${rank}rd`;
  return `${rank}th`;
}

export default function PokerTablePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tableId = typeof params.tableId === 'string' ? params.tableId : '';
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const joinFromLobby = searchParams.get('join') === '1';
  const buyInParam = searchParams.get('buyIn');
  const pinParam = searchParams.get('pin');
  const tournamentIdParam = searchParams.get('tournament');
  const isE2EMock = searchParams.get('e2eMock') === '1';

  const [testStateOverride, setTestStateOverride] = useState<PokerTableState | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [depositModalTab, setDepositModalTab] = useState<'deposit' | 'reup'>('deposit');
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [statsModalAddress, setStatsModalAddress] = useState<string | null>(null);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showMyStats, setShowMyStats] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [opponentProfileAddress, setOpponentProfileAddress] = useState<string | null>(null);
  const isAdmin = isAdminWallet(address);
  const [tipAnimating, setTipAnimating] = useState(false);
  const [adminBotsBusy, setAdminBotsBusy] = useState(false);
  const adminBotMax = 10;
  /** Bumped to open Activity drawer from seat radial on mobile. */
  const [activityMobileOpenSerial, setActivityMobileOpenSerial] = useState(0);

  const normalizedAddress = address?.toLowerCase() ?? null;
  const effectivePlayerAddress = normalizedAddress ?? (isE2EMock ? POKER_E2E_MOCK_ADDRESS : null);
  const profileWs = useProfileWs();
  const profileSetWsClient = profileWs?.setWsClient;
  const queryClient = useQueryClient();
  const setProfileWsClient = useCallback((client: BlackjackWebSocketClient | null) => {
    profileSetWsClient?.(client);
  }, [profileSetWsClient]);
  const replaceUrl = useCallback((url: string) => {
    router.replace(url);
  }, [router]);
  const {
    state,
    setState,
    wsConnected,
    wsClient,
    error,
    disconnected,
    clientRef,
    fetchLatestState,
  } = usePokerConnection({
    tableId,
    normalizedAddress,
    signTypedDataAsync,
    isE2EMock,
    joinFromLobby,
    buyInParam,
    pinParam,
    setProfileWsClient,
    replaceUrl,
  });
  const renderedState = testStateOverride ?? state;

  const handleTournamentCompleted = useCallback(
    (winners: { address: string; rank: number; prizeAmount: string }[]) => {
      const me = effectivePlayerAddress?.toLowerCase() ?? null;
      const myWin = me ? winners.find((w) => w.address.toLowerCase() === me) : undefined;

      if (myWin) {
        const prizeWei = BigInt(myWin.prizeAmount || '0');
        if (prizeWei > 0n) {
          toast.success(
            `You finished ${tournamentFinishOrdinal(myWin.rank)} — ${formatMorbiusFloor(myWin.prizeAmount)} MORBIUS added to your balance.`,
          );
        } else {
          toast.info(`Tournament complete. You finished ${tournamentFinishOrdinal(myWin.rank)}.`);
        }
      } else if (me) {
        toast.info('Tournament complete. You did not cash this time — thanks for playing.');
      } else {
        const top = winners.find((w) => w.rank === 1);
        toast.success(
          top
            ? `Champion: ${top.address.slice(0, 6)}…${top.address.slice(-4)}`
            : 'Tournament complete',
        );
      }

      void clientRef.current?.syncBalance().catch(() => {});
      if (me && me.length === 42) {
        queryClient.invalidateQueries({ queryKey: ['player-server-balance', me] });
      }

      router.replace('/poker?tab=tournaments');
    },
    [router, effectivePlayerAddress, queryClient, clientRef],
  );

  const handleTournamentCancelled = useCallback(() => {
    toast.info('Tournament cancelled.');
    const me = effectivePlayerAddress?.toLowerCase() ?? null;
    void clientRef.current?.syncBalance().catch(() => {});
    if (me && me.length === 42) {
      queryClient.invalidateQueries({ queryKey: ['player-server-balance', me] });
    }
    router.replace('/poker?tab=tournaments');
  }, [router, effectivePlayerAddress, queryClient, clientRef]);

  const [blindIncreaseBanner, setBlindIncreaseBanner] = useState<{
    playId: number;
    newLevel: number;
    smallBlind: number;
    bigBlind: number;
  } | null>(null);

  const handleBlindLevelUp = useCallback(
    (p: { newLevel: number; smallBlind: number; bigBlind: number }) => {
      setBlindIncreaseBanner((prev) => ({
        playId: (prev?.playId ?? 0) + 1,
        ...p,
      }));
    },
    [],
  );

  /** Prefer server `PokerTableState.tournamentId`; once a snapshot exists, ignore stray `?tournament=` on cash tables. */
  const resolvedTournamentId = useMemo(() => {
    if (renderedState) {
      const tid = renderedState.tournamentId;
      if (tid != null && String(tid).length > 0) return String(tid);
      return null;
    }
    const early = state?.tournamentId;
    if (early != null && String(early).length > 0) return String(early);
    return tournamentIdParam && tournamentIdParam.length > 0 ? tournamentIdParam : null;
  }, [renderedState, state?.tournamentId, tournamentIdParam]);

  const tournamentHudState = usePokerTableTournamentHud({
    wsClient,
    wsConnected,
    tournamentId: resolvedTournamentId,
    tableId,
    pokerHandId: renderedState?.currentHand?.handId,
    onTournamentCompleted: handleTournamentCompleted,
    onTournamentCancelled: handleTournamentCancelled,
    onBlindLevelUp: handleBlindLevelUp,
  });

  const tournamentHUDProp =
    tournamentHudState && effectivePlayerAddress
      ? { state: tournamentHudState, myAddress: effectivePlayerAddress }
      : null;

  useEffect(() => {
    if (!isE2EMock || typeof window === 'undefined') return;
    const e2eTestApi: PokerE2ETestApi = {
      setState: (nextState: PokerTableState) => setTestStateOverride(nextState),
      clearState: () => setTestStateOverride(null),
      getState: () => renderedState,
    };
    window.__POKER_E2E_TEST_API = e2eTestApi;
    return () => {
      delete window.__POKER_E2E_TEST_API;
    };
  }, [isE2EMock, renderedState]);

  const applyE2EMockAction = useCallback(
    (action: 'fold' | 'check' | 'call' | 'bet' | 'raise', amount?: string): boolean => {
      if (!isE2EMock) return false;
      setTestStateOverride((prev) =>
        applyPokerE2EMockAction({
          base: prev ?? state,
          playerAddress: effectivePlayerAddress,
          action,
          amount,
        })
      );
      return true;
    },
    [isE2EMock, state, effectivePlayerAddress]
  );
  const pokerChatRoomId = tableId ? `poker:table:${tableId}` : '';
  const { isPortraitMobile, tableScale } = usePokerMobileZoomLock();


  const handleLeave = useCallback(() => {
    if (!clientRef.current) return;
    setShowLeaveConfirm(false);
    clientRef.current
      .pokerLeaveTable(tableId)
      .then(() => {
        // Prevent the unmount effect from leaving again
        clientRef.current = null;
        router.push('/poker');
      })
      .catch((err) => toast.error((err as Error).message));
  }, [tableId, router]);

  const handleLeaveClick = useCallback(() => {
    setShowLeaveConfirm(true);
  }, []);

  const {
    hand,
    mySeatIndex,
    mySeat,
    canReup,
    canAct,
    canCheck,
    callAmount,
    queuedPreAction,
    setQueuedPreAction,
    handleFold,
    handleCheck,
    handleCall,
    handleBet,
    handleRaise,
  } = usePokerActionsLogic({
    tableId,
    state,
    setState,
    renderedState,
    effectivePlayerAddress,
    clientRef,
    applyE2EMockAction,
  });
  // ── Voice commands ────────────────────────────────────────────────────────
  const { enabled: speechEnabled, setEnabled: setSpeechEnabled } = useSpeechEnabled(address);
  const [voiceSplashOpen, setVoiceSplashOpen] = useState(false);
  const [lastSpeechAction, setLastSpeechAction] = useState<string | null>(null);
  const lastSpeechActionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSpeechAction = useCallback((label: string) => {
    setLastSpeechAction(label);
    if (lastSpeechActionTimer.current) clearTimeout(lastSpeechActionTimer.current);
    lastSpeechActionTimer.current = setTimeout(() => setLastSpeechAction(null), 3000);
  }, []);

  const handleVoicePokerAction = useCallback((action: PokerSpeechAction) => {
    if (!canAct) return;
    if (action.type === 'fold')    { showSpeechAction('Fold');                          handleFold(); return; }
    if (action.type === 'check')   { showSpeechAction('Check');                         handleCheck(); return; }
    if (action.type === 'call')    { showSpeechAction('Call');                          handleCall(); return; }
    if (action.type === 'all_in')  { showSpeechAction('All In');                        handleRaise(mySeat?.stack ?? '0'); return; }
    if (action.type === 'bet')     { showSpeechAction(`Bet ${action.amount}`);          handleBet(String(action.amount)); return; }
    if (action.type === 'raise')   { showSpeechAction(`Raise to ${action.amount}`);     handleRaise(String(action.amount)); return; }
  }, [canAct, handleFold, handleCheck, handleCall, handleBet, handleRaise, mySeat, showSpeechAction]);

  const speech = useSpeechCommands({
    mode: 'poker',
    onPokerAction: handleVoicePokerAction,
  });

  useEffect(() => {
    if (speechEnabled) speech.start();
    else speech.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speechEnabled]);

  const {
    chatBubbleBySeatIndex,
    reactionBySeatIndex,
    broadcastEmotionBySeatIndex,
    onPhraseReaction,
    onAnimationReaction,
  } = usePokerSeatOverlays({
    clientRef,
    pokerChatRoomId,
    tableId,
    normalizedAddress,
    state,
    mySeatIndex,
  });

  const onOpponentRadialAction = useCallback(
    async (action: 'profile' | 'follow' | 'gift', addr: string) => {
      const me = normalizedAddress;
      if (action === 'profile') {
        setOpponentProfileAddress(addr);
        return;
      }
      if (action === 'gift') {
        toast.info('Gifts coming soon');
        return;
      }
      if (action === 'follow') {
        if (!me) {
          toast.error('Connect your wallet to follow players');
          return;
        }
        try {
          const isFollowing = await queryClient.fetchQuery({
            queryKey: ['isFollowing', me, addr],
            queryFn: async () => {
              const res = await fetch(
                `/api/player/${addr}/is-following?follower=${encodeURIComponent(me)}`,
              );
              if (!res.ok) throw new Error('Failed to check follow status');
              const data = await res.json();
              return data.isFollowing as boolean;
            },
          });

          if (isFollowing) {
            const res = await fetch(`/api/player/${addr}/follow`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ follower: me }),
            });
            if (!res.ok) throw new Error('Failed to unfollow');
            toast.success('Unfollowed');
          } else {
            const res = await fetch(`/api/player/${addr}/follow`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ follower: me }),
            });
            if (!res.ok) throw new Error('Failed to follow');
            toast.success('Following');
          }
          await queryClient.invalidateQueries({ queryKey: ['isFollowing', me, addr] });
          await queryClient.invalidateQueries({ queryKey: ['followCounts', addr] });
          await queryClient.invalidateQueries({ queryKey: ['followCounts', me] });
        } catch {
          toast.error('Could not update follow');
        }
      }
    },
    [normalizedAddress, queryClient],
  );

  const [showSoundsModal, setShowSoundsModal] = useState(false);
  const [showTableSettingsModal, setShowTableSettingsModal] = useState(false);
  const [showEditQuickChatModal, setShowEditQuickChatModal] = useState(false);
  const [autoRebuy, setAutoRebuy] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [statsMenuOpen, setStatsMenuOpen] = useState(false);
  const [quickChatPhrases, setQuickChatPhrases] = useQuickChatPhrases();
  const timeLeft = usePokerTurnClock(hand);
  const { playClick } = usePokerTableSounds({
    canAct,
    hand,
    mySeatIndex,
    state,
    normalizedAddress,
  });

  // Lock body scroll + Escape key when fullscreen is active
  useEffect(() => {
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    if (!isFullscreen) return () => { document.body.style.overflow = ''; };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [isFullscreen]);

  const pokerTheme = DEFAULT_POKER_THEME;
  const themeVars = getPokerThemeVars(pokerTheme);
  const cyberpunk = pokerTheme === 'cyberpunk';

  const fmtChips = (chips: string | number | bigint) => {
    try {
      return formatChips(chips);
    } catch {
      return String(chips);
    }
  };

  const lastActionLine = useMemo(() => {
    const la = renderedState?.currentHand?.lastAction;
    const seats = renderedState?.seats;
    if (!la || !seats?.length) return null;
    return formatPokerLastActionLine(la, seats);
  }, [
    renderedState?.currentHand?.handId,
    renderedState?.currentHand?.lastAction?.position,
    renderedState?.currentHand?.lastAction?.action,
    renderedState?.currentHand?.lastAction?.amount,
    renderedState?.seats,
  ]);

  const sharedActions = renderedState && mySeat && (
    <PokerActions
      canAct={!!canAct}
      canCheck={canCheck}
      preAction={queuedPreAction}
      minRaise={hand?.minRaise ?? '0'}
      stack={mySeat.stack ?? '0'}
      callAmount={callAmount}
      pot={hand?.pot ?? '0'}
      variant={isFullscreen ? 'floating' : 'default'}
      lastActionLine={lastActionLine}
      onPreActionChange={setQueuedPreAction}
      onFold={handleFold}
      onCheck={handleCheck}
      onCall={handleCall}
      onBet={handleBet}
      onRaise={handleRaise}
    />
  );

  const openReupModal = useCallback(() => {
    setDepositModalTab('reup');
    setShowDepositModal(true);
  }, []);

  // ── Auto-rebuy ────────────────────────────────────────────────────────────
  // When enabled, automatically tops the player's stack up to max buy-in
  // whenever the stack falls below the minimum buy-in (40 BB) — including zero.
  // Only fires between hands (no active hand = canReup is true).
  const autoRebuyFiringRef = useRef(false);
  useEffect(() => {
    if (!autoRebuy) return;
    if (!wsClient || !mySeat || !renderedState) return;
    // Only between hands
    const hand = renderedState.currentHand;
    if (hand && hand.street !== 'showdown') return;

    const bbChips = BigInt(renderedState.bigBlind ?? '0');
    if (bbChips === 0n) return;

    const minChips = bbChips * BigInt(POKER_CASH_MIN_BUY_IN_BB);
    const maxChips = bbChips * BigInt(POKER_CASH_MAX_BUY_IN_BB);
    const stackChips = BigInt(mySeat.stack ?? '0');
    if (stackChips >= minChips) return; // Stack is fine, nothing to do

    const toAddChips = maxChips - stackChips;
    if (toAddChips <= 0n) return;
    if (autoRebuyFiringRef.current) return;

    autoRebuyFiringRef.current = true;
    // pokerAddChips expects wei; convert chips -> wei at the boundary.
    wsClient.pokerAddChips(tableId, (toAddChips * POKER_CHIP_WEI).toString())
      .then((newState) => {
        setState(newState);
        toast.success('Auto-rebuy: topped up to max stack');
      })
      .catch((err: Error) => {
        // Silently skip insufficient-balance errors to avoid spam
        if (!err.message?.toLowerCase().includes('insufficient')) {
          toast.error(`Auto-rebuy failed: ${err.message}`);
        }
      })
      .finally(() => {
        autoRebuyFiringRef.current = false;
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRebuy, wsClient, tableId, mySeat?.stack, renderedState?.currentHand?.street, renderedState?.bigBlind]);

  const handleSitOut = useCallback(async () => {
    if (!wsClient) return;
    try {
      const next = await wsClient.pokerSitOut(tableId);
      setState(next);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to sit out');
    }
  }, [wsClient, tableId, setState]);

  const handleSitBack = useCallback(async () => {
    if (!wsClient) return;
    try {
      const next = await wsClient.pokerSitBack(tableId);
      setState(next);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to sit back');
    }
  }, [wsClient, tableId, setState]);

  const onTipDealer = useCallback(async () => {
    if (!wsClient) return;
    playClick();
    try {
      await wsClient.sendRequest('tip_dealer', {
        amount: (BigInt(2000) * BigInt('1000000000000000000')).toString(),
      });
      fetchLatestState();
    } catch {
      // Ignore tip failures for now; existing behavior swallows errors.
    }
  }, [wsClient, playClick, fetchLatestState]);

  const extractApiError = useCallback((raw: string, status: number, fallback: string) => {
    if (!raw) return `${fallback} (HTTP ${status})`;
    try {
      const parsed = JSON.parse(raw) as { error?: string; message?: string };
      const msg = parsed?.error || parsed?.message || raw;
      return `${msg} (HTTP ${status})`;
    } catch {
      return `${raw} (HTTP ${status})`;
    }
  }, []);

  const onAdminStartBots = useCallback(async (numBots: number) => {
    if (!address || !tableId) return;
    const clampedBots = Math.max(1, Math.min(adminBotMax, Math.floor(numBots || 1)));
    setAdminBotsBusy(true);
    try {
      const res = await fetch('/api/admin/poker/bots/bootstrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-wallet': address,
        },
        body: JSON.stringify({ tableId, numBots: clampedBots }),
      });
      const raw = await res.text().catch(() => '');
      let data: Record<string, unknown> = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          data = {};
        }
      }
      if (!res.ok) {
        const msg = extractApiError(raw, res.status, 'Failed to start bot players');
        throw new Error(msg);
      }
      const botCount = typeof data?.numBots === 'number' ? data.numBots : null;
      toast.success(botCount ? `Started ${botCount} bot player(s)` : 'Started bot players');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to start bot players');
    } finally {
      setAdminBotsBusy(false);
    }
  }, [address, tableId, adminBotMax, extractApiError]);

  const onAdminStopBots = useCallback(async () => {
    if (!address || !tableId) return;
    setAdminBotsBusy(true);
    try {
      const res = await fetch('/api/admin/poker/bots/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-wallet': address,
        },
        body: JSON.stringify({ tableId }),
      });
      const raw = await res.text().catch(() => '');
      if (!res.ok) {
        const msg = extractApiError(raw, res.status, 'Failed to stop bot players');
        throw new Error(msg);
      }
      toast.success('Stopped bot players');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to stop bot players');
    } finally {
      setAdminBotsBusy(false);
    }
  }, [address, tableId, extractApiError]);

  return (
    <>
    <PokerThemeProvider themeId={pokerTheme}>
      <PokerTableEffectProvider>
        {!isE2EMock && <PokerBetaSplash />}

        {/* Portrait blocker: shown on mobile when holding phone upright */}
        {isPortraitMobile && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              background: 'rgb(2 6 23)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1.25rem',
              color: 'var(--poker-text, #e2e8f0)',
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="56"
              height="56"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.7, animation: 'poker-rotate-hint 2s ease-in-out infinite' }}
            >
              <rect x="5" y="2" width="14" height="20" rx="2" />
              <path d="M12 18h.01" />
            </svg>
            <p style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0 }}>Rotate your device</p>
            <p style={{ fontSize: '0.85rem', opacity: 0.55, margin: 0 }}>Poker requires landscape orientation</p>
          </div>
        )}

        {/* LANDSCAPE NOTE: Landscape mobile support is layered via CSS only
            (@media orientation: landscape rules in globals.css). Do NOT restructure
            this flex-col layout, reorder children, or add conditional rendering
            for landscape vs portrait — it will break the portrait layout that
            works well today. See globals.css "Poker landscape" section. */}
        <div
          data-poker-shell
          className={`flex flex-col relative ${cyberpunk ? 'font-mono uppercase' : ''}`}
          style={{
            ...themeVars as React.CSSProperties,
            height: '100dvh',
            background: 'rgb(2 6 23)',
            color: 'var(--poker-text)',
            overflow: 'hidden',
            paddingLeft: 'env(safe-area-inset-left, 0px)',
            paddingRight: 'env(safe-area-inset-right, 0px)',
          }}
        >
          {!isFullscreen && <PokerHeaderBar
            renderedState={renderedState}
            fmtChips={fmtChips}
            normalizedAddress={normalizedAddress}
            isAdmin={isAdmin}
            showMyStats={showMyStats}
            showDashboard={showDashboard}
            settingsMenuOpen={settingsMenuOpen}
            statsMenuOpen={statsMenuOpen}
            setSettingsMenuOpen={setSettingsMenuOpen}
            setStatsMenuOpen={setStatsMenuOpen}
            setShowHowToPlay={setShowHowToPlay}
            setShowTableSettingsModal={setShowTableSettingsModal}
            setShowSoundsModal={setShowSoundsModal}
            setShowEditQuickChatModal={setShowEditQuickChatModal}
            setStatsModalAddress={setStatsModalAddress}
            setShowStatsModal={setShowStatsModal}
            setShowMyStats={setShowMyStats}
            setShowDashboard={setShowDashboard}
            adminBotsBusy={adminBotsBusy}
            adminBotMax={adminBotMax}
            onAdminStartBots={onAdminStartBots}
            onAdminStopBots={onAdminStopBots}
            onLeaveClick={handleLeaveClick}
            autoRebuy={autoRebuy}
            onToggleAutoRebuy={mySeat ? () => setAutoRebuy((v) => !v) : undefined}
          />}

          {/* Disconnected banner */}
          {disconnected && (
            <div
              className="flex-shrink-0 py-1.5 text-center text-[11px] font-medium animate-pulse"
              style={{ color: 'var(--poker-danger)', background: 'color-mix(in srgb, var(--poker-danger) 10%, transparent)', borderBottom: '1px solid var(--poker-danger)' }}
            >
              Connection lost — reconnecting...
            </div>
          )}

          {!isFullscreen && <PokerPanels
            tableId={tableId}
            renderedState={renderedState}
            isAdmin={isAdmin}
            normalizedAddress={normalizedAddress}
            showDashboard={showDashboard}
            setShowDashboard={setShowDashboard}
            showMyStats={showMyStats}
            setShowMyStats={setShowMyStats}
          />}

          <div
            className="flex flex-row flex-1 min-h-0 min-w-0 relative"
            style={{ paddingBottom: `var(${POKER_BOTTOM_RESERVE_VAR}, 0px)` }}
          >
            {tournamentHUDProp && !isFullscreen && (
              <Sidebar pinStorageKey="poker-table-tournament-hud-pinned">
                <SidebarBody
                  className="!sticky !top-0 !h-full !py-0 !px-0 bg-[rgba(6,8,12,0.92)] border-r border-white/10"
                >
                  <PokerTournamentHUD
                    state={tournamentHUDProp.state}
                    myAddress={tournamentHUDProp.myAddress}
                  />
                </SidebarBody>
              </Sidebar>
            )}

            <PokerTableView
              tableScale={tableScale}
              fullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen(f => !f)}
              renderedState={renderedState}
              effectivePlayerAddress={effectivePlayerAddress}
              handleLeaveClick={handleLeaveClick}
              setActivityMobileOpenSerial={setActivityMobileOpenSerial}
              timeLeft={timeLeft}
              chatBubbleBySeatIndex={chatBubbleBySeatIndex}
              reactionBySeatIndex={reactionBySeatIndex}
              broadcastEmotionBySeatIndex={broadcastEmotionBySeatIndex}
              mySeatIndex={mySeatIndex}
              onPhraseReaction={onPhraseReaction}
              onAnimationReaction={onAnimationReaction}
              canReup={canReup}
              openReupModal={openReupModal}
              mySeat={mySeat}
              setShowAvatarModal={setShowAvatarModal}
              setOpponentProfileAddress={setOpponentProfileAddress}
              onOpponentRadialAction={onOpponentRadialAction}
              quickChatPhrases={quickChatPhrases}
              setQuickChatPhrases={setQuickChatPhrases}
              setShowEditQuickChatModal={setShowEditQuickChatModal}
              error={error}
              showDashboard={showDashboard}
              showMyStats={showMyStats}
              wsConnected={wsConnected}
              wsClient={wsClient}
              tipAnimating={tipAnimating}
              setTipAnimating={setTipAnimating}
              onTipDealer={onTipDealer}
              onSitOut={mySeat ? handleSitOut : undefined}
              onSitBack={mySeat ? handleSitBack : undefined}
            />

            {pokerChatRoomId && !isFullscreen && (
              <Sidebar
                pinStorageKey="poker-table-activity-rail-pinned"
                desktopRailSide="right"
              >
                <SidebarBody
                  desktopOnly
                  className="!sticky !top-0 !h-full !py-0 !px-0 bg-[rgba(6,8,12,0.92)] border-l border-white/10"
                >
                  <PokerActivityFeed
                    layout="right-rail"
                    wsClient={wsClient}
                    wsConnected={wsConnected}
                    roomId={pokerChatRoomId}
                    tableId={tableId}
                    state={renderedState}
                    mobileOpenRequestSerial={activityMobileOpenSerial}
                    quickChatPhrases={quickChatPhrases}
                    onQuickChatPhrase={onPhraseReaction}
                    onOpenEditQuickChat={() => setShowEditQuickChatModal(true)}
                    quickChatEligible={mySeatIndex >= 0}
                  />
                </SidebarBody>
              </Sidebar>
            )}
          </div>

          <PokerBottomBar
            fullscreen={isFullscreen}
            renderedState={renderedState}
            mySeat={mySeat}
            actions={sharedActions}
          />
        </div>

        <PokerPopups
          showDepositModal={showDepositModal}
          setShowDepositModal={setShowDepositModal}
          depositModalTab={depositModalTab}
          mySeat={mySeat}
          wsClient={wsClient}
          tableId={tableId}
          setState={setState}
          canReup={canReup}
          showStatsModal={showStatsModal}
          setShowStatsModal={setShowStatsModal}
          statsModalAddress={statsModalAddress}
          showSoundsModal={showSoundsModal}
          setShowSoundsModal={setShowSoundsModal}
          showTableSettingsModal={showTableSettingsModal}
          setShowTableSettingsModal={setShowTableSettingsModal}
          isAdmin={isAdmin}
          renderedState={renderedState}
          showEditQuickChatModal={showEditQuickChatModal}
          setShowEditQuickChatModal={setShowEditQuickChatModal}
          quickChatPhrases={quickChatPhrases}
          setQuickChatPhrases={setQuickChatPhrases}
          showHowToPlay={showHowToPlay}
          setShowHowToPlay={setShowHowToPlay}
          showLeaveConfirm={showLeaveConfirm}
          setShowLeaveConfirm={setShowLeaveConfirm}
          fmtChips={fmtChips}
          handleLeave={handleLeave}
          opponentProfileAddress={opponentProfileAddress}
          setOpponentProfileAddress={setOpponentProfileAddress}
          setStatsModalAddress={setStatsModalAddress}
          showAvatarModal={showAvatarModal}
          setShowAvatarModal={setShowAvatarModal}
          onAvatarSaved={() => {
            fetchLatestState();
            queryClient.invalidateQueries({ queryKey: ['playerProfile'] });
          }}
        />
      </PokerTableEffectProvider>
      </PokerThemeProvider>

      <SpeechHUD
        listening={speech.listening}
        transcript={speech.transcript}
        lastAction={lastSpeechAction}
        pendingLabel={speech.pendingLabel}
        supported={speech.supported}
        onToggle={() => { if (speechEnabled) setSpeechEnabled(false); else setVoiceSplashOpen(true); }}
      />
      {speech.pendingLabel && (
        <SpeechConfirmDialog
          label={speech.pendingLabel}
          onYes={speech.confirmYes}
          onNo={speech.confirmNo}
        />
      )}
      <SophieSplashModal address={address} forceOpen={voiceSplashOpen} onClose={() => setVoiceSplashOpen(false)} onEnable={() => setSpeechEnabled(true)} />
      {blindIncreaseBanner && (
        <TournamentBlindIncreaseOverlay
          playId={blindIncreaseBanner.playId}
          newLevel={blindIncreaseBanner.newLevel}
          smallBlind={blindIncreaseBanner.smallBlind}
          bigBlind={blindIncreaseBanner.bigBlind}
          onAnimationEnd={() => setBlindIncreaseBanner(null)}
        />
      )}
    </>
  );
}
