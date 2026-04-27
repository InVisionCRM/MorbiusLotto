'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import { getApiUrlOptional, getWebSocketUrlOptional } from '@/lib/api-urls';
import { GameState, Action } from '@/app/BLACKJACK/types';
import { TOURNAMENT_CONFIG } from '@/hooks/use-tournament';
import { SOUNDS_TIP, pickRandom } from '@/app/BLACKJACK/constants';
import BlackjackTable from '@/components/BLACKJACK/BlackjackTable';
import BettingPanelMobile from '@/components/BLACKJACK/BettingPanelMobile';
import BlackjackMobileActionBar from '@/components/BLACKJACK/BlackjackMobileActionBar';
import BlackjackSidebar from '@/components/BLACKJACK/BlackjackSidebar';
import WinNotification from '@/components/BLACKJACK/WinNotification';
import { TournamentBetPanel } from '@/components/BLACKJACK/Tournament';
import { IconButton } from '@/components/animate-ui/components/buttons/icon';
import { BlackjackGameSecondaryPanels } from '@/components/BLACKJACK/BlackjackGameSecondaryPanels';
import type { TableThemeInfo } from '@/hooks/use-blackjack-tables';
import { SpeechIndicator } from '@/components/shared/SpeechIndicator';
import { SpeechConfirmDialog } from '@/components/shared/SpeechConfirmDialog';
import { TableTokenProfileCard, type TableTokenProfileCardProps } from '@/components/BLACKJACK/TableTokenProfileCard';
import { ProvablyFairClientSeedModal } from '@/components/shared/ProvablyFairClientSeedModal';

interface BlackjackGameViewProps {
  contractIsPaused: boolean;
  contractEmergencyPaused: boolean;
  contractOzPaused: boolean;
  tournament: any;
  currentGame: any;
  gameState: any;
  canHit: boolean;
  canStand: boolean;
  canDoubleDown: boolean;
  canSplit: boolean;
  offChainBalance: bigint;
  newCardIndices: { player: Set<number>; dealer: Set<number> };
  tournamentChipStack: number[];
  chipStack: number[];
  manageChipStack: (betAmount?: string, chipValue?: number, clearAll?: boolean) => void;
  handleStartTournamentGame: (betAmount: number) => Promise<void>;
  handleDealClick: () => void;
  handleDealerRevealComplete: () => void;
  currentGameResult: 'win' | 'loss' | 'push' | 'blackjack' | 'dealer_blackjack' | null;
  handleChipAnimationComplete: () => void;
  handleDoubleDownChips: () => void;
  handleSplitChips: () => void;
  handleRebet: () => void;
  handleRebetAndDeal: () => void;
  handleHalfBet: () => void;
  handleDoubleBet: () => void;
  isMusicPlaying: boolean;
  toggleMusic: () => void;
  nextTrack: () => void;
  musicVolume: number;
  setMusicVolume: (volume: number) => void;
  totalBetAmount: number;
  displayBetAmount: string;
  lastBetAmount: string;
  imageSource: string;
  videoSource: string;
  theme: 'image' | 'video';
  getThemeInfo: (theme: { kind: 'image' | 'video'; id: string }) => TableThemeInfo;
  getTableProfile: (theme: { kind: 'image' | 'video'; id: string }) => unknown;
  videoSyncToClock: boolean;
  videoPosition: number;
  handleOpenDepositModal: () => void;
  setThemeModalOpen: (open: boolean) => void;
  soundEnabled: boolean;
  playSfx: (path: string, volume?: number) => void;
  handleCardsClearComplete: () => void;
  perfectPairsBet: number;
  setPerfectPairsBet: (value: number) => void;
  setTournamentBrowserInitialTab: (tab: 'join' | 'my' | 'freeroll' | 'history') => void;
  setShowTournamentBrowser: (open: boolean) => void;
  handleStartGame: (betAmount: bigint, clientSeed: string, perfectPairsBetAmount?: bigint) => Promise<void>;
  clientSeed: string;
  setClientSeed: (seed: string) => void;
  handleTournamentPlayerAction: (action: Action) => Promise<void>;
  handlePlayerAction: (action: Action) => Promise<void>;
  address: string | undefined;
  wsConnected: boolean;
  wsClient: any;
  tipAnimating: boolean;
  setTipAnimating: (value: boolean) => void;
  playDealerVoice: (path: string, volume?: number) => Promise<void>;
  fetchBalance: () => Promise<void> | void;
  setTipStats: (stats: any) => void;
  showWinNotification: boolean;
  winAmount: bigint;
  isBlackjackWin: boolean;
  setShowWinNotification: (show: boolean) => void;
  chartRef: any;
  chartSessionStartTime: number;
  openVerifyView: (gameId: string) => void;
  setSoundEnabled: (enabled: boolean) => void;
  dealerVoiceEnabled: boolean;
  setDealerVoiceEnabled: (enabled: boolean) => void;
  sfxEnabled: boolean;
  setSfxEnabled: (enabled: boolean) => void;
  BLACKJACK_MUSIC_PLAYLIST: readonly string[];
  musicTrackIndex: number;
  tournamentTabContent: ReactNode;
  tipStats: any;
  blackjackAddress: string;
  morbiusTokenAddress: string;
  /** Active tier limits — passed down to BettingPanel */
  betLimits?: { MIN_BET: bigint; MAX_BET: bigint };
  /** Voice command props — readback rendered inside the table, confirm dialog outside */
  speech?: {
    listening: boolean;
    transcript: string;
    lastAction: string | null;
    pendingLabel: string | null;
    confirmYes: () => void;
    confirmNo: () => void;
    onToggle: () => void;
  };
  /** Voice tutorial MP4 — "How it works" on table when speech UI is shown */
  voiceTutorialVideoUrl?: string;
}

