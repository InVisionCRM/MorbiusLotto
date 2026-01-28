'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import {
  useCurrentRound,
  useRound,
  useMegaMillionsBank,
  usePlayerTickets,
  useHouseTicket,
  useWatchRoundFinalized,
  useWatchMegaMillions,
} from '@/hooks/use-lottery-6of55';
import LotteryMainNav from '@/components/lottery/LotteryMainNav';
import { FreeTicketBadge } from '@/components/lottery/free-ticket-badge';
import { RoundTimer } from '@/components/lottery/round-timer';
import { LotteryBentoGrid } from '@/components/lottery/bento-grid-lottery';
import { RoundFinalizedTransactions } from '@/components/lottery/round-finalized-transactions';
import { RoundHistory } from '@/components/lottery/round-history';
import { MORBIUSMovementFeed } from '@/components/lottery/morbius-movement-feed';
import { MultiClaimModal } from '@/components/lottery/modals/multi-claim-modal';
import { PreviousRoundsBracketsModal } from '@/components/lottery/modals/previous-rounds-brackets-modal';
import { useNumberHeatmap } from '@/hooks/use-number-heatmap';
import { useMorbiusBurned } from '@/hooks/use-morbius-burned';
import { useMultiRoundPurchases, getRoundRangeForTx } from '@/hooks/use-multi-round-purchases';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { triggerSuccessConfetti } from '@/lib/utils';
import { formatUnits, formatEther, parseAbiItem } from 'viem';
import { LOTTERY_ADDRESS, LOTTERY_DEPLOY_BLOCK, TOKEN_DECIMALS } from '@/lib/contracts';
import { TicketPurchaseBuilder } from '@/components/lottery/ticket-purchase-builder';
import { TicketPurchaseAccordion } from '@/components/lottery/ticket-purchase-accordion';
import { AllTicketsAccordion } from '@/components/lottery/all-tickets-accordion';
import { ContractAddress } from '@/components/ui/contract-address';
import Footer from '@/components/PLINKO/Footer';

type ContractTicket = {
  ticketId: bigint | number;
  numbers: readonly (number | bigint)[];
  isFreeTicket: boolean;
};

