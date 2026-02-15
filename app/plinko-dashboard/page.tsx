"use client";

import { cn } from "@/lib/utils";
import React, { useState, useEffect } from "react";
import { BentoGrid, BentoGridItem } from "../../components/ui/bento-grid";
import {
  IconTicket,
  IconChartBar,
  IconHistory,
  IconCoin,
  IconTrophy,
  IconSettings,
  IconQuestionMark,
  IconShield,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { formatEther } from "viem";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";
import { useMorbiusBurned } from "@/hooks/use-morbius-burned";
import { PixelImage } from "../../components/ui/pixel-image";
import { DottedGlowBackground } from "../../components/ui/dotted-glow-background";
import Footer from '@/components/PLINKO/Footer';
import GlobalMainNav from '@/components/shared/GlobalMainNav';

interface PlinkoBentoGridProps {
  onPlayNow?: () => void;
  onShowHistory?: () => void;
  onShowSimulator?: () => void;
  onShowPaytable?: () => void;
  burnedAmount?: bigint;
  isLoadingBurned?: boolean;
}

export default function PlinkoDashboardPage() {
  const [showHowToPlayModal, setShowHowToPlayModal] = useState(false);

  // Fetch burned Morbius amount
  const { burnedAmount, isLoading: isLoadingBurned } = useMorbiusBurned();

  useEffect(() => {
    const handleShowHowToPlayModal = () => {
      setShowHowToPlayModal(true);
    };

    window.addEventListener('showPlinkoHowToPlayModal', handleShowHowToPlayModal);

    return () => {
      window.removeEventListener('showPlinkoHowToPlayModal', handleShowHowToPlayModal);
    };
  }, []);

  return (
    <GlobalMainNav page="plinko" showBackArrow backArrowHref="/PLINKO" backArrowLabel="Back to Plinko">
      <div className="min-h-screen bg-slate-950/70 text-white relative pt-4 md:pt-2">
        {/* Background Image with Overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: "url('/morbius/Morbiusbg.png')",
          }}
        />
        <div className="absolute inset-0 bg-slate-950/70" />

        {/* Content */}
        <div className="relative z-10">
          <div className="container mx-auto px-4 py-8">
            <div className="text-center mb-8">
              <h1 className="text-4xl md:text-5xl font-black text-white mb-2 tracking-wider">PLINKO DASHBOARD</h1>
              <p className="text-white/80">Drop balls, hit pegs, win crypto rewards</p>
            </div>

            <PlinkoBentoGrid
              onPlayNow={() => window.location.href = '/PLINKO'}
              onShowHistory={() => window.location.href = '/plinko-stats'}
              onShowSimulator={() => window.location.href = '/plinko-simulator'}
              onShowPaytable={() => window.location.href = '/PLINKO'}
              onShowVerifier={() => window.location.href = '/plinko-verifier'}
              burnedAmount={burnedAmount}
              isLoadingBurned={isLoadingBurned}
            />

            <HowToPlayModal
              isOpen={showHowToPlayModal}
              onOpenChange={setShowHowToPlayModal}
            />
          </div>
        </div>

        {/* Footer */}
        <Footer />
      </div>
    </GlobalMainNav>
  );
}

function PlinkoBentoGrid({
  onPlayNow,
  onShowHistory,
  onShowSimulator,
  onShowPaytable,
  burnedAmount,
  isLoadingBurned
}: PlinkoBentoGridProps) {
  return (
    <>
      <BentoGrid className="max-w-4xl mx-auto md:auto-rows-[20rem]">
        {items.map((item, i) => (
          <BentoGridItem
            key={i}
            title={item.title}
            description={item.description}
            header={typeof item.header === 'function'
              ? item.header({
                  burnedAmount,
                  isLoadingBurned
                })
              : item.header
            }
            className={cn("[&>p:text-lg]", item.className)}
            icon={item.icon}
            onClick={item.onClick ? () => item.onClick({
              onPlayNow,
              onShowHistory,
              onShowSimulator,
              onShowPaytable,
            }) : undefined}
          />
        ))}
      </BentoGrid>
    </>
  );
}

function HowToPlayModal({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950/70 border-white/20 text-white max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold text-white mb-4">
            How to Play PLINKO
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-6 text-sm leading-relaxed">
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-3">Getting Started</h3>
              <div className="space-y-3 text-white">
                <p>
                  Connect your Web3 wallet (MetaMask, WalletConnect, etc.) to start playing PLINKO on the PulseChain network.
                </p>
                <p>
                  Choose your risk level: Green (Low), Yellow (Medium), or Red (High). Higher risk means bigger potential multipliers.
                </p>
                <p>
                  Select your wager amount in MORBIUS tokens. Watch the ball drop through the pegs and land in a multiplier bucket!
                </p>
              </div>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-3">Game Mechanics</h3>
              <div className="space-y-3 text-white">
                <p>
                  Each ball drop is simulated using realistic physics with the Matter.js engine, providing fair and transparent results.
                </p>
                <p>
                  The ball falls from the top, bouncing off pegs randomly until it lands in one of 17 buckets at the bottom.
                </p>
                <p>
                  Each bucket has a multiplier that determines your payout. Your winnings = Wager × Multiplier.
                </p>
              </div>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-3">Risk Levels & Multipliers</h3>
              <div className="space-y-3 text-white">
                <p>
                  <strong className="text-green-400">Green (Low Risk):</strong> Multipliers from 0.5x to 7x. Safer bets with consistent returns.
                </p>
                <p>
                  <strong className="text-yellow-400">Yellow (Medium Risk):</strong> Multipliers from 0.2x to 15x. Balanced risk and reward.
                </p>
                <p>
                  <strong className="text-red-400">Red (High Risk):</strong> Multipliers from 0.2x to 35x. High variance with huge potential wins!
                </p>
              </div>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-3">Prize Distribution</h3>
              <div className="space-y-3 text-white">
                <p>
                  <strong>Player Payout:</strong> Instant payout based on multiplier × wager amount.
                </p>
                <p>
                  <strong>House Fee:</strong> Small percentage for platform maintenance.
                </p>
                <p>
                  <strong>Burn:</strong> Portion of fees burned, reducing MORBIUS supply.
                </p>
                <p>
                  All payouts are instant and automatic - no claiming required!
                </p>
              </div>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-3">Fair Play & Transparency</h3>
              <div className="space-y-3 text-white">
                <p>
                  Every drop uses a unique seed for deterministic physics simulation.
                </p>
                <p>
                  All transactions are recorded on PulseChain blockchain for complete transparency.
                </p>
                <p>
                  Physics parameters are public and verifiable in the smart contract.
                </p>
              </div>
            </div>

            <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-2">💡 Pro Tips</h3>
              <ul className="space-y-2 text-white text-sm">
                <li>• Start with Green risk to learn the game mechanics</li>
                <li>• Edge buckets have higher multipliers but lower probability</li>
                <li>• Center buckets hit more frequently with lower multipliers</li>
                <li>• View the simulator page to see physics in action</li>
                <li>• Check stats page to see historical distribution data</li>
              </ul>
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-center mt-6">
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-8"
          >
            Got it! Let's Play
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SkeletonPlayPlinko = () => {
  const ballVariants = {
    initial: {
      y: 0,
    },
    animate: {
      y: [0, -30, 0],
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
  };

  return (
    <motion.div
      initial="initial"
      animate="animate"
      className="relative w-full h-full min-h-[6rem] overflow-hidden rounded-lg bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-600"
    >
      <div className="absolute inset-0 bg-slate-950/40" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full p-4">
        <div className="text-center mb-6">
          <div className="text-5xl font-black text-white drop-shadow-[0_0_20px_rgba(0,247,255,0.8)] tracking-widest mb-2" style={{ fontFamily: 'Impact, "Arial Black", sans-serif' }}>
            PLINKO
          </div>
          <div className="text-sm text-white/80">Drop & Win!</div>
        </div>

        {/* Animated Ball */}
        <motion.div
          variants={ballVariants}
          className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-300 to-orange-500 shadow-lg shadow-yellow-500/50"
        />

        {/* Pegs */}
        <div className="flex gap-4 mt-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="w-3 h-3 rounded-full bg-white/90 shadow-sm"
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
};

const SkeletonSimulator = () => {
  return (
    <div className="relative w-full h-full min-h-[6rem] overflow-hidden rounded-lg bg-gradient-to-br from-purple-600 via-pink-500 to-red-500">
      <div className="absolute inset-0 bg-slate-950/40" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full p-4">
        <div className="text-center">
          <IconSettings className="w-16 h-16 text-white mb-4 animate-spin" style={{ animationDuration: '3s' }} />
          <div className="text-2xl font-bold text-white mb-2">Physics Simulator</div>
          <div className="text-sm text-white/80">Test & Tune</div>
        </div>
      </div>
    </div>
  );
};

const SkeletonStats = () => {
  return (
    <div className="relative w-full h-full min-h-[6rem] overflow-hidden">
      <DottedGlowBackground
        className="absolute inset-0"
        gap={18}
        radius={3}
        color="rgb(34, 211, 238)"
        glowColor="rgb(6, 182, 212)"
        opacity={1}
        speedMin={0.1}
        speedMax={0.9}
        speedScale={0.5}
      />
    </div>
  );
};

const SkeletonVerifier = () => {
  return (
    <div className="relative w-full h-full min-h-[6rem] overflow-hidden">
      <DottedGlowBackground
        className="absolute inset-0"
        gap={20}
        radius={3}
        color="rgb(34, 197, 94)"
        glowColor="rgb(22, 163, 74)"
        opacity={1}
        speedMin={0.2}
        speedMax={1.0}
        speedScale={0.6}
      />
    </div>
  );
};

const SkeletonHowToPlay = () => {
  const variants = {
    initial: {
      scale: 1,
      rotate: 0,
    },
    hover: {
      scale: 1.05,
      rotate: 2,
      transition: {
        duration: 0.3,
      },
    },
  };

  return (
    <motion.div
      initial="initial"
      whileHover="hover"
      variants={variants}
      className="relative w-full h-full min-h-[6rem] overflow-hidden rounded-lg bg-gradient-to-br from-cyan-600 via-blue-600 to-purple-700"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.3),transparent_70%)]" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full p-4">
        <div className="text-center">
          <div className="text-4xl font-black text-white mb-2 drop-shadow-lg">
            How to Play
          </div>
          <div className="text-sm text-white/80">Learn the basics</div>
        </div>
      </div>
    </motion.div>
  );
};

const SkeletonMorbius = () => {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <PixelImage src="/morbius/MorbiusLogo (3).png" className="w-24 h-24 md:w-32 md:h-32" />
    </div>
  );
};

const BurnedTokens = ({ burnedAmount, isLoadingBurned }: { burnedAmount?: bigint; isLoadingBurned?: boolean }) => {
  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-orange-500 to-red-600 w-full h-full min-h-[6rem]">
      <div className="absolute inset-0 bg-slate-950/70" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full p-4">
        <div className="text-center">
          <div className="text-3xl font-bold text-white mb-2">
            {isLoadingBurned ? "..." : (() => {
              const burnedNum = burnedAmount ? parseFloat(formatEther(burnedAmount)) : 0;
              return burnedNum >= 1_000_000
                ? (burnedNum / 1_000_000).toFixed(1) + 'M'
                : burnedNum >= 1_000
                ? (burnedNum / 1_000).toFixed(1) + 'K'
                : burnedNum.toFixed(0);
            })()}
          </div>
          <div className="text-sm text-white/90">
            Burned MORBIUS
          </div>
        </div>
      </div>
    </div>
  );
};

