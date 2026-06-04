'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { apiFetch } from '@/lib/api-auth';
import { formatChips } from '@/lib/format-poker-chips';
import { formatPokerLastActionLine } from '@/lib/format-poker-last-action';
import { POKER_CASH_MIN_BUY_IN_BB, POKER_CASH_MAX_BUY_IN_BB } from '@/lib/poker-buy-in';
import type { BlackjackWebSocketClient, PokerTableState } from '@/lib/websocket-client';
import { DEFAULT_POKER_THEME, getPokerThemeVars } from '@/lib/poker-themes';
import { PokerThemeProvider } from '@/components/poker/PokerThemeContext';
import { PokerActions } from '@/components/poker/PokerActions';
import { PokerTableEffectProvider } from '@/hooks/use-poker-table-effect';
import { useQuickChatPhrases } from '@/hooks/useQuickChatPhrases';
import { useProfileWs } from '@/contexts/profile-ws-context';
import { useWalletAction } from '@/contexts/wallet-action-context';
import { isAdminWallet } from '@/lib/admin';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PokerBetaSplash } from '@/components/poker/PokerBetaSplash';
import { DisplayNameWelcomeModal } from '@/components/shared/DisplayNameWelcomeModal';
import { useSpeechCommands, type PokerSpeechAction } from '@/hooks/use-speech-commands';
import { useSpeechEnabled } from '@/hooks/use-speech-enabled';
import { SpeechHUD } from '@/components/shared/SpeechHUD';
import { SpeechConfirmDialog } from '@/components/shared/SpeechConfirmDialog';
import { SophieSplashModal } from '@/components/shared/SophieSplashModal';
import { PokerHeaderBar } from './PokerHeaderBar';
import { PokerTableView } from './PokerTableView';
import { PokerPopups } from './PokerPopups';
import { PokerPanels } from './PokerPanels';
import { PokerBottomBar, POKER_BOTTOM_RESERVE_VAR, POKER_SIDE_STRIP_W } from './PokerBottomBar';
import { usePokerPlayerHands, usePokerHandVerify, usePokerPlayerTableStats } from '@/hooks/use-poker-stats';
import { buildReplaySteps, resultLabel, type ReplayHandSummary } from '@/lib/poker-replay';
import { computeSessionStats, type DockStatsData, type DockTableStats, type DockTableInfo } from '@/lib/poker-session-stats';
import { toBigIntSafe } from '@/lib/safe-bigint';
import { usePokerConnection } from './PokerConnection';
import {
  usePokerActionsLogic,
  applyPokerOptimisticOverlay,
  type PokerOptimisticOverlay,
} from './PokerActionsLogic';
import { usePokerSeatOverlays } from './PokerSeatOverlays';
import { usePokerMobileZoomLock } from './PokerMobileZoomLock';
import { usePokerTurnClock } from './PokerTurnClock';
import { usePokerTableSounds } from './PokerSounds';
import { usePokerTableTournamentHud } from '@/hooks/use-poker-tournament';
import { useTurnTitleFlash } from '@/hooks/use-turn-title-flash';
import { TournamentBlindIncreaseOverlay } from '@/components/poker/tournament/TournamentBlindIncreaseOverlay';
import { PokerTournamentHUD } from '@/components/poker/tournament/PokerTournamentHUD';
import { PokerTournamentResultsModal } from '@/components/poker/tournament/PokerTournamentResultsModal';
import { PokerBustOutModal } from '@/components/poker/tournament/PokerBustOutModal';
import type { PokerTournamentCompletedPayload } from '@/lib/poker-tournament-completed';
import { PokerActivityFeed } from '@/components/poker/PokerActivityFeed';
import { PokerPortraitDrawer } from '@/components/poker/PokerPortraitDrawer';
import { VoiceChatPanel } from '@/components/poker/VoiceChatPanel';
import { PokerTableLogoSponsorModal } from '@/components/poker/PokerTableLogoSponsorModal';
import { PokerMobileTopBar } from '@/components/poker/PokerMobileTopBar';
import { Sidebar, SidebarBody } from '@/components/ui/sidebar';
import { useIsMobileLandscape } from '@/hooks/use-is-mobile-landscape';
import { usePokerTournamentSummary } from '@/hooks/use-poker-tournament-summary';
import {
  applyPokerE2EMockAction,
  POKER_E2E_MOCK_ADDRESS,
  type PokerE2ETestApi,
} from './e2e-mock';