export default function LotteryPage() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [selectedTickets, setSelectedTickets] = useState<number[][]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [ticketTxMap, setTicketTxMap] = useState<Map<string, string>>(new Map());
  const [showTicketAccordion, setShowTicketAccordion] = useState(false);
  const [showPlayerStats, setShowPlayerStats] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTicketsModal, setShowTicketsModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showRoundHistoryModal, setShowRoundHistoryModal] = useState(false);
  const [showPayoutBreakdownModal, setShowPayoutBreakdownModal] = useState(false);
  const [showBentoGridModal, setShowBentoGridModal] = useState(false);


  // Fetch current round data
  const { data: roundDataRaw, isLoading: isLoadingRound, refetch: refetchRound, error: roundError } = useCurrentRound()
  const { data: megaBankRaw, refetch: refetchMegaBank } = useMegaMillionsBank()

  const [roundsToPlay, setRoundsToPlay] = useState(1)

  // Parse round data from getCurrentRoundInfo (memoized to prevent recreating BigInts)
  // V2 Returns: [roundId, startTime, endTime, totalMorbius, totalTickets, uniquePlayers, timeRemaining, state]
  const roundData = useMemo(() => {
    if (Array.isArray(roundDataRaw) && roundDataRaw.length >= 8) {
      return roundDataRaw as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, number]
    }
    return undefined
  }, [roundDataRaw])

  const roundId = roundData?.[0] ?? BigInt(0)
  const startTime = roundData?.[1] ?? BigInt(0)
  const endTime = roundData?.[2] ?? BigInt(0)
  const totalMorbius = roundData?.[3] ?? BigInt(0)
  const totalTickets = roundData?.[4] ?? BigInt(0)
  const uniquePlayers = roundData?.[5] ?? BigInt(0)
  const timeRemaining = roundData?.[6] ?? BigInt(0)
  const roundState = roundData?.[7] || 0
  const isMegaMillionsRound = false // MegaMillions not used in V2

  // Debug round state
  console.log('🎰 Round state:', {
    roundId: roundId.toString(),
    roundState,
    timeRemaining: timeRemaining.toString(),
    isRoundOpen: roundState === 0, // 0 = OPEN, 1 = FINALIZED
    roundData
  })

  const megaBank = (megaBankRaw ?? BigInt(0)) as bigint

  // Fetch number heatmap data for last 25 rounds
  const { getHeatLevel, isLoading: isLoadingHeatmap, hotNumbers, coldNumbers } = useNumberHeatmap(Number(roundId), 25)

  // Fetch total burned Morbius from dead addresses
  const { burnedAmount, isLoading: isLoadingBurned } = useMorbiusBurned();

  // Fetch full round details (includes brackets and winning numbers) - only if roundId > 0
  const displayRoundId = roundState === 2 ? Number(roundId) : Math.max(Number(roundId) - 1, 0);
  const { data: roundDetailsRaw, isLoading: isLoadingRoundDetails, refetch: refetchRoundDetails } = useRound(displayRoundId > 0 ? displayRoundId : 0);
  const { data: playerTicketsCurrent, isLoading: isLoadingTicketsCurrent, refetch: refetchTicketsCurrent } = usePlayerTickets(Number(roundId), address as `0x${string}` | undefined);
  const { data: playerTicketsFinal, isLoading: isLoadingTicketsFinal, refetch: refetchTicketsFinal } = usePlayerTickets(displayRoundId, address as `0x${string}` | undefined);
  const { data: houseTicketRaw } = useHouseTicket(Number(roundId));

  // Fetch multi-round purchase data to determine round ranges for tickets
  const { purchases: multiRoundPurchases } = useMultiRoundPurchases(address as `0x${string}` | undefined);

  // Extract house ticket numbers
  const houseTicketNumbers = useMemo(() => {
    if (Array.isArray(houseTicketRaw) && houseTicketRaw.length > 0) {
      const ticket = houseTicketRaw[0] as ContractTicket;
      const numbers = ticket.numbers.map(n => Number(n));
      // Filter out any zeros or invalid numbers
      return numbers.filter(n => n > 0 && n <= 55);
    }
    return [];
  }, [houseTicketRaw]);

  // Extract brackets and winning numbers from round details (memoized to prevent infinite loops)
  const roundDetails = (roundDetailsRaw ?? {}) as any;
  const rawBrackets = roundDetails?.brackets || [];
  const brackets = useMemo(() => {
    return Array.isArray(rawBrackets)
      ? [...rawBrackets].map((b: any, index: number) => ({
          ...b,
          matchCount: Number(b?.matchCount ?? index + 1),
        })).sort((a, b) => b.matchCount - a.matchCount)
      : [];
  }, [rawBrackets]);

  const winningNumbersRaw = roundDetails?.winningNumbers || [];
  const winningNumbers = useMemo(() => {
    return Array.isArray(winningNumbersRaw) ? winningNumbersRaw.map((n: any) => Number(n)) : [];
  }, [winningNumbersRaw]);

  const displayIsMegaMillions = roundDetails?.isMegaMillionsRound || false;

  // Simulator numbers are now set only by useWatchRoundFinalized event

  const formatMorbius = (amount: bigint) => {
    return parseFloat(formatUnits(amount, TOKEN_DECIMALS)).toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  };

  const countMatches = (ticket: readonly (number | bigint)[], winning: readonly (number | bigint)[]) => {
    let matches = 0;
    const t = ticket.map(Number).sort((a, b) => a - b);
    const w = winning.map(Number).sort((a, b) => a - b);
    let wi = 0;
    for (let ti = 0; ti < t.length && wi < w.length; ti++) {
      while (wi < w.length && w[wi] < t[ti]) wi++;
      if (wi < w.length && w[wi] === t[ti]) {
        matches++;
        wi++;
      }
    }
    return matches;
  };

  // Winning tickets for finalized round
  const winningTickets = (() => {
    if (!Array.isArray(playerTicketsFinal) || winningNumbers.length !== 6) return [];
    const payoutsByMatches: Record<number, bigint> = {};
    brackets.forEach((b) => {
      const m = Number(b.matchCount || 0);
      const winners = Number(b.winnerCount || 0);
      if (m > 0 && winners > 0) {
        payoutsByMatches[m] = BigInt(b.poolAmount || 0) / BigInt(winners);
      }
    });
    return (playerTicketsFinal as readonly ContractTicket[])
      .map((t) => {
        const matches = countMatches(t.numbers ?? [], winningNumbers);
        const payout = payoutsByMatches[matches] || BigInt(0);
        return { ticketId: t.ticketId ?? BigInt(0), matches, payout, numbers: t.numbers ?? [] };
      })
      .filter((t) => t.matches > 0)
      .sort((a, b) => b.matches - a.matches);
  })();
  const totalWinningMorbius = winningTickets.reduce((acc, t) => acc + t.payout, BigInt(0));

  const yourTicketCount = Array.isArray(playerTicketsCurrent) ? playerTicketsCurrent.length : 0;
  const freeTicketsCount = Array.isArray(playerTicketsCurrent) ? playerTicketsCurrent.filter((t: any) => t.isFreeTicket).length : 0;

  // Map transaction hashes to tickets for the current round (align order of tickets with purchase logs)
  useEffect(() => {
    if (!publicClient || !address || !Array.isArray(playerTicketsCurrent) || Number(roundId) <= 0) {
      setTicketTxMap(new Map());
      return;
    }
    const loadTxs = async () => {
      try {
        const event = parseAbiItem(
          'event TicketsPurchased(address indexed player,uint256 indexed roundId,uint256 ticketCount,uint256 freeTicketsUsed,uint256 MorbiusSpent)'
        );
        const fromBlock = LOTTERY_DEPLOY_BLOCK ? BigInt(LOTTERY_DEPLOY_BLOCK) : BigInt(0);
        const logs = await publicClient.getLogs({
          address: LOTTERY_ADDRESS as `0x${string}`,
          event,
          args: { player: address, roundId },
          fromBlock,
          toBlock: 'latest',
        });
        const sortedLogs = [...logs].sort((a, b) => {
          const blockA = typeof a.blockNumber === 'bigint' ? a.blockNumber : BigInt(a.blockNumber || 0);
          const blockB = typeof b.blockNumber === 'bigint' ? b.blockNumber : BigInt(b.blockNumber || 0);
          if (blockA > blockB) return 1;
          if (blockA < blockB) return -1;
          const logA = typeof a.logIndex === 'bigint' ? a.logIndex : BigInt(a.logIndex || 0);
          const logB = typeof b.logIndex === 'bigint' ? b.logIndex : BigInt(b.logIndex || 0);
          if (logA > logB) return 1;
          if (logA < logB) return -1;
          return 0;
        });
        const sortedTickets = [...(playerTicketsCurrent as any[])].sort((a, b) => {
          const idA = typeof a.ticketId === 'bigint' ? a.ticketId : BigInt(a.ticketId || 0);
          const idB = typeof b.ticketId === 'bigint' ? b.ticketId : BigInt(b.ticketId || 0);
          if (idA > idB) return 1;
          if (idA < idB) return -1;
          return 0;
        });
        const map = new Map<string, string>();
        let ticketCursor = 0;
        for (const log of sortedLogs) {
          const count = Number(log.args?.ticketCount ?? 0);
          for (let i = 0; i < count && ticketCursor < sortedTickets.length; i++) {
            const tid = sortedTickets[ticketCursor]?.ticketId;
            if (tid !== undefined) {
              map.set(tid.toString(), log.transactionHash);
            }
            ticketCursor++;
          }
        }
        setTicketTxMap(map);
      } catch (err) {
        console.error('load lottery ticket tx hashes failed', err);
      }
    };
    loadTxs();
  }, [publicClient, address, playerTicketsCurrent, roundId]);

  const playerTicketsWithTx = useMemo(() => {
    if (!Array.isArray(playerTicketsCurrent)) return [];
    return playerTicketsCurrent.map((t: any) => {
      const txHash = ticketTxMap.get((t?.ticketId ?? '').toString());
      const roundRange = getRoundRangeForTx(txHash, multiRoundPurchases);

      return {
        ...t,
        transactionHash: txHash,
        startRound: roundRange?.startRound,
        endRound: roundRange?.endRound,
      };
    });
  }, [playerTicketsCurrent, ticketTxMap, multiRoundPurchases]);

  const recentRoundHistory = (() => {
    if (!Array.isArray(playerTicketsFinal) || winningNumbers.length !== 6 || displayRoundId <= 0) return [];
    const payoutsByMatches: Record<number, bigint> = {};
    brackets.forEach((b) => {
      const m = Number(b.matchCount || 0);
      const winners = Number(b.winnerCount || 0);
      if (m > 0 && winners > 0) {
        payoutsByMatches[m] = BigInt(b.poolAmount || 0) / BigInt(winners);
      }
    });
    return (playerTicketsFinal as readonly ContractTicket[]).map((t) => {
      const matches = countMatches(t.numbers ?? [], winningNumbers);
      const payout = payoutsByMatches[matches] || BigInt(0);
      return {
        roundId: displayRoundId,
        matches,
        payout,
        winningNumbers: winningNumbers.map((n) => Number(n)),
      };
    }).slice(0, 5);
  })();

  // Watch for round finalized events
  useWatchRoundFinalized((roundId, winningNums, totalMorbius) => {
    refetchRound();
    refetchRoundDetails();
    refetchTicketsCurrent();
    refetchTicketsFinal();
    refetchMegaBank();
    // refetchHexJackpot not exposed by hook
  });

  // Watch for MegaMorbius events
  useWatchMegaMillions((roundId, bankAmount) => {
    toast.success(`🎰 MEGA Morbius! ${formatUnits(bankAmount, TOKEN_DECIMALS)} Morbius added to prizes!`, {
      duration: 5000,
    });
    refetchRound();
    refetchMegaBank();
  });

  const handlePurchaseSuccess = () => {
    setSelectedTickets([]);
    refetchRound();
    refetchTicketsCurrent();
    toast.success('Tickets purchased successfully!');
    triggerSuccessConfetti();
  };

  // Check if contract is deployed
  const isContractDeployed = (LOTTERY_ADDRESS as string).toLowerCase() !== '0x0000000000000000000000000000000000000000'

  if (!isContractDeployed) {
    return (
      <div className="flex flex-col min-h-screen w-full transition-all duration-1000 overflow-y-auto sm:overflow-hidden relative">
        <LotteryMainNav />
        <main className="container mx-auto px-4 py-6 pt-16">
          <Card className="p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">Contract Not Deployed</h2>
            <p className="text-muted-foreground mb-4">
              The lottery contract has not been deployed yet.
            </p>
            <p className="text-sm text-muted-foreground">
              Please update the LOTTERY_ADDRESS in <code className="bg-muted px-2 py-1 rounded">lib/contracts.ts</code> after deployment.
            </p>
          </Card>
        </main>
      </div>
    );
  }

  if (isLoadingRound) {
    return (
      <>
        <div className="flex flex-col min-h-screen w-full transition-all duration-1000 overflow-y-auto sm:overflow-hidden relative">
          <LotteryMainNav />
          <main className="w-full max-w-full px-2 sm:px-4 md:px-6 py-6 pt-16 overflow-x-hidden">
            <Skeleton className="h-[400px] sm:h-[600px] md:h-[800px] w-full" />
          </main>
        </div>

        {/* Footer */}
        <footer className="border-t border-white/10 py-6">
          <div className="container mx-auto px-4 max-w-7xl">
            <div className="flex justify-center">
              <ContractAddress
                address={LOTTERY_ADDRESS}
                label="Lottery Contract"
              />
            </div>
          </div>
        </footer>
      </>
    );
  }

  return (
    <div className="flex flex-col min-h-screen w-full transition-all duration-1000 overflow-y-auto sm:overflow-hidden relative">
      <LotteryMainNav
        onShowHistory={() => setShowRoundHistoryModal(true)}
        onShowDashboard={() => setShowBentoGridModal(true)}
      />

      {/* Main Content */}
      <main className="flex flex-col relative pt-16 px-2 gap-2 lg:px-3 lg:gap-3 min-h-[calc(100vh-4rem)]">

        {/* Round Stats Header */}
        <div className="flex justify-center mb-4 w-full">
          <div className="w-full max-w-3xl">
            <div className="grid grid-cols-4 gap-1 text-center">
              {/* Total Tickets */}
              {totalTickets !== undefined && (
                <div
                  className="rounded-lg p-3"
                  style={{
                    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                    border: '1px inset rgba(60, 60, 60, 0.5)',
                  }}
                >
                  <div className="text-xs sm:text-sm text-white/60 mb-1">Total Tickets</div>
                  <div className="text-lg sm:text-xl font-bold text-white">{Number(totalTickets).toLocaleString()}</div>
                </div>
              )}

              {/* Burned */}
              {burnedAmount !== undefined && (
                <div
                  className="rounded-lg p-3"
                  style={{
                    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                    border: '1px inset rgba(60, 60, 60, 0.5)',
                  }}
                >
                  <div className="text-xs sm:text-sm text-white/60 mb-1">Burned</div>
                  <div className="text-lg sm:text-xl font-bold text-white">
                    {isLoadingBurned ? (
                      <span className="text-white/50">...</span>
                    ) : (() => {
                      const burnedNum = parseFloat(formatEther(burnedAmount));
                      return burnedNum >= 1_000_000
                        ? (burnedNum / 1_000_000).toFixed(1) + 'M'
                        : burnedNum >= 1_000
                        ? (burnedNum / 1_000).toFixed(1) + 'K'
                        : burnedNum.toFixed(0);
                    })()}
                  </div>
                </div>
              )}

              {/* Jackpot */}
              {megaBank !== undefined && (
                <div
                  className="rounded-lg p-3"
                  style={{
                    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                    border: '1px inset rgba(60, 60, 60, 0.5)',
                  }}
                >
                  <div className="text-xs sm:text-sm text-white/60 mb-1">Jackpot</div>
                  <div className="text-lg sm:text-xl font-bold text-white">
                    {(() => {
                      const megaNum = parseFloat(formatEther(megaBank));
                      return megaNum >= 1_000_000
                        ? (megaNum / 1_000_000).toFixed(1) + 'M'
                        : megaNum >= 1_000
                        ? (megaNum / 1_000).toFixed(1) + 'K'
                        : megaNum.toFixed(0);
                    })()}
                  </div>
                </div>
              )}

              {/* Round */}
              {roundId !== undefined && (
                <div
                  className="rounded-lg p-3"
                  style={{
                    background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                    boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                    border: '1px inset rgba(60, 60, 60, 0.5)',
                  }}
                >
                  <div className="text-xs sm:text-sm text-white/60 mb-1">Next Round</div>
                  <div className="text-lg sm:text-xl font-bold text-white">#{Number(roundId)}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Ball Simulator and Buy Modal - Grid Layout on md-lg screens */}
        <div className="w-full mb-24 sm:mb-28 md:mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-w-7xl mx-auto">
            {/* Ball Simulator (Round Timer) */}
            <div className="flex justify-center w-full">
              <div className="w-full max-w-3xl min-h-[400px] sm:min-h-[500px] md:min-h-[610px] relative">
                <div className="relative z-10">
                  <RoundTimer
                    endTime={endTime}
                    fallbackRemaining={timeRemaining}
                    roundId={roundId}
                    totalMORBIUS={totalMorbius}
                    disabled={isDrawing}
                    previousRoundId={displayRoundId}
                    houseTicketNumbers={houseTicketNumbers}
                    winningNumbers={winningNumbers}
                    playerTickets={Array.isArray(playerTicketsWithTx) ? playerTicketsWithTx : []}
                    onBuyTicketsClick={() => {
                      // On mobile, open modal; on desktop, scroll to purchase section
                      if (window.innerWidth < 768) {
                        setShowTicketAccordion(!showTicketAccordion);
                      } else {
                        document.getElementById('ticket-purchase-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                    onShowDashboard={() => setShowBentoGridModal(true)}
                    onDrawStart={() => setIsDrawing(true)}
                    onDrawEnd={() => setIsDrawing(false)}
                  />
                </div>
              </div>
            </div>

            {/* Buy Tickets - Inline on md-lg, Modal on mobile */}
            <div id="ticket-purchase-section" className="hidden md:block w-full">
              <div
                className="rounded-lg p-4 md:p-6 min-h-[610px] overflow-y-auto"
                style={{
                  background: 'linear-gradient(325deg, rgba(20, 20, 20, 0.8), rgba(40, 40, 40, 0.6))',
                  boxShadow: 'inset 0 3px 6px rgba(0, 0, 0, 0.8), inset 0 -3px 6px rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.5)',
                  border: '1px inset rgba(60, 60, 60, 0.5)',
                }}
              >
                <h2 className="text-xl font-bold text-white mb-4">Buy Tickets</h2>
                <TicketPurchaseBuilder
                  initialRounds={roundsToPlay}
                  onSuccess={handlePurchaseSuccess}
                  onError={(err) => toast.error(err.message)}
                  onStateChange={(t, r) => {
                    setSelectedTickets(t);
                    setRoundsToPlay(r);
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Round History Modal */}
        <Dialog open={showRoundHistoryModal} onOpenChange={setShowRoundHistoryModal}>
          <DialogContent className="group/bento shadow-input row-span-1 flex flex-col justify-between space-y-4 rounded-xl border border-neutral-200 bg-white p-4 transition duration-200 hover:shadow-xl dark:border-white/[0.2] dark:bg-gradient-to-br from-slate-950 to-slate-900 dark:shadow-none max-w-6xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="font-sans font-bold text-neutral-600 dark:text-neutral-200 text-xl">
                Round History
              </div>
            </div>
            <div className="flex-1">
              <RoundHistory currentRoundId={Number(roundId || 0)} />
            </div>
          </DialogContent>
        </Dialog>

        {/* Ticket Purchase Modal - Mobile only */}
        <div className="md:hidden">
          <TicketPurchaseAccordion
            isOpen={showTicketAccordion}
            onOpenChange={setShowTicketAccordion}
            initialRounds={roundsToPlay}
            onSuccess={handlePurchaseSuccess}
            onError={(err) => toast.error(err.message)}
            onStateChange={(t, r) => {
              setSelectedTickets(t);
              setRoundsToPlay(r);
            }}
          />
        </div>

        {/* My Tickets Modal */}
        <Dialog open={showTicketsModal} onOpenChange={setShowTicketsModal}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-white/10 backdrop-blur-lg border-purple-500/30">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-white text-center">
                My Tickets
              </DialogTitle>
            </DialogHeader>
            <div className="mt-4">
              <AllTicketsAccordion />
            </div>
          </DialogContent>
        </Dialog>

        {/* Claim Winnings Modal */}
        <MultiClaimModal open={showClaimModal} onOpenChange={setShowClaimModal} />

        {/* Payout Breakdown Modal */}
        <Dialog open={showPayoutBreakdownModal} onOpenChange={setShowPayoutBreakdownModal}>
          <DialogContent className="group/bento shadow-input row-span-1 flex flex-col justify-between space-y-4 rounded-xl border border-neutral-200 bg-white p-4 transition duration-200 hover:shadow-xl dark:border-white/[0.2] dark:bg-gradient-to-br from-slate-950 to-slate-900 dark:shadow-none max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="font-sans font-bold text-neutral-600 dark:text-neutral-200 text-xl">
                Payout Breakdown
              </div>
            </div>
            <div className="flex-1">
              <PreviousRoundsBracketsModal
                brackets={brackets}
                isLoading={isLoadingRoundDetails}
              />
            </div>
          </DialogContent>
        </Dialog>

        {/* Bento Grid Modal */}
        <Dialog open={showBentoGridModal} onOpenChange={setShowBentoGridModal}>
          <DialogContent className="group/bento shadow-input row-span-1 flex flex-col justify-between space-y-4 rounded-xl border border-neutral-200 bg-white p-4 transition duration-200 hover:shadow-xl dark:border-white/[0.2] dark:bg-gradient-to-br from-slate-950 to-slate-900 dark:shadow-none max-w-6xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-3 mb-4">
              <div className="font-sans font-bold text-neutral-600 dark:text-neutral-200 text-xl">
                Lottery Dashboard
              </div>
            </div>
            <div className="flex-1">
              <LotteryBentoGrid
                onPlayNow={() => {
                  setShowBentoGridModal(false);
                  setShowTicketAccordion(!showTicketAccordion);
                }}
                onShowHistory={() => {
                  setShowBentoGridModal(false);
                  setShowRoundHistoryModal(true);
                }}
                onShowTickets={() => {
                  setShowBentoGridModal(false);
                  setShowTicketsModal(true);
                }}
                onShowClaim={() => {
                  setShowBentoGridModal(false);
                  setShowClaimModal(true);
                }}
                onShowPayouts={() => {
                  setShowBentoGridModal(false);
                  setShowPayoutBreakdownModal(true);
                }}
                totalTickets={Number(totalTickets)}
                timeRemaining={Number(timeRemaining)}
                burnedAmount={burnedAmount}
                megaBank={megaBank}
                isLoadingBurned={isLoadingBurned}
              />
            </div>
          </DialogContent>
        </Dialog>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}

