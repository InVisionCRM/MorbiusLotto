"use client";

import { cn } from "@/lib/utils";
import React, { useState, useEffect } from "react";
import { BentoGrid, BentoGridItem } from "../../components/ui/bento-grid";
import {
  IconTicket,
  IconChartBar,
  IconHistory,
  IconTrophy,
  IconClock,
  IconQuestionMark,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { formatEther } from "viem";
import { GlowingStarsBackgroundCard } from "../../components/ui/glowing-stars";
import { Meteors } from "../../components/ui/meteors";
import Footer from '@/components/PLINKO/Footer';
import { PixelImage } from "../../components/ui/pixel-image";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { ScrollArea } from "../../components/ui/scroll-area";
import { useMorbiusBurned } from "@/hooks/use-morbius-burned";
import { MorbiusLoadingChip } from "@/components/shared/MorbiusLoadingChip";

interface KenoBentoGridProps {
  onPlayNow?: () => void;
  onShowPaytable?: () => void;
  totalTickets?: number;
  timeRemaining?: number;
  progressiveJackpot?: bigint;
  isLoadingProgressive?: boolean;
}

export default function KenoDashboardPage() {
  const [showHowToPlayModal, setShowHowToPlayModal] = useState(false);

  // Fetch burned Morbius amount
  const { burnedAmount, isLoading: isLoadingBurned } = useMorbiusBurned();

  useEffect(() => {
    const handleShowHowToPlayModal = () => {
      setShowHowToPlayModal(true);
    };

    window.addEventListener('showHowToPlayModal', handleShowHowToPlayModal);

    return () => {
      window.removeEventListener('showHowToPlayModal', handleShowHowToPlayModal);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950/70 text-white relative">
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
            <h1 className="text-4xl font-bold text-white mb-2">KENO DASHBOARD</h1>
            <p className="text-white">Monitor your Crypto KENO activity and statistics</p>
          </div>

        <KenoBentoGrid
          onPlayNow={() => window.location.href = '/keno'}
          onShowPaytable={() => window.location.href = '/keno'}
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
  );
}

function KenoBentoGrid({
  onPlayNow,
  onShowPaytable,
  totalTickets = 0,
  timeRemaining = 0,
  progressiveJackpot,
  isLoadingProgressive = false,
  burnedAmount,
  isLoadingBurned
}: KenoBentoGridProps & { burnedAmount?: bigint; isLoadingBurned?: boolean }) {
  return (
    <>
      <BentoGrid className="max-w-3xl mx-auto md:auto-rows-[20rem] gap-4">
        {items.map((item, i) => (
          <BentoGridItem
            key={i}
            title={item.title}
            description={item.description}
            header={typeof item.header === 'function'
              ? item.header({
                  progressiveJackpot,
                  isLoadingProgressive,
                  burnedAmount,
                  isLoadingBurned
                })
              : item.header
            }
            className={cn("[&>p:text-lg]", item.className)}
            icon={item.icon}
            onClick={item.onClick ? () => item.onClick({
              onPlayNow,
              onShowPaytable,
              totalTickets,
              timeRemaining,
              progressiveJackpot,
              isLoadingProgressive
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
            How to Play Crypto KENO
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-6 text-sm leading-relaxed">
            <div className="bg-white/20/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-3">Getting Started</h3>
              <div className="space-y-3 text-white">
                <p>
                  Connect your Web3 wallet (MetaMask, WalletConnect, etc.) to start playing Crypto KENO instantly on the PulseChain network.
                </p>
                <p>
                  Select how many numbers (spots) that you want to play per draw. You can select to play 1, 2, 3, 4, 5, 6, 7, 8, 9, or 10 spots. The prize table that applies to your game is dependent on the number of spots you select (see the Paytable above).
                </p>
                <p>
                  Choose the amount you want to wager per draw in MORBIUS tokens. You can wager from 1 to 1000 MORBIUS per draw.
                </p>
              </div>
            </div>

            <div className="bg-white/20/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-3">Selecting Numbers</h3>
              <div className="space-y-3 text-white">
                <p>
                  Select your numbers from 1-80 or use Quick Pick to have your numbers randomly selected by the smart contract. The amount of numbers selected must match the number of spots you selected to play.
                </p>
                <p>
                  You can play up to 60 consecutive draws with the same numbers and wager amount.
                </p>
              </div>
            </div>

            <div className="bg-white/20/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-3">Game Mechanics</h3>
              <div className="space-y-3 text-white">
                <p>
                  After you purchase your ticket, watch the live KENO draw on PulseChain. The smart contract will randomly draw 20 winning numbers from 1-80.
                </p>
                <p>
                  Match your selected numbers to the winning numbers drawn to win prizes according to the paytable for your spot size.
                </p>
                <p>
                  All prizes are automatically calculated and can be claimed instantly through the smart contract once the draw is finalized.
                </p>
              </div>
            </div>

            <div className="bg-white/20/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-3">Your Ticket</h3>
              <div className="space-y-3 text-white">
                <p>
                  Your ticket is recorded on the blockchain and contains all of your selections including numbers, wager amount, draw count, and any add-ons you selected.
                </p>
                <p>
                  You can view your tickets and history on the Play page and in Transaction History.
                </p>
                <p>
                  Winning tickets can be claimed automatically once the draw results are available.
                </p>
              </div>
            </div>

            <div className="bg-white/20/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-3">Prize Distribution</h3>
              <div className="space-y-3 text-white">
                <p>
                  <strong>House Fee:</strong> 5% of all purchases goes to the house wallet for platform maintenance and development.
                </p>
                <p>
                  <strong>Burn:</strong> 10% of all purchases are burned, reducing total MORBIUS supply.
                </p>
                <p>
                  <strong>Deployer:</strong> 5% goes to the deployer wallet.
                </p>
                <p>
                  <strong>MegaMorbius Bank:</strong> 10% goes to the MegaMorbius Bank for ecosystem development.
                </p>
                <p>
                  <strong>Player Pool:</strong> 70% goes to the player prize pool for winnings.
                </p>
              </div>
            </div>

            <div className="bg-white/20/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-3">Rollover Mechanics</h3>
              <div className="space-y-3 text-white">
                <p>
                  100% of remaining bracket funds roll over to the next round, creating increasingly larger prize pools over time.
                </p>
                <p>
                  This means unclaimed prizes from previous rounds increase the total prize pool for future players.
                </p>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-2">💡 Pro Tips</h3>
              <ul className="space-y-2 text-white text-sm">
                <li>• Higher spot sizes (9-10) offer bigger prizes but require more matches</li>
                <li>• Multiple draws save gas and increase your chances of winning</li>
                <li>• Check the live timer to see when the next draw begins</li>
                <li>• All transactions are recorded on PulseChain for complete transparency</li>
                <li>• Winnings are paid instantly once draws are finalized</li>
              </ul>
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-center mt-6">
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-lime-600 hover:bg-lime-700 text-white px-8"
          >
            Got it! Let's Play
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const SkeletonPlayNow = () => {
  const variants = {
    initial: {
      x: 0,
    },
    animate: {
      x: 10,
      rotate: 5,
      transition: {
        duration: 0.2,
      },
    },
  };

  const variantsSecond = {
    initial: {
      x: 0,
    },
    animate: {
      x: -10,
      rotate: -5,
      transition: {
        duration: 0.2,
      },
    },
  };

  return (
    <motion.div
      initial="initial"
      whileHover="animate"
      className="flex flex-1 w-full h-full min-h-[6rem] dark:bg-dot-white/[0.2] bg-dot-black/[0.2] flex-col space-y-2"
    >
      <motion.div
        variants={variants}
        className="flex flex-row rounded-full border border-neutral-100 dark:border-white/[0.2] p-2 items-center space-x-2 bg-white/20 dark:bg-slate-950/70"
      >
        <div className="h-6 w-6 rounded-full bg-gradient-to-r from-lime-700 to-lime-500 shrink-0" />
        <div className="w-full bg-gray-100 h-4 rounded-full dark:bg-green-900" />
      </motion.div>
      <motion.div
        variants={variantsSecond}
        className="flex flex-row rounded-full border border-neutral-100 dark:border-white/[0.2] p-2 items-center space-x-2 w-3/4 ml-auto bg-white/20 dark:bg-slate-950/70"
      >
        <div className="w-full bg-gray-100 h-4 rounded-full dark:bg-green-900" />
        <div className="h-6 w-6 rounded-full bg-gradient-to-r from-lime-700 to-lime-500 shrink-0" />
      </motion.div>
      <motion.div
        variants={variants}
        className="flex flex-row rounded-full border border-neutral-100 dark:border-white/[0.2] p-2 items-center space-x-2 bg-white/20 dark:bg-slate-950/70"
      >
        <div className="h-6 w-6 rounded-full bg-gradient-to-r from-lime-700 to-lime-500 shrink-0" />
        <div className="w-full bg-gray-100 h-4 rounded-full dark:bg-green-900" />
      </motion.div>
    </motion.div>
  );
};

const SkeletonTimer = () => {
  const variants = {
    initial: {
      width: 0,
    },
    animate: {
      width: "100%",
      transition: {
        duration: 0.2,
      },
    },
    hover: {
      width: ["0%", "100%"],
      transition: {
        duration: 2,
      },
    },
  };

  const arr = new Array(6).fill(0);

  return (
    <motion.div
      initial="initial"
      animate="animate"
      whileHover="hover"
      className="flex flex-1 w-full h-full min-h-[6rem] dark:bg-dot-white/[0.2] bg-dot-black/[0.2] flex-col space-y-2"
    >
      {arr.map((_, i) => (
        <motion.div
          key={"skeleton-timer" + i}
          variants={variants}
          style={{
            maxWidth: Math.random() * (100 - 40) + 40 + "%",
          }}
          className="flex flex-row rounded-full border border-neutral-100 dark:border-white/[0.2] p-2 items-center space-x-2 bg-green-100 dark:bg-slate-950/70 w-full h-4"
        ></motion.div>
      ))}
    </motion.div>
  );
};

const MORBIUSStats = () => {
  const [tokenData, setTokenData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchMORBIUSData = async () => {
      try {
        // Fetch MORBIUS token data from Dexscreener
        const response = await fetch('https://api.dexscreener.com/latest/dex/tokens/0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1')
        const data = await response.json()

        if (data.pairs && data.pairs.length > 0) {
          // Get the pair with highest liquidity (usually the main pair)
          const mainPair = data.pairs.sort((a: any, b: any) => parseFloat(b.liquidity?.usd || '0') - parseFloat(a.liquidity?.usd || '0'))[0]
          setTokenData(mainPair)
        }
      } catch (error) {
        console.error('Failed to fetch MORBIUS data:', error)
        // Set fallback data for demo
        setTokenData({
          priceUsd: '0.000123',
          marketCap: '1234567',
          volume: { h24: '987654' },
          info: {
            socials: [
              { type: 'twitter', url: 'https://twitter.com/MORBIUS' },
              { type: 'telegram', url: 'https://t.me/MORBIUS' },
              { type: 'website', url: 'https://MORBIUS.finance' }
            ]
          }
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchMORBIUSData()

    // Refresh every 30 seconds
    const interval = setInterval(fetchMORBIUSData, 30000)
    return () => clearInterval(interval)
  }, [])

  const formatPrice = (price: string) => {
    const num = parseFloat(price)
    if (num < 0.000001) return `$${num.toExponential(2)}`
    if (num < 0.0001) return `$${num.toFixed(7)}`
    if (num < 0.01) return `$${num.toFixed(6)}`
    return `$${num.toFixed(4)}`
  }

  const formatMarketCap = (marketCap: string) => {
    const num = parseFloat(marketCap)
    if (num >= 1000000000) return `$${(num / 1000000000).toFixed(2)}B`
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`
    if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`
    return `$${num.toFixed(0)}`
  }

  const formatVolume = (volume: string) => {
    const num = parseFloat(volume)
    if (num >= 1000000000) return `${(num / 1000000000).toFixed(2)}B`
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`
    return num.toFixed(0)
  }

  if (isLoading) {
    return (
      <div className="relative flex flex-1 w-full h-full min-h-[10rem] rounded-lg overflow-hidden bg-gradient-to-b from-lime-500 to-lime-600">
        <div className="absolute inset-0 bg-slate-950/70" />
        <div className="relative z-10 flex items-center justify-center w-full h-full">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <div className="text-white/70 text-sm font-mono">Loading MORBIUS...</div>
          </div>
        </div>
        <MorbiusLoadingChip />
      </div>
    )
  }

  return (
    <div className="relative flex flex-1 w-full h-full min-h-[10rem] rounded-lg overflow-hidden">
      {/* Background Image with Blur */}
      <div
        className="absolute inset-0 bg-cover bg-center blur-sm scale-110 opacity-30"
        style={{
          backgroundImage: "url('/MORBIUS/MORBIUS-logo-2.svg')",
        }}
      />

      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-lime-700/20 to-lime-600/40" />

      {/* Content */}
      <div className="relative z-10 flex flex-col w-full h-full p-4 text-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-lime-300 rounded-full animate-pulse" />
            <span className="text-xs font-mono text-white/80 uppercase tracking-wider">Live</span>
          </div>
          <span className="text-xs font-mono text-white">MORBIUS PRICE</span>
        </div>

        {/* Price - Large and Prominent */}
        <div className="flex-1 flex flex-col justify-center">
          <div className="text-center mb-4">
            <div className="text-3xl font-bold font-mono mb-1 text-white drop-shadow-lg">
              {tokenData?.priceUsd ? formatPrice(tokenData.priceUsd) : '$0.00'}
            </div>
            <div className="text-sm text-white/70 font-mono">
              Market Cap: {tokenData?.marketCap ? formatMarketCap(tokenData.marketCap) : '$0'}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-slate-800/30 backdrop-blur-sm rounded-lg p-3 text-center">
              <div className="text-xs text-white/70 font-mono uppercase tracking-wider mb-1">24h Volume</div>
              <div className="text-lg font-bold font-mono text-white">
                ${tokenData?.volume?.h24 ? formatVolume(tokenData.volume.h24) : '0'}
              </div>
            </div>
            <div className="bg-slate-800/30 backdrop-blur-sm rounded-lg p-3 text-center">
              <div className="text-xs text-white/70 font-mono uppercase tracking-wider mb-1">Liquidity</div>
              <div className="text-lg font-bold font-mono text-white">
                ${tokenData?.liquidity?.usd ? formatVolume(tokenData.liquidity.usd) : '0'}
              </div>
            </div>
          </div>
        </div>

        {/* Social Links */}
        <div className="flex justify-center gap-3 pt-2 border-t border-white/20">
          {tokenData?.info?.socials?.slice(0, 4).map((social: any, index: number) => (
            <a
              key={index}
              href={social.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-12 h-12 bg-white/20/10 hover:bg-white/20/20 backdrop-blur-sm rounded-full transition-all duration-200 hover:scale-110"
              title={social.type}
            >
              <span className="text-lg">
                {social.type === 'twitter' && '𝕏'}
                {social.type === 'telegram' && '✈️'}
                {social.type === 'discord' && '💬'}
                {social.type === 'website' && '🌐'}
                {!['twitter', 'telegram', 'discord', 'website'].includes(social.type) && '🔗'}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

const SkeletonPerformance = () => {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <PixelImage src="/morbius/MorbiusLogo (3).png" className="w-24 h-24 md:w-32 md:h-32" />
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

  const howVariants = {
    initial: {
      y: 0,
      x: 0,
      rotate: 0,
    },
    hover: {
      y: -12,
      x: 8,
      rotate: -5,
      transition: {
        duration: 0.4,
      },
    },
  };

  const toVariants = {
    initial: {
      y: 0,
      x: 0,
      rotate: 0,
    },
    hover: {
      y: -6,
      x: -10,
      rotate: 8,
      transition: {
        duration: 0.35,
        delay: 0.05,
      },
    },
  };

  const playVariants = {
    initial: {
      y: 0,
      x: 0,
      rotate: 0,
    },
    hover: {
      y: -15,
      x: 6,
      rotate: -3,
      transition: {
        duration: 0.45,
        delay: 0.1,
      },
    },
  };

  return (
    <motion.div
      initial="initial"
      whileHover="hover"
      variants={variants}
      className="relative w-full h-full min-h-[6rem] overflow-hidden rounded-lg bg-gradient-to-br from-cyan-200/20 to-green-600/30"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgb(165, 34, 197),transparent_70%)]" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full p-4">
        <div className="text-center">
          <motion.div
            variants={howVariants}
            className="text-4xl font-black text-white mb-1 drop-shadow-lg"
          >
            How
          </motion.div>
          <motion.div
            variants={toVariants}
            className="text-3xl font-bold text-white mb-1 drop-shadow-lg"
          >
            To
          </motion.div>
          <motion.div
            variants={playVariants}
            className="text-2xl font-extrabold text-white drop-shadow-lg"
          >
            Play
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

const SkeletonPlinko = () => {
  const ballVariants = {
    initial: {
      y: 0,
    },
    animate: {
      y: [0, -20, 0],
      transition: {
        duration: 2,
        repeat: Infinity as number,
        ease: [0.42, 0, 0.58, 1] as any, // easeInOut cubic bezier
      },
    },
  };

  const pegVariants = {
    initial: {
      scale: 1,
    },
    hover: {
      scale: 1.1,
      transition: {
        duration: 0.2,
      },
    },
  };

  return (
    <motion.div
      initial="initial"
      whileHover="hover"
      className="relative w-full h-full min-h-[6rem] overflow-hidden rounded-lg bg-gradient-to-br from-cyan-500 via-blue-500 to-purple-600"
    >
      <div className="absolute inset-0 bg-slate-950/40" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full p-4">
        <div className="text-center mb-4">
          <div className="text-5xl font-black text-white drop-shadow-[0_0_15px_rgba(0,247,255,0.7)] tracking-widest" style={{ fontFamily: 'Impact, "Arial Black", sans-serif' }}>
            PLINKO
          </div>
        </div>

        {/* Animated Ball */}
        <motion.div
          variants={ballVariants}
          animate="animate"
          className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 shadow-lg shadow-yellow-500/50"
        />

        {/* Pegs */}
        <div className="flex gap-3 mt-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              variants={pegVariants}
              className="w-2 h-2 rounded-full bg-white/20/80"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
};

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const formatNumber = (num: number) => {
  return num.toLocaleString();
};

const formatAmount = (amount: bigint, isLoading = false) => {
  if (isLoading) return "...";
  const num = parseFloat(formatEther(amount));
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toFixed(0);
};

const BurnedAndJackpot = ({ burnedAmount, isLoadingBurned }: { burnedAmount?: bigint; isLoadingBurned?: boolean }) => {
  return (
    <div className="relative w-full h-full min-h-[6rem] grid grid-cols-2 gap-[-1px] p-0">
      {/* Burned Tokens Half */}
      <div className="relative overflow-hidden bg-gradient-to-b from-orange-500 to-amber-500">
        <div className="absolute inset-0 bg-slate-950/70" />
        <div className="relative z-10 flex flex-col items-center justify-center h-full p-3">
          <div className="text-center">
            <div className="text-lg font-bold text-white mb-1">
              {isLoadingBurned ? "..." : (() => {
                const burnedNum = burnedAmount ? parseFloat(formatEther(burnedAmount)) : 0;
                return burnedNum >= 1_000_000
                  ? (burnedNum / 1_000_000).toFixed(1) + 'M'
                  : burnedNum >= 1_000
                  ? (burnedNum / 1_000).toFixed(1) + 'K'
                  : burnedNum.toFixed(0);
              })()}
            </div>
            <div className="text-xs text-white">
              Burned MORBIUS
            </div>
          </div>
        </div>
      </div>

      {/* JackPot Half - Placeholder */}
      <div className="relative overflow-hidden bg-gradient-to-l from-slate-850 via-slate-950 to-slate-950">
        <div className="relative z-10 flex flex-col items-center justify-center h-full p-3">
          <div className="text-center">
            <div className="text-lg font-bold text-white mb-1">
              Coming Soon
            </div>
            <div className="text-xs text-white">
              JackPot
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const items = [
  {
    title: "Play Keno",
    description: (
      <span className="text-sm">
        Start playing instantly - buy Keno tickets and join the next draw
      </span>
    ),
    header: <SkeletonPerformance />,
    className: "md:col-span-1",
    icon: <IconTicket className="h-4 w-4 text-neutral-500" />,
    onClick: ({ onPlayNow }: any) => onPlayNow?.(),
  },
  {
    title: "PLINKO Game",
    description: (
      <span className="text-sm">
        Drop balls and win big! Classic PLINKO physics game with crypto rewards
      </span>
    ),
    header: <SkeletonPlinko />,
    className: "md:col-span-1",
    icon: <IconTicket className="h-4 w-4 text-neutral-500" />,
    onClick: () => {
      window.location.href = '/PLINKO';
    },
  },
  {
    title: "How to Play",
    description: (
      <span className="text-sm">
        Learn the rules and mechanics of Crypto KENO - step by step guide
      </span>
    ),
    header: <SkeletonHowToPlay />,
    className: "md:col-span-1",
    icon: <IconQuestionMark className="h-4 w-4 text-neutral-500" />,
    onClick: () => {
      // Show how to play modal
      const event = new CustomEvent('showHowToPlayModal');
      window.dispatchEvent(event);
    },
  },
  {
    title: "Paytable",
    description: (
      <span className="text-sm">
        1–10 spots: match 0 to all for multipliers. Standard & Bullseye paytables on Play page.
      </span>
    ),
    header: <SkeletonTimer />,
    className: "md:col-span-1",
    icon: <IconChartBar className="h-4 w-4 text-neutral-500" />,
    onClick: ({ onShowPaytable }: any) => onShowPaytable?.(),
  },
  {
    title: "MORBIUS",
    description: (
      <span className="text-sm">
        Real-time MORBIUS token price, market cap & social links
      </span>
    ),
    header: <MORBIUSStats />,
    className: "md:col-span-1",
    onClick: () => {
      window.open('https://MORBIUS.io/geicko?address=0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1', '_blank')
    },
  },
  {
    title: "Burned & JackPot",
    description: (
      <span className="text-sm">
        Tokens burned from purchases and future jackpot system
      </span>
    ),
    header: ({ burnedAmount, isLoadingBurned }: any) => (
      <BurnedAndJackpot
        burnedAmount={burnedAmount}
        isLoadingBurned={isLoadingBurned}
      />
    ),
    className: "md:col-span-2",
    icon: <IconTrophy className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "Transaction History",
    description: (
      <span className="text-sm">
        View your Keno tickets, draws, and payouts
      </span>
    ),
    header: <SkeletonPlayNow />,
    className: "md:col-span-1",
    icon: <IconHistory className="h-4 w-4 text-neutral-500" />,
    onClick: () => {
      window.location.href = '/keno-transaction-history'
    },
  },
];