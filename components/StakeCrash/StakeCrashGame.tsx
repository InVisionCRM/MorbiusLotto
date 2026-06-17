'use client';

/**
 * StakeCrashGame — the interactive client for chips Crash (/crash).
 *
 * Faithful port of the crash prototype's page layout:
 *   • landscape split view with draggable neon divider (canvas | betting drawer)
 *   • the drawer collapses into the giant CASH OUT button mid-flight
 *   • floating history strip over the canvas, portrait-rotation blocker
 *   • Morbius logo + audio toggle overlays
 *
 * …wired to the arcade2 chip platform: SIWE session, poker-chip balance,
 * server-authoritative live rounds, fairness modal, and the info tabs
 * (recent / leaderboard / my rounds) below the game.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { RotateCcw, Volume2, VolumeX } from 'lucide-react';
import {
  Panel,
  Group,
  Separator,
  type PanelImperativeHandle,
} from 'react-resizable-panels';
import { useCrashStore } from './useCrashStore';
import { crashAudio } from './crash-audio';
import CrashEngine from './CrashEngine';
import CrashCanvas from './CrashCanvas';
import CrashMultiplierDisplay from './CrashMultiplierDisplay';
import CrashBettingPanel from './CrashBettingPanel';
import CrashHistoryStrip from './CrashHistoryStrip';
import CrashHUD from './CrashHUD';
import { CrashFairnessModal } from './CrashFairnessModal';
import { CrashRulesModal } from './CrashRulesModal';
import { CrashInfoTabs } from './CrashInfoTabs';
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance';
import { GameWalletModal } from '@/components/shared/GameWalletModal';
import { probeSiweSession } from '@/lib/api-auth';
import {
  fetchCrashInfo,
  fetchCrashHistory,
  fetchCrashRecent,
  type CrashInfo,
  type CrashHistoryRound,
} from '@/lib/crash-client';

const HISTORY_LIMIT = 25;

function HeaderControls() {
  const { isMuted, toggleMute } = useCrashStore();

  const handleToggle = () => {
    crashAudio.init(); // Initialize context upon explicit click
    toggleMute();
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleToggle}
        className="text-[#848ca1] hover:text-white transition-colors flex items-center justify-center p-2 rounded-full hover:bg-white/5"
        title={isMuted ? 'Unmute Sounds' : 'Mute Sounds'}
      >
        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
      </button>
    </div>
  );
}

export function StakeCrashGame() {
  const { address } = useAccount();
  const { phase, hasBet, hasCashedOut, setBalance, setHistory } = useCrashStore();

  const [info, setInfo] = useState<CrashInfo | null>(null);
  const [clientSeed, setClientSeed] = useState('');
  const [fairnessOpen, setFairnessOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<string | null>(null);
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [history, setHistoryRows] = useState<CrashHistoryRound[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const bettingPanelRef = useRef<PanelImperativeHandle>(null);
  const canvasPanelRef = useRef<PanelImperativeHandle>(null);

  // Drawer logic: Collapse the betting panel into a thin slice when flying and actively playing
  const isDrawerCollapsed = phase === 'flying' && hasBet && !hasCashedOut;

  useEffect(() => {
    // Programmatically resize the betting panel
    if (bettingPanelRef.current) {
      if (isDrawerCollapsed) {
        // Expand canvas, shrink betting panel
        bettingPanelRef.current.resize('25');
      } else {
        // Expand betting panel back
        bettingPanelRef.current.resize('40');
      }
    }
  }, [isDrawerCollapsed]);

  // Game config (bounds come from the server).
  useEffect(() => {
    fetchCrashInfo()
      .then(setInfo)
      .catch(() => {
        /* panel shows a disabled state until it loads */
      });
  }, []);

  // Balance: public read keyed by wallet address, then kept fresh from
  // authoritative /start and /cashout responses.
  const { data: chainBalance, refetch: refetchBalance } = usePokerChipBalance(address ?? null);
  useEffect(() => {
    if (chainBalance != null) {
      try {
        setBalance(BigInt(chainBalance.split('.')[0] || '0'));
      } catch {
        /* keep last known */
      }
    } else if (!address) {
      setBalance(null);
    }
  }, [chainBalance, address, setBalance]);

  // Seed the floating history strip with real global crash points.
  useEffect(() => {
    fetchCrashRecent(15)
      .then((rounds) => setHistory(rounds.map((r) => r.crashX100 / 100)))
      .catch(() => {
        /* strip stays empty */
      });
  }, [setHistory]);

  // My rounds: only fetch once a session provably exists.
  const loadMyHistory = useCallback(() => {
    if (!address) {
      setHistoryRows([]);
      return;
    }
    setHistoryLoading(true);
    probeSiweSession()
      .then((ok) => (ok ? fetchCrashHistory(HISTORY_LIMIT) : []))
      .then(setHistoryRows)
      .catch(() => {
        /* leave empty — tab shows its empty state */
      })
      .finally(() => setHistoryLoading(false));
  }, [address]);

  useEffect(() => {
    loadMyHistory();
  }, [loadMyHistory]);

  const onRoundSettled = useCallback(() => {
    loadMyHistory();
    setRefreshKey((k) => k + 1);
    void refetchBalance();
  }, [loadMyHistory, refetchBalance]);

  const openVerify = useCallback((id: string | null) => {
    setVerifyTarget(id);
    setFairnessOpen(true);
  }, []);

  return (
    <>
      <CrashEngine clientSeed={clientSeed} onRoundSettled={onRoundSettled} />

      {/* Portrait Blocker / Notice */}
      <div className="portrait:flex landscape:hidden fixed inset-0 z-50 bg-[#06070a] text-white flex-col items-center justify-center p-8 text-center gap-6">
        <RotateCcw className="w-20 h-20 animate-pulse text-[#00ffa3]" />
        <div>
          <h2 className="text-3xl font-[900] tracking-tight mb-2">Rotate Device</h2>
          <p className="text-[#848ca1] max-w-[280px] mx-auto text-[15px]">
            Please rotate your phone to landscape mode for the ultimate Morbius Crash experience.
          </p>
        </div>
      </div>

      <main className="portrait:hidden landscape:flex h-[100dvh] bg-[#06070a] text-white w-full flex-row overflow-hidden">
        <Group orientation="horizontal">
          {/* Left Panel: Dynamic Game Canvas */}
          <Panel
            panelRef={canvasPanelRef}
            defaultSize="60"
            minSize="40"
            className="relative flex flex-col justify-center bg-[#10121a] drop-shadow-[10px_0_30px_rgba(0,0,0,0.8)] z-10"
          >
            {/* Subtle Floating Logo */}
            <div className="absolute top-4 lg:top-6 left-4 lg:left-6 z-20 pointer-events-none">
              <div className="text-[16px] lg:text-[22px] font-[900] tracking-[-1px] text-[#00ffa3] uppercase drop-shadow-md opacity-80">
                Morbius
              </div>
            </div>

            {/* Header Controls (Toggles, Audio) */}
            <div className="absolute top-4 lg:top-6 right-4 lg:right-6 z-20 bg-black/40 backdrop-blur-md rounded-[12px] border border-white/5 px-2">
              <HeaderControls />
            </div>

            {/* Game Viewport */}
            <div className="absolute inset-0 bg-gradient-to-b from-[#1a1c29] to-[#0a0c14] overflow-hidden">
              <CrashCanvas />
              <CrashMultiplierDisplay />
              <CrashHUD />
            </div>

            {/* Floating History Strip */}
            <div className="absolute top-12 bottom-4 right-0 lg:top-auto lg:bottom-4 lg:left-4 lg:right-4 z-40 flex flex-col lg:flex-row lg:items-center lg:bg-black/60 lg:backdrop-blur-md lg:border lg:border-white/10 lg:rounded-[12px] px-2 lg:px-4 py-2 lg:py-3 shadow-none lg:shadow-xl w-[46px] lg:w-auto lg:h-[54px] overflow-hidden pointer-events-none lg:pointer-events-auto">
              <div className="hidden lg:block text-[12px] uppercase text-[#848ca1] mr-3 font-bold tracking-[1px] shrink-0">
                History
              </div>
              <div className="flex-1 overflow-hidden w-full h-full pointer-events-auto">
                <CrashHistoryStrip />
              </div>
            </div>
          </Panel>

          {/* Draggable Divider Handle */}
          <Separator className="group relative w-3 lg:w-5 bg-transparent flex items-center justify-center cursor-col-resize z-50">
            {/* Thin background line that lights up to neon green on hover */}
            <div className="absolute inset-y-0 w-[1px] lg:w-[2px] bg-white/5 group-hover:bg-[#00ffa3] group-active:bg-[#00ffa3] group-hover:shadow-[0_0_12px_#00ffa3] transition-all duration-300 pointer-events-none" />

            {/* High-tech Cyberpunk Grip Handle */}
            <div className="relative z-10 w-[4px] lg:w-[6px] h-12 lg:h-16 bg-[#06070a] border border-white/10 group-hover:border-[#00ffa3] group-active:border-[#00ffa3] group-hover:shadow-[0_0_10px_#00ffa3] rounded-full flex flex-col items-center justify-center gap-[3px] lg:gap-[4px] transition-all duration-300">
              <div className="w-[2px] h-[2px] rounded-full bg-white/20 group-hover:bg-[#00ffa3] group-active:bg-[#00ffa3] transition-colors duration-300" />
              <div className="w-[2px] h-[2px] rounded-full bg-white/20 group-hover:bg-[#00ffa3] group-active:bg-[#00ffa3] transition-colors duration-300" />
              <div className="w-[2px] h-[2px] rounded-full bg-white/20 group-hover:bg-[#00ffa3] group-active:bg-[#00ffa3] transition-colors duration-300" />
            </div>
          </Separator>

          {/* Right Panel: Dynamic Betting Drawer */}
          <Panel
            panelRef={bettingPanelRef}
            defaultSize="40"
            minSize="20"
            maxSize="60"
            className="shrink-0 h-full flex flex-col bg-[#0a0c14] z-0 overflow-y-auto no-scrollbar overflow-x-hidden"
          >
            <CrashBettingPanel
              isCollapsed={isDrawerCollapsed}
              info={info}
              onOpenFairness={() => openVerify(history[0]?.roundId ?? null)}
              onOpenRules={() => setRulesOpen(true)}
              onOpenExchange={() => setExchangeOpen(true)}
            />
          </Panel>
        </Group>
      </main>

      {/* Extras below the game: recent / leaderboard / my rounds / how to play */}
      <div className="portrait:hidden landscape:block bg-[#06070a] px-3 pb-16 pt-4 sm:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <CrashInfoTabs
            history={history}
            historyLoading={historyLoading}
            onVerify={openVerify}
            refreshKey={refreshKey}
          />
        </div>
      </div>

      <CrashRulesModal open={rulesOpen} onOpenChange={setRulesOpen} />
      <CrashFairnessModal
        open={fairnessOpen}
        onClose={() => {
          setFairnessOpen(false);
          setVerifyTarget(null);
        }}
        clientSeed={clientSeed}
        onClientSeedChange={setClientSeed}
        requestVerifyId={verifyTarget}
      />

      <GameWalletModal
        isOpen={exchangeOpen}
        onClose={() => setExchangeOpen(false)}
        defaultTab="deposit"
        balanceLabel="MORBIUS"
        onBalanceSync={async () => { await refetchBalance(); }}
      />
    </>
  );
}
