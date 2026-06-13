'use client';

// Craps — page composition. Provably-fair dice (server-derived), bankroll =
// the player's poker chip balance (debited/credited via applyPokerChipDelta
// on the server). All API traffic flows through /api/arcade/craps/* which
// proxies to the Express backend, carrying the SIWE cookie.

import { useEffect, useState } from 'react';
import confetti from 'canvas-confetti';
import { useAccount } from 'wagmi';
import { Coins, RotateCw, BookOpen, ScrollText, ShieldCheck } from 'lucide-react';
import GlobalMainNav from '@/components/shared/GlobalMainNav';
import { useCrapsEngine } from '@/hooks/use-craps-engine';
import { useCrapsTutorial } from '@/hooks/use-craps-tutorial';
import { usePokerChipBalance } from '@/hooks/use-poker-chip-balance';
import { CrapsTable } from '@/components/craps/CrapsTable';
import { CrapsDice } from '@/components/craps/CrapsDice';
import { CrapsChipRail } from '@/components/craps/CrapsChipRail';
import { CrapsTutorialOverlay } from '@/components/craps/CrapsTutorialOverlay';
import { CrapsHistoryModal } from '@/components/craps/CrapsHistoryModal';
import { CrapsVerifyModal } from '@/components/craps/CrapsVerifyModal';
import { CRAPS_CHIP_LADDER } from '@/lib/craps-types';

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
  // Authoritative chip balance — same hook plinko/poker/blackjack use, with
  // 15s React Query staleTime so the header reflects the real wallet balance
  // even if a session response somehow misses chipBalance.
  const liveChipBalance = usePokerChipBalance(address);
  const [activeChip, setActiveChip] = useState<number>(CRAPS_CHIP_LADDER[1]);
  const [showWin, setShowWin] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

  // Use the engine's snapshot for instant updates after a bet / roll / clear,
  // but fall back to the auto-refreshing canonical query if the engine value
  // is missing for any reason. This is what made the header collapse to a
  // blank "CHIPS" when the engine had an empty string.
  const displayedChipBalance =
    engine.chipBalance && engine.chipBalance !== '0'
      ? engine.chipBalance
      : (liveChipBalance.data ?? engine.chipBalance ?? '0');

  // BigInt-safe thousands-formatter for chip balance (string from server).
  // Always returns a visible value — defaults to '0' on empty / undefined / NaN
  // input so the header never collapses to a blank where the number should be.
  const formatChips = (s: string | null | undefined) => {
    if (s == null || s === '') return '0';
    try { return BigInt(s).toLocaleString(); } catch { return '0'; }
  };

  // Confetti + win splash on a net-positive result. Guard on positive wins
  // explicitly — comparing to `lost` was unsafe (any non-numeric `lost`
  // collapsed the comparison and fired a "+0" splash).
  useEffect(() => {
    if (!engine.lastResult) return;
    if (!(engine.lastResult.wins > 0)) return;
    if (engine.lastResult.wins <= (engine.lastResult.lost ?? 0)) return;
    confetti({
      particleCount: Math.min(120 + engine.lastResult.wins * 1.5, 400),
      spread: 120,
      origin: { y: 0.6 },
      colors: ['#d4af37', '#f4e8c1', '#0b3d2e', '#e6c358'],
    });
    setShowWin(true);
    const t = setTimeout(() => setShowWin(false), 2000);
    return () => clearTimeout(t);
  }, [engine.lastResult]);

  const totalBet = Object.values(engine.bets).reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col min-h-screen w-full relative overflow-hidden">
      <GlobalMainNav>
      <div className="craps-root craps-page font-sans selection:bg-[#d4af37]/30 relative flex flex-col flex-1">

      <CrapsTutorialOverlay
        step={tutorial.step}
        advance={tutorial.advance}
        stop={tutorial.stop}
        lastResult={engine.lastResult}
        point={engine.point}
      />

      {/* Felt grain overlay */}
      <div className="absolute inset-0 felt-texture opacity-60 pointer-events-none" />

      {/* Wallet-required scrim */}
      {engine.needsWallet && (
        <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="text-center px-8 py-6 border border-[#d4af37]/40 rounded-2xl bg-[#0a2e22]/85 max-w-sm">
            <p className="text-[#d4af37] craps-display text-lg tracking-[0.18em] font-black mb-2">CONNECT WALLET</p>
            <p className="text-[#f4e8c1]/80 text-sm">Sign in to play craps with your chip balance.</p>
          </div>
        </div>
      )}

      {/* History modal */}
      <CrapsHistoryModal open={historyOpen} onOpenChange={setHistoryOpen} />

      {/* Provably-fair verify modal — pre-loads with the current session ID
          so the player can see the verification ✓/✗ in one click. */}
      <CrapsVerifyModal
        open={verifyOpen}
        onOpenChange={setVerifyOpen}
        commitment={engine.commitment}
        requestVerifyId={verifyOpen ? engine.commitment?.sessionId ?? null : null}
        onSetClientSeed={engine.setClientSeedAndRestart}
      />

      {/* Status bar */}
      <header className="relative z-10 h-16 flex items-center justify-between px-4 sm:px-8 bg-black/30 backdrop-blur-sm border-b border-[#d4af37]/25">
        <div className="flex gap-4 sm:gap-8 items-center">
          <h1 className="craps-display text-xl font-black tracking-[0.18em] text-[#d4af37] hidden md:block">
            MORBIUS<span className="text-[#f4e8c1]/70">.IO</span>
            <span className="text-[#f4e8c1]/35 mx-3">·</span>
            <span className="text-[#f4e8c1]/80">CRAPS</span>
          </h1>
          <nav className="flex gap-5 text-[10px] font-bold tracking-[0.25em] uppercase text-[#f4e8c1]/50 craps-display">
            <span className="text-[#d4af37] border-b border-[#d4af37] pb-1 cursor-pointer">Table</span>
            <button
              onClick={() => { engine.resetGame(); tutorial.start(); }}
              className="cursor-pointer hover:text-[#f4e8c1] transition-colors bg-transparent border-0 p-0 flex items-center gap-1.5"
            >
              <BookOpen className="w-3 h-3" />
              Tutorial
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              className="cursor-pointer hover:text-[#f4e8c1] transition-colors bg-transparent border-0 p-0 flex items-center gap-1.5"
            >
              <ScrollText className="w-3 h-3" />
              History
            </button>
            <button
              onClick={() => setVerifyOpen(true)}
              className="cursor-pointer hover:text-[#f4e8c1] transition-colors bg-transparent border-0 p-0 flex items-center gap-1.5"
              title="Provably fair — view commitment + verify rolls"
            >
              <ShieldCheck className="w-3 h-3" />
              Verify
            </button>
          </nav>
          {/* Compact commitment-hash pill — visible proof the dice were
              committed before this session's first roll. */}
          {engine.commitment && (
            <button
              onClick={() => setVerifyOpen(true)}
              className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#d4af37]/40 bg-black/30 text-[9px] font-mono text-[#d4af37]/90 hover:bg-[#d4af37]/10 hover:text-[#d4af37] transition-colors cursor-pointer"
              title={`Server seed hash: ${engine.commitment.serverSeedHash}`}
            >
              <ShieldCheck className="w-3 h-3" />
              <span className="tracking-widest">
                {engine.commitment.serverSeedHash.slice(0, 8)}…{engine.commitment.serverSeedHash.slice(-6)}
              </span>
              <span className="text-[#d4af37]/50">·</span>
              <span className="tabular-nums">n{engine.commitment.nonce}</span>
            </button>
          )}
        </div>

        <div className="flex gap-4 sm:gap-8 items-center">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-[0.3em] text-[#d4af37]/70 mb-1 craps-display">Chip Balance</span>
            <span className="text-xl craps-display font-black tracking-tight text-[#d4af37] flex items-center gap-2">
              <Coins className="w-4 h-4 text-[#d4af37]/70" />
              {formatChips(displayedChipBalance)}
              <span className="text-[10px] text-[#f4e8c1]/50 ml-1 tracking-widest">CHIPS</span>
            </span>
          </div>
          <div className="hidden sm:flex flex-col border-l border-[#d4af37]/25 pl-6">
            <span className="text-[9px] uppercase tracking-[0.3em] text-[#d4af37]/70 mb-1 craps-display">Phase</span>
            <span className="text-sm font-bold tracking-[0.2em] text-[#f4e8c1] flex items-center gap-2 craps-display">
              {engine.phase === 'COME_OUT' ? 'COME OUT' : 'POINT'}
              {engine.point && (
                <span className="bg-[#d4af37] text-[#0b3d2e] text-xs px-2 py-0.5 rounded font-black">
                  {engine.point}
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="text-right hidden lg:flex flex-col">
          <span className="text-[9px] uppercase tracking-[0.3em] text-[#d4af37]/70 mb-1 craps-display">Roll History</span>
          <div className="flex gap-1 text-xs font-mono">
            {engine.rollHistory.map((r, i) => (
              <span
                key={i}
                className={[
                  'flex items-center justify-center w-6 h-6 rounded font-black',
                  r === 7
                    ? 'bg-red-700/80 text-[#f4e8c1]'
                    : [4, 5, 6, 8, 9, 10].includes(r)
                      ? 'bg-[#d4af37] text-[#0b3d2e]'
                      : 'bg-[#f4e8c1]/10 text-[#f4e8c1]/60',
                  i === 0 ? 'ring-1 ring-[#d4af37]/60 scale-110' : 'opacity-80',
                ].join(' ')}
              >
                {r}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-0 flex-1 flex flex-col xl:flex-row gap-4 p-4">
        {showWin && engine.lastResult && (
          <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
            <div className="bg-[#0b3d2e]/40 backdrop-blur-sm border-4 border-[#d4af37] px-12 py-8 rounded-[3rem] shadow-[0_0_100px_rgba(212,175,55,0.4)] animate-bounce">
              <span className="block text-4xl sm:text-6xl md:text-8xl font-black text-[#d4af37] drop-shadow-[0_5px_10px_rgba(0,0,0,0.8)] craps-display">
                +{engine.lastResult.wins.toLocaleString()}
              </span>
              <span className="block text-center text-xs tracking-[0.4em] text-[#f4e8c1]/70 mt-2 craps-display">CHIPS</span>
            </div>
          </div>
        )}

        {engine.lastResult?.isSevenOut && (
          <div className="absolute inset-0 z-50 pointer-events-none flex items-center justify-center">
            <div className="bg-red-950/85 backdrop-blur-md px-24 py-12 rounded-[2rem] border-8 border-black animate-pulse shadow-2xl">
              <span className="block text-6xl md:text-9xl font-black text-red-500 drop-shadow-[0_4px_4px_rgba(0,0,0,1)] uppercase tracking-[0.2em] craps-display">
                7 OUT
              </span>
            </div>
          </div>
        )}

        <section className="flex-1 relative bg-gradient-to-b from-[#144d3a] to-[#062018] rounded-[40px] border-4 border-[#1e5c3e] shadow-[inset_0_0_60px_rgba(0,0,0,0.7)] flex flex-col p-4 sm:p-6 overflow-hidden">
          <div className="absolute inset-3 rounded-[34px] border border-[#d4af37]/25 pointer-events-none" />
          <CrapsTable
            bets={engine.bets}
            point={engine.point}
            phase={engine.phase}
            activeChip={activeChip}
            placeBet={engine.placeBet}
            isRolling={engine.isRolling}
          />
        </section>

        <aside className="w-full xl:w-64 flex flex-col gap-4 shrink-0 mt-4 xl:mt-0">
          <div className="flex-1 bg-black/25 border border-[#d4af37]/25 rounded-2xl flex flex-col items-center justify-center p-6 min-h-[260px]">
            <p className="text-[10px] uppercase font-bold text-[#d4af37]/70 mb-2 tracking-[0.3em] craps-display">Dice Outcome</p>
            <div className="w-full flex items-center justify-center relative z-20 scale-[0.7] sm:scale-[0.8] md:scale-90 mb-4 h-32 md:h-48 overflow-visible">
              <CrapsDice val1={engine.dice[0]} val2={engine.dice[1]} isRolling={engine.isRolling} />
            </div>
            {engine.lastResult && !engine.isRolling && (
              <p className="text-4xl font-black text-[#d4af37] craps-display tracking-tight">
                {engine.dice[0] + engine.dice[1]}
              </p>
            )}
          </div>

          <button
            onClick={engine.rollDice}
            disabled={engine.isRolling || engine.needsWallet || engine.isInitializing}
            className="h-20 bg-[#d4af37] hover:bg-[#e6c358] disabled:opacity-50 text-[#0b3d2e] rounded-2xl font-black text-2xl craps-display tracking-[0.18em] shadow-[0_8px_24px_rgba(212,175,55,0.35)] active:scale-95 transition-all w-full flex items-center justify-center gap-2 cursor-pointer border-0 disabled:cursor-not-allowed"
          >
            {engine.isRolling ? <RotateCw className="w-5 h-5 animate-spin" /> : null}
            {engine.isRolling ? 'ROLLING' : 'ROLL DICE'}
          </button>
        </aside>
      </main>

      {/* Footer / chip rail */}
      <footer className="relative z-10 h-auto md:h-28 bg-black/40 backdrop-blur-sm border-t border-[#d4af37]/25 flex flex-col md:flex-row items-center px-4 md:px-10 gap-6 py-4 md:py-0">
        <div className="flex gap-3">
          <button
            onClick={engine.clearBets}
            disabled={engine.isRolling || Object.keys(engine.bets).length === 0}
            className="px-6 py-2 border border-[#d4af37]/40 rounded-lg text-xs font-bold uppercase tracking-[0.2em] text-[#f4e8c1] hover:bg-[#d4af37]/10 disabled:opacity-40 transition-colors bg-transparent cursor-pointer craps-display"
          >
            Clear Bets
          </button>
        </div>

        <CrapsChipRail activeChip={activeChip} onSelect={setActiveChip} />

        <div className="w-auto md:w-52 text-center md:text-right">
          <p className="text-[10px] uppercase font-bold text-[#d4af37]/70 tracking-[0.3em] craps-display">Bet Total</p>
          <p className="text-xl md:text-2xl font-black text-[#d4af37] craps-display tracking-tight">
            {totalBet.toLocaleString()}
            <span className="text-[10px] text-[#f4e8c1]/50 ml-1.5 tracking-widest">CHIPS</span>
          </p>
        </div>
      </footer>

      </div>
      </GlobalMainNav>
    </div>
  );
}