export function BlackjackGameView(props: BlackjackGameViewProps) {
  const {
    contractIsPaused,
    contractEmergencyPaused,
    contractOzPaused,
    tournament,
    currentGame,
    gameState,
    canHit,
    canStand,
    canDoubleDown,
    canSplit,
    offChainBalance,
    newCardIndices,
    tournamentChipStack,
    chipStack,
    manageChipStack,
    handleStartTournamentGame,
    handleDealClick,
    handleDealerRevealComplete,
    currentGameResult,
    handleChipAnimationComplete,
    handleDoubleDownChips,
    handleSplitChips,
    handleRebet,
    handleRebetAndDeal,
    handleHalfBet,
    handleDoubleBet,
    isMusicPlaying,
    toggleMusic,
    nextTrack,
    musicVolume,
    setMusicVolume,
    totalBetAmount,
    displayBetAmount,
    lastBetAmount,
    imageSource,
    videoSource,
    theme,
    getThemeInfo,
    getTableProfile,
    videoSyncToClock,
    videoPosition,
    handleOpenDepositModal,
    setThemeModalOpen,
    soundEnabled,
    playSfx,
    handleCardsClearComplete,
    perfectPairsBet,
    setPerfectPairsBet,
    setTournamentBrowserInitialTab,
    setShowTournamentBrowser,
    handleStartGame,
    clientSeed,
    setClientSeed,
    handleTournamentPlayerAction,
    handlePlayerAction,
    address,
    wsConnected,
    wsClient,
    tipAnimating,
    setTipAnimating,
    playDealerVoice,
    fetchBalance,
    setTipStats,
    showWinNotification,
    winAmount,
    isBlackjackWin,
    setShowWinNotification,
    chartRef,
    chartSessionStartTime,
    openVerifyView,
    setSoundEnabled,
    dealerVoiceEnabled,
    setDealerVoiceEnabled,
    sfxEnabled,
    setSfxEnabled,
    BLACKJACK_MUSIC_PLAYLIST,
    musicTrackIndex,
    tournamentTabContent,
    tipStats,
    blackjackAddress,
    morbiusTokenAddress,
    betLimits,
    speech,
    voiceTutorialVideoUrl,
  } = props;

  const [provablyFairOpen, setProvablyFairOpen] = useState(false);

  const panelShell: CSSProperties = {
    background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(35, 36, 41))',
    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
    border: '1px inset rgba(60, 60, 60, 0.5)',
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,3fr)_minmax(320px,1.2fr)] md:items-stretch gap-2 md:gap-4 min-h-0">
        {contractIsPaused && (
          <div className="col-span-full mb-0 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-200 text-sm">
            <strong>Blackjack contract is paused.</strong> Deposits, withdrawals, and betting are disabled on-chain.
            {contractEmergencyPaused && ' Emergency pause is active (emergency admin must call setEmergencyPause(false)).'}
            {contractOzPaused && !contractEmergencyPaused && ' Owner has paused the contract (owner must call unpause()).'}
          </div>
        )}

        {!getWebSocketUrlOptional() && (
          <div className="col-span-full mb-0 px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 text-sm">
            <strong>Game server not connected.</strong>{' '}
            {typeof process !== 'undefined' && process.env.NODE_ENV === 'production' ? (
              <>Set <code className="font-mono text-xs bg-black/30 px-1 rounded">NEXT_PUBLIC_WEBSOCKET_URL</code> and <code className="font-mono text-xs bg-black/30 px-1 rounded">NEXT_PUBLIC_API_URL</code> in your deployment (e.g. Vercel → Project → Settings → Environment Variables). Use your backend URL: <code className="font-mono text-xs bg-black/30 px-1 rounded">https://your-api.com</code> and <code className="font-mono text-xs bg-black/30 px-1 rounded">wss://your-api.com</code>. Then <strong>redeploy</strong> — Next.js bakes these in at build time.</>
            ) : (
              <>Set <code className="font-mono text-xs bg-black/30 px-1 rounded">NEXT_PUBLIC_WEBSOCKET_URL</code> and <code className="font-mono text-xs bg-black/30 px-1 rounded">NEXT_PUBLIC_API_URL</code> in <code className="font-mono text-xs bg-black/30 px-1 rounded">.env.local</code> (e.g. <code className="font-mono text-xs bg-black/30 px-1 rounded">http://localhost:3001</code> and <code className="font-mono text-xs bg-black/30 px-1 rounded">ws://localhost:3001</code>), then restart the dev server. Run the backend with <code className="font-mono text-xs bg-black/30 px-1 rounded">cd server && npm run dev</code>.</>
            )}
          </div>
        )}

        <div className="min-w-0 flex flex-col gap-3 order-1 md:order-none md:row-start-1 md:col-start-1 -mx-2 sm:mx-0 md:h-full md:min-h-0">
          <div
            className="rounded-xl overflow-hidden p-1 sm:p-2 md:p-3 min-h-0 shrink-0"
            style={panelShell}
          >
            <div className="relative flex-1 min-w-0 min-h-[62dvh] sm:min-h-[min(62dvh,680px)] flex flex-col">
            <BlackjackTable
              playerHand={currentGame?.playerHand || { cards: [], total: 0, hasAce: false, isBlackjack: false, isBust: false }}
              playerHands={currentGame?.playerHands}
              currentHandIndex={currentGame?.currentHandIndex || 0}
              dealerHand={currentGame?.dealerHand || { cards: [], total: 0, hasAce: false, isBlackjack: false, isBust: false }}
              gameState={currentGame?.state || GameState.WAITING}
              onAction={tournament.tournamentState.inTournament ? handleTournamentPlayerAction : handlePlayerAction}
              canHit={canHit}
              canStand={canStand}
              canDoubleDown={canDoubleDown && (!tournament.tournamentState.inTournament || tournament.tournamentState.chips >= (currentGame?.playerHand?.betAmount ? Number(currentGame.playerHand.betAmount) : 0))}
              canSplit={canSplit && (!tournament.tournamentState.inTournament || tournament.tournamentState.chips >= (currentGame?.playerHand?.betAmount ? Number(currentGame.playerHand.betAmount) : 0))}
              reserveBalance={tournament.tournamentState.inTournament ? BigInt((tournament.displayedTournamentState ?? tournament.tournamentState).chips) : offChainBalance}
              usePLS={false}
              newCardIndices={newCardIndices}
              chipStack={tournament.tournamentState.inTournament ? tournamentChipStack : chipStack}
              onClearBet={tournament.tournamentState.inTournament ? () => {} : () => manageChipStack('', undefined, true)}
              onStartGame={tournament.tournamentState.inTournament
                ? () => handleStartTournamentGame(TOURNAMENT_CONFIG.MIN_BET)
                : handleDealClick}
              isPlaying={gameState.isPlaying}
              onDealerRevealComplete={handleDealerRevealComplete}
              gameResult={currentGameResult === 'dealer_blackjack' ? 'loss' : currentGameResult}
              onChipAnimationComplete={handleChipAnimationComplete}
              history={gameState.history}
              totalPayout={currentGame?.totalPayout || BigInt(0)}
              onDoubleDownChips={tournament.tournamentState.inTournament ? () => {} : handleDoubleDownChips}
              onSplitChips={tournament.tournamentState.inTournament ? () => {} : handleSplitChips}
              onRebet={tournament.tournamentState.inTournament ? () => {} : handleRebet}
              onRebetAndDeal={tournament.tournamentState.inTournament ? undefined : handleRebetAndDeal}
              onHalfBet={tournament.tournamentState.inTournament ? () => {} : handleHalfBet}
              onDoubleBet={tournament.tournamentState.inTournament ? () => {} : handleDoubleBet}
              isMusicPlaying={isMusicPlaying}
              onToggleMusic={toggleMusic}
              onNextTrack={nextTrack}
              musicVolume={musicVolume}
              onMusicVolumeChange={setMusicVolume}
              canDeal={tournament.tournamentState.inTournament
                ? !gameState.isPlaying && (tournament.displayedTournamentState ?? tournament.tournamentState).handsRemaining > 0
                : !gameState.isPlaying && totalBetAmount > 0}
              onBetAmountChange={tournament.tournamentState.inTournament ? () => {} : manageChipStack}
              currentBetAmount={tournament.tournamentState.inTournament ? String(TOURNAMENT_CONFIG.MIN_BET) : displayBetAmount}
              lastBetAmount={lastBetAmount}
              useVideoBackground={false}
              imageSource={imageSource}
              videoSource={videoSource}
              imageSrc={getThemeInfo({ kind: 'image', id: imageSource }).src}
              videoSrc={getThemeInfo({ kind: 'video', id: videoSource }).src}
              videoSyncToClock={videoSyncToClock}
              videoPosition={videoPosition}
              onOpenDepositModal={handleOpenDepositModal}
              onOpenTableThemeSelector={() => setThemeModalOpen(true)}
              soundEnabled={soundEnabled}
              onPlaySfx={playSfx}
              hideBettingPanel={true}
              completedGameId={currentGame?.state === GameState.COMPLETE ? currentGame?.id : undefined}
              onCardsClearComplete={handleCardsClearComplete}
              perfectPairsBet={tournament.tournamentState.inTournament ? 0 : perfectPairsBet}
              onPerfectPairsBetChange={tournament.tournamentState.inTournament ? undefined : setPerfectPairsBet}
              perfectPairsResult={tournament.tournamentState.inTournament ? undefined : currentGame?.perfectPairsResult}
              tournamentHandSummary={tournament.tournamentState.inTournament ? tournament.lastHandSummary : null}
              onDismissTournamentSummary={tournament.clearLastHandSummary}
              onOpenTournamentHistory={() => {
                setTournamentBrowserInitialTab('history');
                setShowTournamentBrowser(true);
              }}
              inTournament={tournament.tournamentState.inTournament}
              speechToggle={speech ? { listening: speech.listening, onToggle: speech.onToggle, transcript: speech.transcript, lastAction: speech.lastAction, pendingLabel: speech.pendingLabel } : undefined}
              voiceTutorialVideoUrl={voiceTutorialVideoUrl}
            />

            {address && wsConnected && wsClient && (
              <div className="absolute bottom-3 right-3 z-10 flex flex-col items-end">
                <IconButton
                  variant="tip"
                  size="tip"
                  onClick={async () => {
                    if (tipAnimating) return;
                    playSfx('/Poker/PokerSounds/PlayerClickConfirmation.mp3');
                    setTipAnimating(true);
                    try {
                      await wsClient.sendRequest('tip_dealer', {
                        amount: (BigInt(2000) * BigInt('1000000000000000000')).toString(),
                      });
                      playDealerVoice(pickRandom(SOUNDS_TIP));
                      fetchBalance();
                      const base = getApiUrlOptional();
                      if (base) fetch(`${base}/api/tips/stats`).then(r => r.json()).then(d => setTipStats(d)).catch(() => {});
                    } catch {
                      setTipAnimating(false);
                    }
                    setTimeout(() => setTipAnimating(false), 900);
                  }}
                  disabled={tipAnimating}
                >
                  Tip 2,000
                </IconButton>
                {tipAnimating && (
                  <div
                    className="absolute pointer-events-none bottom-full right-0 mb-0.5"
                    onAnimationEnd={() => setTipAnimating(false)}
                  >
                    <div className="tip-chip-fly">
                      <div className="w-6 h-6 rounded-full border-2 border-amber-400 bg-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/40">
                        <span className="text-white text-[8px] font-bold">$</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {showWinNotification && (
              <WinNotification
                amount={winAmount}
                isBlackjack={isBlackjackWin}
                onComplete={() => setShowWinNotification(false)}
              />
            )}

            {/* Voice transcript readback — top-left of table */}
            {speech?.listening !== undefined && (
              <SpeechIndicator
                listening={speech.listening}
                transcript={speech.transcript}
              />
            )}
          </div>
            </div>

          <div className="min-w-0 w-full flex-1 min-h-0 flex flex-col">
            <TableTokenProfileCard
              key={`${theme}-${theme === 'video' ? videoSource : imageSource}`}
              themeKind={theme}
              themeId={theme === 'video' ? videoSource : imageSource}
              getThemeInfo={getThemeInfo}
              getTableProfile={getTableProfile as unknown as TableTokenProfileCardProps['getTableProfile']}
              onChangeTableClick={() => setThemeModalOpen(true)}
              fillColumn
            />
          </div>
        </div>

        <div className="min-w-0 order-3 md:order-none md:row-start-1 md:col-start-2 flex flex-col gap-3">
          <div className="rounded-xl overflow-hidden p-2 sm:p-3" style={panelShell}>
          {tournament.tournamentState.inTournament ? (
            <TournamentBetPanel
              chips={(tournament.displayedTournamentState ?? tournament.tournamentState).chips}
              onStartGame={handleStartTournamentGame}
              isPlaying={gameState.isPlaying}
              handsRemaining={(tournament.displayedTournamentState ?? tournament.tournamentState).handsRemaining}
              gameResult={currentGameResult === 'dealer_blackjack' ? 'loss' : currentGameResult}
              onHit={() => handleTournamentPlayerAction(Action.HIT)}
              onStand={() => handleTournamentPlayerAction(Action.STAND)}
              onDoubleDown={() => handleTournamentPlayerAction(Action.DOUBLE_DOWN)}
              onSplit={() => handleTournamentPlayerAction(Action.SPLIT)}
              canHit={canHit}
              canStand={canStand}
              canDoubleDown={canDoubleDown && (tournament.displayedTournamentState ?? tournament.tournamentState).chips >= (currentGame?.playerHand?.betAmount ? Number(currentGame.playerHand.betAmount) : 0)}
              canSplit={canSplit && (tournament.displayedTournamentState ?? tournament.tournamentState).chips >= (currentGame?.playerHand?.betAmount ? Number(currentGame.playerHand.betAmount) : 0)}
            />
          ) : (
            <div className="flex flex-row md:flex-col items-stretch w-full">
              <div className="w-1/2 md:w-full md:border-r-0 md:border-b border-r border-white/10 flex items-center min-w-0">
                <BettingPanelMobile
                  onStartGame={(betBigInt, _clientSeed) => {
                    const ppBetWei = perfectPairsBet > 0 ? BigInt(perfectPairsBet) * BigInt(10 ** 18) : undefined;
                    handleStartGame(betBigInt, clientSeed, ppBetWei);
                  }}
                  isPlaying={gameState.isPlaying}
                  onBetAmountChange={manageChipStack}
                  currentBetAmount={displayBetAmount}
                  onHalfBet={handleHalfBet}
                  onDoubleBet={handleDoubleBet}
                  playerReserves={offChainBalance}
                  betLimits={betLimits}
                />
              </div>
              <div className="w-1/2 md:w-full flex items-stretch min-w-0">
                <BlackjackMobileActionBar
                  onRebetAndDeal={handleRebetAndDeal}
                  onStartGame={handleDealClick}
                  onAction={handlePlayerAction}
                  onDoubleDownChips={handleDoubleDownChips}
                  onSplitChips={handleSplitChips}
                  isPlaying={gameState.isPlaying}
                  canHit={canHit}
                  canStand={canStand}
                  canDoubleDown={canDoubleDown}
                  canSplit={canSplit}
                  canDeal={!gameState.isPlaying && totalBetAmount > 0}
                  chipStackLength={chipStack.length}
                  lastBetAmount={lastBetAmount}
                  soundEnabled={soundEnabled}
                  onPlaySfx={playSfx}
                  alwaysVisible
                  perfectPairsBet={perfectPairsBet}
                  onPerfectPairsBetChange={setPerfectPairsBet}
                />
              </div>
            </div>
          )}
            {!tournament.tournamentState.inTournament && (
              <div className="flex justify-end border-t border-white/5 px-2 py-2">
                <button
                  type="button"
                  onClick={() => setProvablyFairOpen(true)}
                  className="text-xs text-cyan-400/90 underline underline-offset-2 hover:text-cyan-300"
                >
                  Provably fair
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl overflow-hidden min-w-0 p-2 sm:p-3" style={panelShell}>
          <div className="min-h-[280px] h-[min(420px,40vh)] md:h-[420px] shrink-0 overflow-hidden rounded-xl min-w-0">
            <BlackjackSidebar
              history={gameState.history}
              reserveBalance={offChainBalance}
              chartRef={chartRef}
              chartSessionStartTime={chartSessionStartTime}
              onVerifyGameRequest={openVerifyView}
              soundEnabled={soundEnabled}
              onSoundEnabledChange={setSoundEnabled}
              dealerVoiceEnabled={dealerVoiceEnabled}
              onDealerVoiceChange={setDealerVoiceEnabled}
              sfxEnabled={sfxEnabled}
              onSfxEnabledChange={setSfxEnabled}
              isMusicPlaying={isMusicPlaying}
              onToggleMusic={toggleMusic}
              onNextTrack={nextTrack}
              musicVolume={musicVolume}
              onMusicVolumeChange={setMusicVolume}
              musicTrackDisplayName={
                BLACKJACK_MUSIC_PLAYLIST[musicTrackIndex].split('/').pop()?.replace('.mp3', '').replace(/-/g, ' ') ??
                'Music'
              }
              inTournament={tournament.tournamentState.inTournament}
              tournamentTabContent={tournamentTabContent}
            />
          </div>
          </div>

          <BlackjackGameSecondaryPanels address={address} tipStats={tipStats} tournament={tournament} />
        </div>
      </div>

      {/* Voice confirm — outside grid so it isn't a grid item; outside table so not clipped */}
      {speech?.pendingLabel && (
        <SpeechConfirmDialog
          label={speech.pendingLabel}
          onYes={speech.confirmYes}
          onNo={speech.confirmNo}
        />
      )}

      <ProvablyFairClientSeedModal
        open={provablyFairOpen}
        onOpenChange={setProvablyFairOpen}
        value={clientSeed}
        onChange={setClientSeed}
      />
    </>
  );
}
