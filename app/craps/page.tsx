'use client';

// Craps — Deep-Sea Neon (arcade2) composition, matched to /keno2.
// Abyss #050E16 shell, cyan #22D3EE accents, amber wins, Chakra Petch display +
// JetBrains Mono numerals, controls-rail-left / game-area-right layout.
//
// Provably-fair dice (server-derived); bankroll = the player's poker chip
// balance (debited/credited via applyPokerChipDelta on the server). All API
// traffic flows through /api/arcade/craps/* which proxies to the Express
// backend, carrying the SIWE cookie.

import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { useAccount } from 'wagmi';
import { Chakra_Petch, JetBrains_Mono } from 'next/font/google';
import { Coins, RotateCw, BookOpen, GraduationCap, ScrollText, ShieldCheck, AlertTriangle, X, Dices, Percent } from 'lucide-react';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import Footer from '@/components/PLINKO/Footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useCrapsEngine } from '@/hooks/use-craps-engine';
import { useCrapsTutorial } from '@/hooks/use-craps-tutorial';
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance';
import { GameWalletModal } from '@/components/shared/GameWalletModal';
import { CrapsTable } from '@/components/craps/CrapsTable';
import { CrapsDiceThrow } from '@/components/craps/CrapsDiceThrow';
import { CrapsChipRail } from '@/components/craps/CrapsChipRail';
import { CrapsTutorialOverlay } from '@/components/craps/CrapsTutorialOverlay';
import { CrapsHistoryModal } from '@/components/craps/CrapsHistoryModal';
import { CrapsVerifyModal } from '@/components/craps/CrapsVerifyModal';
import { CrapsRulesModal } from '@/components/craps/CrapsRulesModal';
import { CrapsOddsModal } from '@/components/craps/CrapsOddsModal';
import { CRAPS_CHIP_LADDER } from '@/lib/craps-types';

const arcDisplay = Chakra_Petch({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-arc-display',
});
const arcMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arc-mono',
});

