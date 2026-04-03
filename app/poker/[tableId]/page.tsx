'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAccount, useSignTypedData } from 'wagmi';
import { formatMorbiusFloor } from '@/lib/format-morbius-display';
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
import { PokerHeaderBar } from './PokerHeaderBar';
import { PokerTableView } from './PokerTableView';
import { PokerPopups } from './PokerPopups';
import { PokerPanels } from './PokerPanels';
import { PokerBottomBar } from './PokerBottomBar';
import { usePokerConnection } from './PokerConnection';
import { usePokerActionsLogic } from './PokerActionsLogic';
import { usePokerSeatOverlays } from './PokerSeatOverlays';
import { usePokerMobileZoomLock } from './PokerMobileZoomLock';
import { usePokerTurnClock } from './PokerTurnClock';
import { usePokerTableSounds } from './PokerSounds';
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
  const joinFromLobby = searchParams.get('join') === '1';
  const buyInParam = searchParams.get('buyIn');
  const pinParam = searchParams.get('pin');
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
  usePokerMobileZoomLock();


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

  const pokerTheme = DEFAULT_POKER_THEME;
  const themeVars = getPokerThemeVars(pokerTheme);
  const cyberpunk = pokerTheme === 'cyberpunk';

  const fmtChips = (wei: string | number) => {
    try {
      return formatMorbiusFloor(wei, { compact: false });
    } catch {
      return String(wei);
    }
  };

  const sharedActions = renderedState && mySeat && (
    <PokerActions
      canAct={!!canAct}
      canCheck={canCheck}
      preAction={queuedPreAction}
      minRaise={hand?.minRaise ?? '0'}
      stack={mySeat.stack ?? '0'}
      callAmount={callAmount}
      pot={hand?.pot ?? '0'}
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

  const onAdminStartBots = useCallback(async (numBots: number) => {
    if (!isAdmin || !address || !tableId) return;
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data?.error as string) || 'Failed to start bot players');
      }
      const botCount = typeof data?.numBots === 'number' ? data.numBots : null;
      toast.success(botCount ? `Started ${botCount} bot player(s)` : 'Started bot players');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to start bot players');
    } finally {
      setAdminBotsBusy(false);
    }
  }, [isAdmin, address, tableId, adminBotMax]);

  const onAdminStopBots = useCallback(async () => {
    if (!isAdmin || !address || !tableId) return;
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data?.error as string) || 'Failed to stop bot players');
      }
      toast.success('Stopped bot players');
    } catch (err) {
      toast.error((err as Error).message || 'Failed to stop bot players');
    } finally {
      setAdminBotsBusy(false);
    }
  }, [isAdmin, address, tableId]);

  return (
    <PokerThemeProvider themeId={pokerTheme}>
      <PokerTableEffectProvider>
        {!isE2EMock && <PokerBetaSplash />}
        <div
          className={`flex flex-col ${cyberpunk ? 'font-mono uppercase' : ''}`}
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
          <PokerHeaderBar
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
          />

          {/* Disconnected banner */}
          {disconnected && (
            <div
              className="flex-shrink-0 py-1.5 text-center text-[11px] font-medium animate-pulse"
              style={{ color: 'var(--poker-danger)', background: 'color-mix(in srgb, var(--poker-danger) 10%, transparent)', borderBottom: '1px solid var(--poker-danger)' }}
            >
              Connection lost — reconnecting...
            </div>
          )}

          <PokerPanels
            tableId={tableId}
            renderedState={renderedState}
            isAdmin={isAdmin}
            normalizedAddress={normalizedAddress}
            showDashboard={showDashboard}
            setShowDashboard={setShowDashboard}
            showMyStats={showMyStats}
            setShowMyStats={setShowMyStats}
          />

          <PokerTableView
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
          />

          <PokerBottomBar
            renderedState={renderedState}
            mySeat={mySeat}
            actions={sharedActions}
            wsClient={wsClient}
            wsConnected={wsConnected}
            pokerChatRoomId={pokerChatRoomId}
            tableId={tableId}
            activityMobileOpenSerial={activityMobileOpenSerial}
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
  );
}