const items = [
  {
    title: "Play PLINKO",
    description: (
      <span className="text-sm">
        Drop balls and win crypto - play the classic physics game now
      </span>
    ),
    header: <SkeletonPlayPlinko />,
    className: "md:col-span-2",
    icon: <IconTicket className="h-4 w-4 text-neutral-500" />,
    onClick: ({ onPlayNow }: any) => onPlayNow?.(),
  },
  {
    title: "How to Play",
    description: (
      <span className="text-sm">
        Learn the rules, risk levels, and multipliers
      </span>
    ),
    header: <SkeletonHowToPlay />,
    className: "md:col-span-1",
    icon: <IconQuestionMark className="h-4 w-4 text-neutral-500" />,
    onClick: () => {
      const event = new CustomEvent('showPlinkoHowToPlayModal');
      window.dispatchEvent(event);
    },
  },
  {
    title: "Fairness Verifier",
    description: (
      <span className="text-sm">
        Verify your game results and learn about provably fair gaming
      </span>
    ),
    header: <SkeletonVerifier />,
    className: "md:col-span-1",
    icon: <IconShield className="h-4 w-4 text-neutral-500" />,
    onClick: () => window.location.href = '/plinko-verifier',
  },
  {
    title: "MORBIUS Token",
    description: (
      <span className="text-sm">
        View MORBIUS token info and burned supply
      </span>
    ),
    header: <SkeletonMorbius />,
    className: "md:col-span-1",
    icon: <IconCoin className="h-4 w-4 text-neutral-500" />,
    onClick: () => {
      window.open('https://dexscreener.com/pulsechain/0x81acd0aa872675678a25fbb154992a2bad4f6cef', '_blank')
    },
  },
  {
    title: "Burned MORBIUS",
    description: (
      <span className="text-sm">
        Total tokens burned from all PLINKO plays
      </span>
    ),
    header: ({ burnedAmount, isLoadingBurned }: any) => (
      <BurnedTokens
        burnedAmount={burnedAmount}
        isLoadingBurned={isLoadingBurned}
      />
    ),
    className: "md:col-span-1",
    icon: <IconTrophy className="h-4 w-4 text-neutral-500" />,
  },
];
