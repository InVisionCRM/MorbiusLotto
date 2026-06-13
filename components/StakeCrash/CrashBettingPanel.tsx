'use client';

/**
 * CrashBettingPanel — the right-hand betting drawer (/crash).
 *
 * Faithful port of the prototype's BettingPanel, played in chips:
 *   • Expanded: balance pill, bet amount + Min/½/2x/Max, auto-cashout input
 *     with range slider, big gradient action button (Place Bet / Wait states).
 *   • Collapsed (mid-flight with an active bet): the giant orange CASH OUT
 *     button showing the live potential win.
 */

import { useCrashStore } from './useCrashStore';
import { crashAudio } from './crash-audio';
import { formatChips } from '@/lib/format-poker-chips';
import type { CrashInfo } from '@/lib/crash-client';

interface CrashBettingPanelProps {
  isCollapsed?: boolean;
  info: CrashInfo | null;
  onOpenFairness: () => void;
  onOpenExchange: () => void;
}

export default function CrashBettingPanel({
  isCollapsed = false,
  info,
  onOpenFairness,
  onOpenExchange,
}: CrashBettingPanelProps) {
  const {
    phase,
    balance,
    betAmount,
    autoCashout,
    hasBet,
    hasCashedOut,
    winAmount,
    multiplier,
    error,
    noChips,
    setBetAmount,
    setAutoCashout,
    armBet,
    requestCashout,
  } = useCrashStore();

  const minBet = info?.minBet ?? 10;
  const maxBet = info?.maxBet ?? 2000;
  const maxCashout = (info?.maxCashoutX100 ?? 10_000) / 100;

  const balanceNum = balance != null ? Number(balance) : 0;

  const clampBet = (n: number) =>
    Math.min(maxBet, Math.max(minBet, Math.floor(n || 0)));

  const handleMin = () => setBetAmount(minBet);
  const handleHalf = () => setBetAmount(clampBet(betAmount / 2));
  const handleDouble = () => setBetAmount(clampBet(Math.min(balanceNum || maxBet, betAmount * 2)));
  const handleMax = () => setBetAmount(clampBet(Math.min(balanceNum || maxBet, maxBet)));

  const canBet =
    phase === 'betting' &&
    !hasBet &&
    info != null &&
    balance != null &&
    balanceNum >= betAmount &&
    betAmount >= minBet &&
    betAmount <= maxBet;
  const canCashOut = phase === 'flying' && hasBet && !hasCashedOut;

  // Potential win if cashed out now (chips are integers)
  const potentialWin = Math.floor(betAmount * multiplier);

  const placeBetImpl = () => {
    crashAudio.init(); // Just in case it's the first interaction
    crashAudio.playBet();
    setBetAmount(clampBet(betAmount));
    armBet();
  };

  const cashOutImpl = () => {
    requestCashout();
  };

  // State B: Collapsed (Drawer pushed right, only massive action button)
  if (isCollapsed) {
    return (
      <div className="w-full h-full p-4 lg:p-6 flex items-center justify-center">
        <button
          onClick={cashOutImpl}
          disabled={!canCashOut}
          className="w-full h-full max-h-[400px] rounded-[16px] lg:rounded-[24px] font-[900] hover:opacity-90 transition-all text-white bg-gradient-to-t from-[#ff9d00] to-[#ff6a00] shadow-[0_0_50px_rgba(255,157,0,0.3)] flex flex-col items-center justify-center disabled:opacity-50 border border-white/20"
        >
          <div className="text-[16px] xl:text-[24px] opacity-90 uppercase tracking-widest mb-4">
            Cash Out
          </div>
          <div className="text-[32px] xl:text-[48px] drop-shadow-md leading-none mb-1">
            {potentialWin.toLocaleString()}
          </div>
          <div className="text-[14px] xl:text-[16px] text-white/70 uppercase tracking-[2px]">
            CHIPS
          </div>
        </button>
      </div>
    );
  }

  // State A: Expanded Betting Controls
  return (
    <div className="flex flex-col w-full h-full p-4 lg:p-6 overflow-y-auto no-scrollbar justify-center">
      {/* Top Meta info */}
      <div className="flex items-center justify-end mb-4 lg:mb-6">
        <div className="bg-white/5 py-1.5 lg:py-2 px-3 lg:px-4 rounded-[6px] lg:rounded-[8px] flex items-center gap-[8px] lg:gap-[12px] border border-white/[0.1]">
          <span className="text-[10px] lg:text-[11px] uppercase text-[#848ca1] tracking-[1px]">
            Bal
          </span>
          <span className="font-bold text-[#00ffa3] text-[12px] lg:text-[14px]">
            {balance != null ? formatChips(balance) : '—'}
          </span>
          <button
            onClick={onOpenExchange}
            className="text-[10px] lg:text-[11px] uppercase tracking-[1px] font-bold text-[#06070a] bg-[#00ffa3] hover:bg-[#00d98a] transition-colors rounded-[4px] px-2 py-0.5"
          >
            Buy
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4 lg:gap-6 justify-start">
        {/* Inputs Group - Side by Side on larger screens, strictly stacked if squished */}
        <div className="flex flex-col 2xl:flex-row gap-4 lg:gap-6">
          {/* Bet Amount */}
          <div className="flex-1 flex flex-col">
            <div className="flex justify-between mb-2 text-[10px] lg:text-[12px] text-[#848ca1] uppercase font-medium">
              <span>
                Bet Amount{' '}
                <span className="normal-case opacity-60">
                  ({minBet.toLocaleString()}–{maxBet.toLocaleString()})
                </span>
              </span>
              <span className="text-[#00ffa3]">CHIPS</span>
            </div>
            <div className="relative">
              <input
                type="number"
                value={betAmount.toString()}
                onChange={(e) => setBetAmount(Math.floor(parseFloat(e.target.value) || 0))}
                onBlur={() => setBetAmount(clampBet(betAmount))}
                disabled={hasBet || phase !== 'betting'}
                className="w-full bg-[#10121a] border border-white/[0.1] rounded-[8px] py-[12px] lg:py-[16px] px-[12px] text-white text-[16px] lg:text-[20px] font-mono focus:outline-none focus:border-[#00ffa3] disabled:opacity-50"
              />
            </div>
            <div className="grid grid-cols-4 gap-2 mt-2">
              <button
                onClick={handleMin}
                disabled={hasBet || phase !== 'betting'}
                className="bg-white/5 border border-white/10 text-white py-2 rounded-[6px] text-[11px] lg:text-[12px] cursor-pointer hover:bg-white/10 transition-colors disabled:opacity-50 font-medium uppercase"
              >
                Min
              </button>
              <button
                onClick={handleHalf}
                disabled={hasBet || phase !== 'betting'}
                className="bg-white/5 border border-white/10 text-white py-2 rounded-[6px] text-[11px] lg:text-[12px] cursor-pointer hover:bg-white/10 transition-colors disabled:opacity-50 font-medium uppercase"
              >
                1/2
              </button>
              <button
                onClick={handleDouble}
                disabled={hasBet || phase !== 'betting'}
                className="bg-white/5 border border-white/10 text-white py-2 rounded-[6px] text-[11px] lg:text-[12px] cursor-pointer hover:bg-white/10 transition-colors disabled:opacity-50 font-medium uppercase"
              >
                2x
              </button>
              <button
                onClick={handleMax}
                disabled={hasBet || phase !== 'betting'}
                className="bg-white/5 border border-white/10 text-white py-2 rounded-[6px] text-[11px] lg:text-[12px] cursor-pointer hover:bg-white/10 transition-colors disabled:opacity-50 font-medium uppercase"
              >
                Max
              </button>
            </div>
          </div>

          {/* Auto Cashout */}
          <div className="flex-[0.8] flex flex-col">
            <div className="flex justify-between mb-2 text-[10px] lg:text-[12px] text-[#848ca1] uppercase font-medium">
              <span>Auto Cashout</span>
              <span className="text-[#ff9d00]">Multiplier</span>
            </div>

            <div className="relative group mb-3">
              <input
                type="number"
                value={autoCashout}
                onChange={(e) => setAutoCashout(parseFloat(e.target.value) || 1.01)}
                onBlur={() => setAutoCashout(Math.min(maxCashout, Math.max(1.01, autoCashout)))}
                disabled={hasBet || phase !== 'betting'}
                step="0.01"
                min="1.01"
                max={maxCashout}
                className="w-full bg-[#10121a] border border-white/[0.1] rounded-[8px] py-[12px] lg:py-[16px] px-[12px] text-white text-[16px] lg:text-[20px] font-mono focus:outline-none focus:border-[#ff9d00] disabled:opacity-50 transition-all"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 font-bold text-[14px] lg:text-[18px]">
                x
              </span>
            </div>

            <div className="px-1">
              <input
                type="range"
                min="1.01"
                max="10.00"
                step="0.01"
                value={autoCashout > 10 ? 10 : autoCashout}
                disabled={hasBet || phase !== 'betting'}
                onChange={(e) => setAutoCashout(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#ff9d00] disabled:opacity-30 disabled:cursor-not-allowed"
              />
              <div className="flex justify-between mt-1 text-[9px] text-[#848ca1] font-mono">
                <span>1.01x</span>
                <span>5.00x</span>
                <span>10.00x+</span>
              </div>
            </div>

            <div className="mt-3 text-[10px] text-[#848ca1] opacity-70 leading-tight">
              Auto-claims your winnings if the rocket reaches this multiplier before crashing. Max
              cashout {maxCashout.toFixed(0)}x.
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="mt-auto pt-4 border-t border-white/5">
          {hasBet && phase === 'betting' && (
            <button
              disabled
              className="w-full py-[20px] lg:py-[24px] rounded-[12px] font-[900] text-[18px] lg:text-[22px] text-white bg-white/10 uppercase tracking-widest border border-white/5"
            >
              Wait...
            </button>
          )}

          {!hasBet && phase !== 'betting' && (
            <button
              disabled
              className="w-full py-[20px] lg:py-[24px] rounded-[12px] font-[900] text-[18px] lg:text-[22px] text-white bg-white/10 uppercase opacity-50 tracking-widest border border-white/5"
            >
              Wait Next Round
            </button>
          )}

          {!hasBet && phase === 'betting' && (
            <button
              onClick={placeBetImpl}
              disabled={!canBet}
              className="w-full py-[20px] lg:py-[24px] rounded-[12px] font-[900] text-[18px] lg:text-[22px] text-[#06070a] bg-gradient-to-b from-[#00ffa3] to-[#00b372] shadow-[0_10px_30px_rgba(0,255,163,0.3)] hover:opacity-90 disabled:opacity-50 disabled:shadow-none transition-all uppercase tracking-widest"
            >
              Place Bet
            </button>
          )}

          {hasBet && hasCashedOut && (
            <div className="w-full py-[16px] lg:py-[20px] rounded-[12px] font-[800] text-[#06070a] bg-gradient-to-b from-[#00ffa3] to-[#00b372] uppercase flex flex-col items-center shadow-[0_10px_30px_rgba(0,255,163,0.2)]">
              <span className="text-[12px] lg:text-[14px] opacity-90 uppercase tracking-widest mb-1">
                Cashed Out!
              </span>
              <span className="text-[24px] lg:text-[28px] drop-shadow-sm leading-none">
                {winAmount?.toLocaleString()} <span className="text-[14px]">CHIPS</span>
              </span>
            </div>
          )}

          {error && (
            <div className="mt-3 text-center">
              <p className="text-[13px] text-[#ff3e3e]">{error}</p>
              {noChips && (
                <button
                  onClick={onOpenExchange}
                  className="mt-1 text-[13px] font-semibold text-[#00ffa3] underline-offset-2 hover:underline"
                >
                  Buy chips →
                </button>
              )}
            </div>
          )}

          <button
            onClick={onOpenFairness}
            className="mt-3 w-full text-center text-[11px] uppercase tracking-[1px] text-[#848ca1] hover:text-[#00ffa3] transition-colors"
          >
            Provably Fair
          </button>
        </div>
      </div>
    </div>
  );
}