export default function CrapsPage() {
  const engine = useCrapsEngine();
  const tutorial = useCrapsTutorial(
    engine.bets,
    engine.phase,
    engine.point,
    engine.isRolling,
    engine.lastResult,
  );
  const { address } = useAccount();
  // Authoritative chip balance — same hook plinko/poker/blackjack/keno use.
  const { data: liveChipData, refetch: refetchBalance } = usePokerChipBalance(address);
  const [activeChip, setActiveChip] = useState<number>(CRAPS_CHIP_LADDER[1]);
  const [showWin, setShowWin] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [exchangeOpen, setExchangeOpen] = useState(false);

  // Prefer the engine snapshot for instant updates after a bet / roll / clear,
  // falling back to the auto-refreshing canonical query so the header never
  // collapses to a blank when the engine value is briefly empty.
  const displayedChipBalance =
    engine.chipBalance && engine.chipBalance !== '0'
      ? engine.chipBalance
      : (liveChipData ?? engine.chipBalance ?? '0');

  // BigInt-safe thousands formatter; always returns a visible value.
  const formatChips = (s: string | null | undefined) => {
    if (s == null || s === '') return '0';
    try { return BigInt(s).toLocaleString(); } catch { return '0'; }
  };

  // Confetti + win splash on a net-positive result.
  useEffect(() => {
    if (!engine.lastResult) return;
    if (!(engine.lastResult.wins > 0)) return;
    if (engine.lastResult.wins <= (engine.lastResult.lost ?? 0)) return;
    confetti({
      particleCount: Math.min(120 + engine.lastResult.wins * 1.5, 400),
      spread: 120,
      origin: { y: 0.6 },
      colors: ['#22D3EE', '#F59E0B', '#67E8F9', '#0E7490'],
    });
    setShowWin(true);
    const t = setTimeout(() => setShowWin(false), 2000);
    return () => clearTimeout(t);
  }, [engine.lastResult]);

  // Auto-dismiss errors after 5s so a stale message doesn't haunt the UI.
  useEffect(() => {
    if (!engine.error) return;
    const t = setTimeout(() => engine.clearError(), 5000);
    return () => clearTimeout(t);
  }, [engine.error, engine.clearError]);

  const totalBet = Object.values(engine.bets).reduce((a, b) => a + b, 0);
  const sum = engine.dice[0] + engine.dice[1];

  return (
    <GlobalMainNav>
      <div
        className={`arcade2-scope craps-root relative min-h-screen h-full w-full flex flex-col text-slate-200 pb-28 lg:pb-0 ${arcDisplay.variable} ${arcMono.variable}`}
        style={{
          backgroundImage:
            'linear-gradient(to bottom, rgba(5,14,22,0.92), rgba(2,6,11,0.96) 55%, rgba(5,14,22,0.98))',
          backgroundColor: '#050E16',
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
        }}
      >
        {/* Abyss lighting: a cold cyan shaft from above, vignette below. */}
        <div className="pointer-events-none absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_75%_55%_at_50%_-5%,rgba(34,211,238,0.13),transparent_70%)]" />
        <div className="pointer-events-none absolute inset-0 h-full min-h-screen w-full bg-[radial-gradient(ellipse_120%_60%_at_50%_115%,rgba(0,0,0,0.55),transparent_60%)]" />

        <CrapsTutorialOverlay
          step={tutorial.step}
          advance={tutorial.advance}
          stop={tutorial.stop}
          lastResult={engine.lastResult}
          point={engine.point}
        />

        {/* Wallet-required prompt (non-blocking; the rail still shows state). */}
        {engine.needsWallet && (
          <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="text-center px-8 py-6 border border-cyan-500/30 rounded-2xl bg-[#050E16]/85 backdrop-blur-sm max-w-sm">
              <p className="arc-display text-lg tracking-[0.18em] font-bold text-cyan-300 mb-2">CONNECT WALLET</p>
              <p className="text-slate-400 text-sm">Sign in to play craps with your chip balance.</p>
            </div>
          </div>
        )}

        {/* Live error banner — placeBet / clearBets / rollDice failures land here. */}
        {engine.error && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] max-w-md w-[90%] pointer-events-auto">
            <div className="flex items-start gap-3 bg-rose-950/90 backdrop-blur-md border border-rose-500/50 rounded-xl px-4 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
              <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
              <p className="flex-1 text-sm text-rose-100 leading-snug">{engine.error}</p>
              <button
                onClick={() => engine.clearError()}
                className="text-rose-200/70 hover:text-rose-100 bg-transparent border-0 cursor-pointer p-0 shrink-0"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="relative flex-1 w-full max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6">
          <main className="w-full max-w-full overflow-x-hidden pb-16 pt-1">
            <header className="mb-5 text-center">
              <h1 className="arc-display text-3xl font-bold uppercase tracking-[0.08em] text-white sm:text-4xl flex items-center justify-center gap-3">
                Craps
                <Dices className="w-7 h-7 text-cyan-400 drop-shadow-[0_0_12px_rgba(34,211,238,0.65)]" />
              </h1>
              <p className="mt-1.5 text-sm text-slate-400">
                Pass line · place · field · props · provably fair · played in MORBIUS
              </p>
            </header>

            <div className="mx-auto w-full max-w-6xl">
              <div className="grid gap-4 lg:grid-cols-[320px_1fr]">

                {/* ───────── Controls rail ───────── */}
                <Card className="arc-panel order-2 h-fit space-y-4 border-0 p-4 lg:order-1 lg:sticky lg:top-20">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Balance</span>
                    <div className="flex items-center gap-2">
                      <span className="arc-mono text-sm tabular-nums text-amber-300 flex items-center gap-1">
                        <Coins className="w-3.5 h-3.5 text-amber-300/70" />
                        {formatChips(displayedChipBalance)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setExchangeOpen(true)}
                        className="rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/20"
                      >
                        Buy
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-wide text-slate-500">Phase</span>
                    <span className="arc-display text-sm font-semibold tracking-[0.15em] text-slate-200 flex items-center gap-2">
                      {engine.phase === 'COME_OUT' ? 'COME OUT' : 'POINT'}
                      {engine.point && (
                        <span className="bg-cyan-500 text-[#04121b] text-xs px-2 py-0.5 rounded arc-mono font-bold">
                          {engine.point}
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="h-px bg-cyan-950/70" />

                  <div className="space-y-2">
                    <label className="text-xs uppercase tracking-wide text-slate-500">Chip</label>
                    <CrapsChipRail activeChip={activeChip} onSelect={setActiveChip} />
                  </div>

                  {/* Table limits, straight from the server. The max is per
                      betting zone (the total resting on it), the way a real
                      craps table posts it. */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="uppercase tracking-wide text-slate-500">Table limits</span>
                    <span className="arc-mono tabular-nums text-slate-400">
                      {engine.limits.min.toLocaleString()} – {engine.limits.max.toLocaleString()}
                      <span className="ml-1 normal-case text-slate-600">per bet</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="uppercase tracking-wide text-slate-500">Bet total</span>
                    <span className="arc-mono tabular-nums text-cyan-300">
                      {totalBet.toLocaleString()} MORBIUS
                    </span>
                  </div>

                  {/* Clear bets + Roll dice — pinned to a fixed bottom bar on mobile
                      (the primary roll CTA stays reachable without scrolling); in-flow
                      in the rail on desktop. The chip rail + on-felt bet areas remain
                      in flow above. */}
                  <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-3 border-t border-cyan-950/70 bg-[#07131F]/95 p-3 backdrop-blur-sm lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={engine.isRolling || Object.keys(engine.bets).length === 0}
                    onClick={engine.clearBets}
                    className="w-full border-cyan-950 bg-transparent hover:bg-cyan-500/10 disabled:opacity-40"
                  >
                    Clear bets
                  </Button>

                  <Button
                    type="button"
                    disabled={engine.isRolling || engine.needsWallet || engine.isInitializing}
                    onClick={engine.rollDice}
                    className="arc-display h-12 w-full bg-cyan-500 text-base font-bold uppercase tracking-widest text-[#03121B] shadow-[0_0_24px_-6px_rgba(34,211,238,0.8)] hover:bg-cyan-400 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {engine.isRolling ? <RotateCw className="w-4 h-4 animate-spin" /> : null}
                    {engine.isRolling ? 'Rolling…' : 'Roll dice'}
                  </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-1 text-xs">
                    <button
                      onClick={() => setRulesOpen(true)}
                      className="text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer"
                    >
                      <BookOpen className="w-3 h-3" /> Rules
                    </button>
                    <button
                      onClick={() => setOddsOpen(true)}
                      className="text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer"
                    >
                      <Percent className="w-3 h-3" /> Odds
                    </button>
                    <button
                      onClick={() => setVerifyOpen(true)}
                      className="text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer"
                    >
                      <ShieldCheck className="w-3 h-3" /> Verify
                    </button>
                    <button
                      onClick={() => setHistoryOpen(true)}
                      className="text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer"
                    >
                      <ScrollText className="w-3 h-3" /> History
                    </button>
                    <button
                      onClick={() => { engine.resetGame(); tutorial.start(); }}
                      className="text-slate-500 hover:text-cyan-400 transition-colors flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer"
                    >
                      <GraduationCap className="w-3 h-3" /> Tutorial
                    </button>
                  </div>

                  {engine.commitment && (
                    <button
                      onClick={() => setVerifyOpen(true)}
                      className="w-full text-center arc-mono text-[10px] text-slate-600 hover:text-cyan-400 transition-colors bg-transparent border-0 p-0 cursor-pointer truncate"
                      title={`Server seed hash: ${engine.commitment.serverSeedHash}`}
                    >
                      {engine.commitment.serverSeedHash.slice(0, 8)}…{engine.commitment.serverSeedHash.slice(-6)} · n{engine.commitment.nonce}
                    </button>
                  )}
                </Card>

                {/* ───────── Game area ───────── */}
                <div className="order-1 space-y-4 lg:order-2">
                  {/* Shooter — dice + roll history */}
                  <Card className="arc-panel border-0 p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] uppercase tracking-[0.25em] text-slate-500 arc-display">Shooter</span>
                      <div className="flex gap-1">
                        {engine.rollHistory.map((r, i) => (
                          <span
                            key={i}
                            className={cn(
                              'arc-mono flex items-center justify-center w-6 h-6 rounded text-xs font-bold',
                              r === 7
                                ? 'bg-rose-600/80 text-white'
                                : [4, 5, 6, 8, 9, 10].includes(r)
                                  ? 'bg-cyan-500 text-[#04121b]'
                                  : 'bg-cyan-500/10 text-slate-400',
                              i === 0 ? 'ring-1 ring-cyan-300/60 scale-105' : 'opacity-80',
                            )}
                          >
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-center min-h-[120px] relative">
                      <div className="w-full">
                        <CrapsDiceThrow
                          val1={engine.dice[0]}
                          val2={engine.dice[1]}
                          rollKey={engine.rollNonce || null}
                          onSettle={engine.diceSettled}
                        />
                      </div>
                      {engine.lastResult && !engine.isRolling && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-right">
                          <span className="block arc-mono text-3xl font-bold text-cyan-300 leading-none">{sum}</span>
                          {engine.lastResult.wins > 0 ? (
                            <span className="arc-mono text-xs text-amber-300">+{engine.lastResult.wins.toLocaleString()}</span>
                          ) : engine.lastResult.isSevenOut ? (
                            <span className="arc-display text-xs text-rose-400 tracking-widest">7 OUT</span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </Card>

                  {/* Felt */}
                  <Card className="arc-panel relative border-0 p-3 sm:p-4">
                    <CrapsTable
                      bets={engine.bets}
                      point={engine.point}
                      phase={engine.phase}
                      activeChip={activeChip}
                      placeBet={engine.placeBet}
                      isRolling={engine.isRolling}
                    />

                    {showWin && engine.lastResult && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="arc-banner-in rounded-2xl border border-amber-400/40 bg-[#050E16]/70 px-10 py-6 text-center shadow-[0_0_60px_-12px_rgba(245,158,11,0.55)]">
                          <span className="block arc-display text-4xl sm:text-6xl font-bold text-amber-300">
                            +{engine.lastResult.wins.toLocaleString()}
                          </span>
                          <span className="block text-center text-[10px] tracking-[0.4em] text-amber-200/80 mt-1 arc-display">CHIPS</span>
                        </div>
                      </div>
                    )}

                    {engine.lastResult?.isSevenOut && !showWin && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="arc-banner-in rounded-2xl border border-rose-500/40 bg-[#050E16]/75 px-12 py-6 shadow-[0_0_60px_-12px_rgba(244,63,94,0.6)]">
                          <span className="block arc-display text-5xl md:text-7xl font-bold text-rose-500 uppercase tracking-[0.2em]">
                            7 Out
                          </span>
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
              </div>
            </div>
          </main>
        </div>

        <Footer />

        {/* Modals */}
        <CrapsHistoryModal open={historyOpen} onOpenChange={setHistoryOpen} />
        <CrapsVerifyModal
          open={verifyOpen}
          onOpenChange={setVerifyOpen}
          commitment={engine.commitment}
          requestVerifyId={verifyOpen ? engine.commitment?.sessionId ?? null : null}
          onSetClientSeed={engine.setClientSeedAndRestart}
        />
        <CrapsRulesModal open={rulesOpen} onOpenChange={setRulesOpen} />
        <CrapsOddsModal open={oddsOpen} onOpenChange={setOddsOpen} />
        <GameWalletModal
          isOpen={exchangeOpen}
          onClose={() => setExchangeOpen(false)}
          defaultTab="deposit"
          balanceLabel="MORBIUS"
          onBalanceSync={async () => { await refetchBalance?.(); }}
        />
      </div>
    </GlobalMainNav>
  );
}