export default function PokerTablePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tableId = typeof params.tableId === 'string' ? params.tableId : '';
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { run: runWalletAction } = useWalletAction();
  // The poker socket authenticates with a typed-data signature on connect AND on
  // every reconnect (see PokerConnection). On mobile WalletConnect that request
  // is sent to the wallet app over the relay but the browser can't foreground it,
  // so it used to look like "nothing happened". Wrapping it surfaces the
  // "open your wallet app" overlay so the player knows to switch and approve.
  const guardedSignTypedData = useCallback(
    (args: Parameters<typeof signTypedDataAsync>[0]) =>
      runWalletAction(() => signTypedDataAsync(args), {
        variant: 'sign-in',
        title: 'Take your seat',
      }),
    [runWalletAction, signTypedDataAsync],
  );
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
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showMyStats, setShowMyStats] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [logoSponsorOpen, setLogoSponsorOpen] = useState(false);
  const [opponentProfileAddress, setOpponentProfileAddress] = useState<string | null>(null);
  const isAdmin = isAdminWallet(address);
  const [tipAnimating, setTipAnimating] = useState(false);
  const [adminBotsBusy, setAdminBotsBusy] = useState(false);
  const adminBotMax = 10;
  /** Bumped to open Activity drawer from seat radial on mobile. */
  const [activityMobileOpenSerial, setActivityMobileOpenSerial] = useState(0);
  const [tournamentResults, setTournamentResults] = useState<PokerTournamentCompletedPayload | null>(null);
  const [bustOutModal, setBustOutModal] = useState<{ finalRank: number | null } | null>(null);
  const [isBustedSpectator, setIsBustedSpectator] = useState(false);

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
    signTypedDataAsync: guardedSignTypedData,
    isE2EMock,
    joinFromLobby,
    buyInParam,
    pinParam,
    setProfileWsClient,
    replaceUrl,
    skipLeaveOnUnload: Boolean(tournamentIdParam),
  });
  const [optimisticOverlay, setOptimisticOverlay] = useState<PokerOptimisticOverlay | null>(null);
  const renderedState = useMemo(() => {
    if (testStateOverride) return testStateOverride;
    if (!state || !optimisticOverlay) return state;
    return applyPokerOptimisticOverlay(state, optimisticOverlay);
  }, [testStateOverride, state, optimisticOverlay]);

  // ── Off-turn dock Replay: this table's past hands + the picked hand's full log (winner + all showdown) ──
  const [replayHandId, setReplayHandId] = useState<string | null>(null);
  const { data: myPokerHands } = usePokerPlayerHands(effectivePlayerAddress, 40);
  const replayNameForAddr = useCallback(
    (addr: string) => {
      const a = addr.toLowerCase();
      const seat = renderedState?.seats?.find((s) => s.playerAddress?.toLowerCase() === a);
      return seat?.displayName || `${addr.slice(0, 6)}…`;
    },
    [renderedState],
  );
  const replayHands = useMemo<ReplayHandSummary[]>(
    () =>
      (myPokerHands ?? [])
        .filter((h) => h.table_id === tableId)
        .slice(0, 20)
        .map((h) => ({ handId: h.id, handNumber: h.hand_number, label: resultLabel(h.result, replayNameForAddr) })),
    [myPokerHands, tableId, replayNameForAddr],
  );
  const { data: replayVerify, isLoading: replayLoading } = usePokerHandVerify(replayHandId);
  const replaySteps = useMemo(
    () => (replayVerify ? buildReplaySteps(replayVerify, replayNameForAddr, effectivePlayerAddress) : null),
    [replayVerify, replayNameForAddr, effectivePlayerAddress],
  );
  // The player-hands list backing the Replay picker is fetched once and would otherwise go
  // stale during a session, so the picker only ever shows the hand(s) that existed at mount.
  // Each time a NEW hand begins the previous one is completed + queryable, so refresh the list
  // then — the side-scroll picker grows live as the session plays out.
  const prevReplayHandIdRef = useRef<string | null>(null);
  useEffect(() => {
    const hid = renderedState?.currentHand?.handId ?? null;
    const prev = prevReplayHandIdRef.current;
    prevReplayHandIdRef.current = hid;
    if (hid && prev && hid !== prev && effectivePlayerAddress) {
      queryClient.invalidateQueries({ queryKey: ['pokerPlayerHands', effectivePlayerAddress] });
    }
  }, [renderedState?.currentHand?.handId, effectivePlayerAddress, queryClient]);

  const handleTournamentCompleted = useCallback(
    (payload: PokerTournamentCompletedPayload) => {
      setTournamentResults(payload);
      const me = effectivePlayerAddress?.toLowerCase() ?? null;
      void clientRef.current?.syncBalance().catch(() => {});
      if (me && me.length === 42) {
        queryClient.invalidateQueries({ queryKey: ['player-server-balance', me] });
      }
    },
    [effectivePlayerAddress, queryClient, clientRef],
  );

  const dismissTournamentResults = useCallback(() => {
    setTournamentResults(null);
    router.replace('/poker?tab=tournaments');
  }, [router]);

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

  const handlePlayerEliminated = useCallback(
    (playerAddress: string, finalRank: number) => {
      const me = normalizedAddress;
      if (!me || playerAddress.toLowerCase() !== me) return;
      setBustOutModal({ finalRank: finalRank > 0 ? finalRank : null });
    },
    [normalizedAddress],
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

  const handleMyTableChanged = useCallback(
    (newTableId: string) => {
      if (!newTableId || newTableId === tableId) return;
      const qs = resolvedTournamentId
        ? `?tournament=${encodeURIComponent(resolvedTournamentId)}`
        : '';
      toast.info('You have been moved to the final table.');
      // `replace` (not push) so the browser back button doesn't return to the dead table.
      router.replace(`/poker/${newTableId}${qs}`);
    },
    [router, resolvedTournamentId, tableId],
  );

  const tournamentHudState = usePokerTableTournamentHud({
    wsClient,
    wsConnected,
    tournamentId: resolvedTournamentId,
    tableId,
    myAddress: normalizedAddress,
    pokerHandId: renderedState?.currentHand?.handId,
    onTournamentCompleted: handleTournamentCompleted,
    onTournamentCancelled: handleTournamentCancelled,
    onBlindLevelUp: handleBlindLevelUp,
    onPlayerEliminated: handlePlayerEliminated,
    onMyTableChanged: handleMyTableChanged,
  });

  const tournamentHUDProp =
    tournamentHudState && effectivePlayerAddress
      ? { state: tournamentHudState, myAddress: effectivePlayerAddress }
      : null;

  // ── Mobile landscape: gate desktop chrome and show slim top bar ──
  // True when the viewport is a landscape phone (width > height && height ≤ 500px).
  // CSS-only Tailwind `sm:` breakpoints can't distinguish a landscape phone
  // (e.g. 844×390) from a real desktop, so we use a JS hook here to gate
  // React-level rendering of the tournament HUD sidebar, the activity rail,
  // and the alternate PokerMobileTopBar overlay.
  const isMobileLandscape = useIsMobileLandscape();
  const tournamentSummary = usePokerTournamentSummary(
    tournamentHudState ?? null,
    effectivePlayerAddress,
  );

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
    setOptimisticOverlay,
  });

  // Flash the tab title ("⏰ YOUR TURN" ↔ "Morbius Poker") while it's the
  // player's turn and the tab is backgrounded. Stops on focus or when they act.
  useTurnTitleFlash(!!canAct);

  // ── Off-turn dock: My Stats (session + this-table) + Table info (cash/tournament) ──
  // Session = this sitting, derived client-side from the recent hand list (already fetched for the
  // Replay picker), scoped by tournament when in one so it survives table moves. Table = server.
  const [dockSessionStart] = useState(() => new Date().toISOString());
  const { data: tableStatsRaw, isLoading: tableStatsLoading } = usePokerPlayerTableStats(
    tableId,
    effectivePlayerAddress,
  );
  const dockStats = useMemo<DockStatsData>(() => {
    const session = computeSessionStats(
      myPokerHands,
      { tournamentId: resolvedTournamentId ?? null, tableId },
      dockSessionStart,
    );
    const table: DockTableStats | null = tableStatsRaw
      ? {
          hands: tableStatsRaw.total_hands,
          winRatePct: tableStatsRaw.win_rate,
          profitLossChips: tableStatsRaw.profit_loss,
          biggestPotChips: tableStatsRaw.biggest_pot_won,
          vpipPct: tableStatsRaw.vpip_pct,
          pfrPct: tableStatsRaw.pfr_pct,
        }
      : null;
    return { session, table, loadingTable: tableStatsLoading };
  }, [myPokerHands, resolvedTournamentId, tableId, dockSessionStart, tableStatsRaw, tableStatsLoading]);

  const dockTableInfo = useMemo<DockTableInfo | undefined>(() => {
    if (!renderedState) return undefined;
    // Tournament — level/blinds/prize/rank/stack from the tournament HUD + summary.
    if (resolvedTournamentId && tournamentHudState) {
      const t = tournamentHudState;
      let prizePool: string;
      const sym = t.prizeTokenSymbol;
      const dec = t.prizeTokenDecimals;
      if (t.prizeTokenAddress && dec != null) {
        try {
          const whole = toBigIntSafe(t.prizePool) / 10n ** BigInt(dec);
          prizePool = `${whole.toLocaleString()}${sym ? ` ${sym}` : ''}`;
        } catch {
          prizePool = `${t.prizePool}${sym ? ` ${sym}` : ''}`;
        }
      } else {
        prizePool = formatChips(t.prizePool);
      }
      const bb = Math.round(t.bigBlind || 0);
      const myStackBB =
        mySeat?.stack && bb > 0 ? `${(toBigIntSafe(mySeat.stack) / BigInt(bb)).toLocaleString()} BB` : null;
      return {
        kind: 'tournament',
        name: t.name,
        level: t.blindLevel,
        blinds: tournamentSummary.blinds,
        nextLevel: tournamentSummary.levelCountdown,
        rank: tournamentSummary.rank,
        playersLeft: tournamentSummary.playersLeft,
        prizePool,
        myStackBB,
      };
    }
    // Cash — blinds, buy-in range (40–100 BB), seats, live pot, sponsor token.
    const bbChips = toBigIntSafe(renderedState.bigBlind);
    const occupied = renderedState.seats.filter((s) => !!s.playerAddress).length;
    return {
      kind: 'cash',
      smallBlind: formatChips(renderedState.smallBlind ?? '0'),
      bigBlind: formatChips(renderedState.bigBlind ?? '0'),
      minBuyIn: formatChips((bbChips * BigInt(POKER_CASH_MIN_BUY_IN_BB)).toString()),
      maxBuyIn: formatChips((bbChips * BigInt(POKER_CASH_MAX_BUY_IN_BB)).toString()),
      seatsLabel: `${occupied} / ${renderedState.maxSeats}`,
      potChips: renderedState.currentHand?.pot ?? '0',
      sponsor: renderedState.tableLogoTokenSymbol ?? null,
    };
  }, [
    renderedState,
    resolvedTournamentId,
    tournamentHudState,
    tournamentSummary.blinds,
    tournamentSummary.levelCountdown,
    tournamentSummary.rank,
    tournamentSummary.playersLeft,
    mySeat?.stack,
  ]);

  const handleLeaveClick = useCallback(() => {
    setShowExitConfirm(false);
    setShowLeaveConfirm(true);
  }, []);

  const handleExitClick = useCallback(() => {
    setShowLeaveConfirm(false);
    setShowExitConfirm(true);
  }, []);

  /** Spectator or eliminated (no seat in state): confirm → optional WS leave, always lobby. */
  const handleExitToLobby = useCallback(() => {
    setShowExitConfirm(false);
    const client = clientRef.current;
    const go = () => {
      clientRef.current = null;
      router.push('/poker');
    };
    if (client?.isConnected()) {
      client.pokerLeaveTable(tableId).then(go).catch(go);
    } else {
      go();
    }
  }, [tableId, router]);

  const handleBustLeave = useCallback(() => {
    setBustOutModal(null);
    setIsBustedSpectator(false);
    handleExitToLobby();
  }, [handleExitToLobby]);

  const handleBustStay = useCallback(() => {
    setBustOutModal(null);
    setIsBustedSpectator(true);
  }, []);

  // Reset spectator flag if the user gets re-seated (e.g. registering for a fresh tournament on the same page).
  useEffect(() => {
    if (mySeat) setIsBustedSpectator(false);
  }, [mySeat]);

  // ── Voice commands ────────────────────────────────────────────────────────
  const { enabled: speechEnabled, setEnabled: setSpeechEnabled } = useSpeechEnabled(address);
  const [voiceSplashOpen, setVoiceSplashOpen] = useState(false);
  // Tournament voice chat is explicit opt-in per session — never auto-joins.
  const [voiceChatJoined, setVoiceChatJoined] = useState(false);
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
    directedEmotes,
    stuckArrowsBySeatIndex,
    hitBySeatIndex,
    onPhraseReaction,
    onAnimationReaction,
    onSendDirectedEmote,
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
            // SIWE-gated. Follower comes from session, target stays in URL.
            await apiFetch(`/api/player/${addr}/follow`, {
              method: 'DELETE',
              body: JSON.stringify({}),
            });
            toast.success('Unfollowed');
          } else {
            await apiFetch(`/api/player/${addr}/follow`, {
              method: 'POST',
              body: JSON.stringify({}),
            });
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
  // Match the client countdown to the server's clock: tournament action timer (creator-chosen)
  // or 60s for cash games / when unset.
  const timeLeft = usePokerTurnClock(hand, tournamentHudState?.actionTimerSeconds ?? 60);
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

  const sponsoredToken = useMemo(() => {
    const addr = renderedState?.tableLogoTokenAddress;
    if (!addr) return null;
    return {
      address: addr,
      name: renderedState?.tableLogoTokenName ?? null,
      symbol: renderedState?.tableLogoTokenSymbol ?? null,
      logoUrl: renderedState?.tableLogoTokenLogoUrl ?? null,
    };
  }, [
    renderedState?.tableLogoTokenAddress,
    renderedState?.tableLogoTokenName,
    renderedState?.tableLogoTokenSymbol,
    renderedState?.tableLogoTokenLogoUrl,
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
      betSizingResetKey={hand ? `${hand.handId}:${hand.street}` : ''}
      variant={isFullscreen ? 'floating' : isPortraitMobile ? 'portrait' : 'default'}
      lastActionLine={lastActionLine}
      sponsoredToken={sponsoredToken}
      sponsoredUntil={renderedState.tableLogoSponsoredUntil ?? null}
      sponsorPriceMorbiusChips={renderedState.tableLogoPriceMorbiusChips ?? null}
      onOpenSponsorModal={() => setLogoSponsorOpen(true)}
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
    wsClient.pokerAddChips(tableId, toAddChips.toString())
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

  const handleImBack = useCallback(async () => {
    if (!wsClient) return;
    try {
      const next = await wsClient.pokerImBack(tableId);
      setState(next);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to clear AFK status');
    }
  }, [wsClient, tableId, setState]);

  const handleShowCards = useCallback(async () => {
    if (!wsClient || !hand?.handId) return;
    try {
      const next = await wsClient.pokerShowCards(tableId, hand.handId, 'show');
      setState(next);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to show cards');
    }
  }, [wsClient, tableId, hand?.handId, setState]);

  const handleMuckCards = useCallback(async () => {
    if (!wsClient || !hand?.handId) return;
    try {
      const next = await wsClient.pokerShowCards(tableId, hand.handId, 'muck');
      setState(next);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to muck cards');
    }
  }, [wsClient, tableId, hand?.handId, setState]);

  const foldOutShowEligible = !!(
    hand &&
    hand.handWentToShowdown === false &&
    hand.foldOutWinnerAddress &&
    normalizedAddress &&
    hand.foldOutWinnerAddress === normalizedAddress &&
    hand.foldOutShowDecision === 'pending'
  );

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
        {!isE2EMock && (
          <DisplayNameWelcomeModal
            wsClient={wsClient}
            wsConnected={wsConnected}
            hint="You're about to join the poker table — pick a name so other players know who you are."
          />
        )}

        {/* Mobile portrait now renders the new portrait-first layout (no rotate wall).
            isPortraitMobile drives layoutVariant on PokerTableView + hides desktop rails. */}

        {/* LANDSCAPE NOTE: Landscape mobile support is layered via CSS only
            (@media orientation: landscape rules in globals.css). Do NOT restructure
            this flex-col layout, reorder children, or add conditional rendering
            for landscape vs portrait — it will break the portrait layout that
            works well today. See globals.css "Poker landscape" section. */}
        <div
          data-poker-shell
          data-poker-portrait={isPortraitMobile ? 'true' : undefined}
          className={`flex flex-col relative ${cyberpunk ? 'font-mono uppercase' : ''}`}
          style={{
            ...themeVars as React.CSSProperties,
            height: '100dvh',
            background: 'rgb(2 6 23)',
            color: 'var(--poker-text)',
            overflow: 'hidden',
          }}
        >
          {!isFullscreen && <PokerHeaderBar
            renderedState={renderedState}
            tournamentState={tournamentHUDProp?.state ?? null}
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
            showExitToLobby={!mySeat}
            onExitClick={handleExitClick}
            isBustedSpectator={isBustedSpectator && !mySeat}
            autoRebuy={autoRebuy}
            onToggleAutoRebuy={mySeat ? () => setAutoRebuy((v) => !v) : undefined}
            showTableBrandingActions={Boolean(effectivePlayerAddress && wsConnected && mySeat)}
            onOpenTableLogoSponsor={() => setLogoSponsorOpen(true)}
            tipAnimating={tipAnimating}
            setTipAnimating={setTipAnimating}
            onTipDealer={onTipDealer}
            voiceCommands={{
              listening: speech.listening,
              supported: speech.supported,
              onToggle: () => {
                if (speechEnabled) setSpeechEnabled(false);
                else setVoiceSplashOpen(true);
              },
            }}
            voiceSlot={
              <VoiceChatPanel
                wsClient={wsClient}
                walletAddress={normalizedAddress}
                tableId={tableId}
                seated={Boolean(mySeat)}
                enabled={Boolean(resolvedTournamentId)}
                joined={voiceChatJoined}
                onToggleJoined={() => setVoiceChatJoined((v) => !v)}
                compact
              />
            }
          />}

          {/* Portrait hamburger drawer (faithful lab port) — replaces the desktop ··· menu on mobile. */}
          {isPortraitMobile && (
            <PokerPortraitDrawer
              tableLabel="Table"
              seated={!!mySeat}
              sittingOut={mySeat?.status === 'sitting_out'}
              canReup={canReup}
              isAdmin={isAdmin}
              showBranding={Boolean(effectivePlayerAddress && wsConnected && mySeat)}
              onAvatarProfile={mySeat ? () => setShowAvatarModal(true) : undefined}
              onAddChips={openReupModal}
              onChat={() => setActivityMobileOpenSerial((s) => s + 1)}
              onSitOut={mySeat ? handleSitOut : undefined}
              onSitBack={mySeat ? handleSitBack : undefined}
              onSponsorLogo={() => setLogoSponsorOpen(true)}
              onTipDealer={onTipDealer}
              tipAmountLabel="2,000"
              tipAnimating={tipAnimating}
              onSounds={() => setShowSoundsModal(true)}
              onTableSettings={() => setShowTableSettingsModal(true)}
              onEditQuickChat={() => setShowEditQuickChatModal(true)}
              autoRebuy={autoRebuy}
              onToggleAutoRebuy={mySeat ? () => setAutoRebuy((v) => !v) : undefined}
              voice={{
                listening: speech.listening,
                supported: speech.supported,
                onToggle: () => {
                  if (speechEnabled) setSpeechEnabled(false);
                  else setVoiceSplashOpen(true);
                },
              }}
              onHowToPlay={() => setShowHowToPlay(true)}
              onPlayerStats={normalizedAddress ? () => { setStatsModalAddress(normalizedAddress); setShowStatsModal(true); } : undefined}
              onTableStats={() => setShowMyStats(true)}
              onDashboard={isAdmin ? () => setShowDashboard(true) : undefined}
              adminBotsBusy={adminBotsBusy}
              adminBotMax={adminBotMax}
              onStartBots={onAdminStartBots}
              onStopBots={onAdminStopBots}
              onLeave={mySeat ? handleLeaveClick : handleExitClick}
            />
          )}

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
            style={
              isFullscreen
                ? { paddingBottom: `var(${POKER_BOTTOM_RESERVE_VAR}, 0px)` }
                : isMobileLandscape
                ? { paddingRight: POKER_SIDE_STRIP_W }
                : undefined
            }
          >
            {tournamentHUDProp && !isFullscreen && !isMobileLandscape && !isPortraitMobile && (
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

            <div className="flex min-h-0 min-w-0 flex-1 flex-col relative">
              {/* Mobile-landscape: slim top bar replaces the hidden
                  tournament HUD sidebar + promo banner + token-info row.
                  Surfaces blinds · countdown · rank, plus hand-info and
                  chat icons, plus a stack readout. */}
              {isMobileLandscape && !isFullscreen && (
                <PokerMobileTopBar
                  blinds={tournamentSummary.blinds}
                  levelCountdown={tournamentSummary.levelCountdown}
                  rank={tournamentSummary.rank}
                  playersLeft={tournamentSummary.playersLeft}
                  stack={mySeat?.stack ? formatChips(mySeat.stack) : null}
                  onChatClick={() => setActivityMobileOpenSerial((s) => s + 1)}
                />
              )}
              {/* AFK / "I'm Back" banner — own-player-only. Shows as soon as
                  the player has missed a turn (counter >= 1); upgrades to a
                  more urgent message at counter >= 2 (hard AFK / fast-fold).
                  Click I'M BACK to clear flags and (in cash) sit back in. */}
              {mySeat && (mySeat.consecutiveTimeouts ?? 0) >= 1 && (
                <div className="pointer-events-auto absolute left-1/2 top-3 z-30 -translate-x-1/2">
                  <div
                    className={`flex items-center gap-3 rounded-full px-3 py-1.5 text-xs font-semibold shadow-lg ${
                      (mySeat.consecutiveTimeouts ?? 0) >= 2
                        ? 'bg-red-600/95 text-white border border-red-300/50'
                        : 'bg-amber-500/95 text-white border border-amber-200/50'
                    }`}
                  >
                    <span className="leading-tight">
                      {(mySeat.consecutiveTimeouts ?? 0) >= 2
                        ? "You're AFK — hands are auto-folding fast."
                        : 'You missed a turn. Still there?'}
                    </span>
                    <button
                      type="button"
                      onClick={handleImBack}
                      className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-900 hover:bg-white"
                    >
                      I'm Back
                    </button>
                  </div>
                </div>
              )}
              <PokerTableView
                tableId={tableId}
                tableScale={tableScale}
                layoutVariant={isPortraitMobile ? 'portrait' : 'default'}
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
                directedEmotes={directedEmotes}
                stuckArrowsBySeatIndex={stuckArrowsBySeatIndex}
                hitBySeatIndex={hitBySeatIndex}
                onSendDirectedEmote={mySeatIndex >= 0 ? onSendDirectedEmote : undefined}
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
                tipAnimating={tipAnimating}
                setTipAnimating={setTipAnimating}
                onTipDealer={onTipDealer}
                onOpenLogoSponsor={() => setLogoSponsorOpen(true)}
                onSitOut={mySeat ? handleSitOut : undefined}
                onSitBack={mySeat ? handleSitBack : undefined}
                onShowCards={foldOutShowEligible ? handleShowCards : undefined}
                onMuckCards={foldOutShowEligible ? handleMuckCards : undefined}
              />

              <PokerBottomBar
                fullscreen={isFullscreen}
                mobileLandscape={isMobileLandscape && !isFullscreen}
                portrait={isPortraitMobile}
                tournament={{
                  blinds: tournamentSummary.blinds,
                  levelCountdown: tournamentSummary.levelCountdown,
                  rank: tournamentSummary.rank,
                  playersLeft: tournamentSummary.playersLeft,
                }}
                quickChatPhrases={quickChatPhrases}
                onPhraseReaction={onPhraseReaction}
                preAction={queuedPreAction}
                onPreActionChange={setQueuedPreAction}
                onOpenActivity={() => setActivityMobileOpenSerial((s) => s + 1)}
                replay={{ hands: replayHands, activeHandId: replayHandId, steps: replaySteps, loading: replayLoading, onPick: setReplayHandId }}
                stats={dockStats}
                tableInfo={dockTableInfo}
                renderedState={renderedState}
                mySeat={mySeat}
                actions={sharedActions}
                actionTimerSeconds={tournamentHudState?.actionTimerSeconds ?? null}
              />
            </div>

            {pokerChatRoomId && !isFullscreen && !isMobileLandscape && !isPortraitMobile && (
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

            {/* Mobile (landscape OR portrait): mount PokerActivityFeed in a hidden
                host so only its `createPortal(mobileDrawerChrome, document.body)`
                escape-hatch surfaces. The visible "right rail" UI has no place on a
                phone and would otherwise paint inline. The portaled drawer opens via
                a 💬 button bumping `activityMobileOpenSerial` (portrait: the dock's
                Live Action bar; landscape: the top bar). */}
            {pokerChatRoomId && !isFullscreen && (isMobileLandscape || isPortraitMobile) && (
              <div aria-hidden className="hidden">
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
              </div>
            )}
          </div>
        </div>

        {wsClient && effectivePlayerAddress && mySeat && (
          <PokerTableLogoSponsorModal
            isOpen={logoSponsorOpen}
            onClose={() => setLogoSponsorOpen(false)}
            tableId={tableId}
            walletAddress={effectivePlayerAddress}
            wsClient={wsClient}
            tableState={renderedState}
          />
        )}

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
          showExitConfirm={showExitConfirm}
          setShowExitConfirm={setShowExitConfirm}
          fmtChips={fmtChips}
          handleLeave={handleLeave}
          handleExitToLobby={handleExitToLobby}
          opponentProfileAddress={opponentProfileAddress}
          setOpponentProfileAddress={setOpponentProfileAddress}
          setStatsModalAddress={setStatsModalAddress}
          onSendDirectedEmote={mySeatIndex >= 0 ? onSendDirectedEmote : undefined}
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
        hideFloatingToggle={!isFullscreen}
      />
      {speech.pendingLabel && (
        <SpeechConfirmDialog
          label={speech.pendingLabel}
          onYes={speech.confirmYes}
          onNo={speech.confirmNo}
        />
      )}
      <SophieSplashModal
        address={address}
        openOnFirstVisit={false}
        forceOpen={voiceSplashOpen}
        onClose={() => setVoiceSplashOpen(false)}
        onEnable={() => setSpeechEnabled(true)}
      />
      {blindIncreaseBanner && (
        <TournamentBlindIncreaseOverlay
          playId={blindIncreaseBanner.playId}
          newLevel={blindIncreaseBanner.newLevel}
          smallBlind={blindIncreaseBanner.smallBlind}
          bigBlind={blindIncreaseBanner.bigBlind}
          onAnimationEnd={() => setBlindIncreaseBanner(null)}
        />
      )}
      {tournamentResults && (
        <PokerTournamentResultsModal
          payload={tournamentResults}
          myAddress={effectivePlayerAddress}
          onDismiss={dismissTournamentResults}
        />
      )}
      <PokerBustOutModal
        isOpen={bustOutModal !== null}
        finalRank={bustOutModal?.finalRank ?? null}
        onLeave={handleBustLeave}
        onStay={handleBustStay}
      />
    </>
  );
}
