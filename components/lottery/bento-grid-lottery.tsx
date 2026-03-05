"use client";

import { cn } from "@/lib/utils";
import React, { useState, useEffect } from "react";
import { BentoGrid, BentoGridItem } from "../ui/bento-grid";
import {
  IconTicket,
  IconHistory,
  IconTrophy,
  IconClock,
  IconQuestionMark,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { formatEther } from "viem";
import { GlowingStarsBackgroundCard } from "../ui/glowing-stars";
import { Meteors } from "../ui/meteors";
import { PixelImage } from "../ui/pixel-image";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";

interface LotteryBentoGridProps {
  onPlayNow?: () => void;
  onShowPayouts?: () => void;
  totalTickets?: number;
  timeRemaining?: number;
  burnedAmount?: bigint;
  megaBank?: bigint;
  isLoadingBurned?: boolean;
}

export function LotteryBentoGrid({
  onPlayNow,
  onShowPayouts,
  totalTickets = 0,
  timeRemaining = 0,
  burnedAmount,
  megaBank,
  isLoadingBurned = false
}: LotteryBentoGridProps) {
  const [showHowToPlayModal, setShowHowToPlayModal] = useState(false);

  useEffect(() => {
    const handleShowHowToPlayModal = () => {
      setShowHowToPlayModal(true);
    };

    window.addEventListener('showLotteryHowToPlayModal', handleShowHowToPlayModal);

    return () => {
      window.removeEventListener('showLotteryHowToPlayModal', handleShowHowToPlayModal);
    };
  }, []);

  return (
    <>
      <BentoGrid className="max-w-4xl mx-auto md:auto-rows-[20rem]">
        {items.map((item, i) => (
          <BentoGridItem
            key={i}
            title={item.title}
            description={item.description}
            header={typeof item.header === 'function'
              ? item.header({ megaBank, isLoadingBurned })
              : item.header
            }
            className={cn("[&>p:text-lg]", item.className)}
            icon={item.icon}
            onClick={item.onClick ? () => item.onClick({
              onPlayNow,
              onShowPayouts,
              totalTickets,
              timeRemaining,
              burnedAmount,
              megaBank,
              isLoadingBurned
            }) : undefined}
          />
        ))}
      </BentoGrid>

      <LotteryHowToPlayModal
        isOpen={showHowToPlayModal}
        onOpenChange={setShowHowToPlayModal}
      />
    </>
  );
}

function LotteryHowToPlayModal({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-800/60 border-white/20 text-white max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-bold text-pink-400 mb-4">
            How to Play Lottery
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-6 text-sm leading-relaxed">
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-pink-400 mb-3">Getting Started</h3>
              <div className="space-y-3 text-gray-300">
                <p>
                  Connect your Web3 wallet (MetaMask, WalletConnect, etc.) to start playing the Lottery instantly on the PulseChain network.
                </p>
                <p>
                  Select how many tickets you want to buy. You can purchase from 1 to 100 tickets per transaction.
                </p>
                <p>
                  Choose your payment method - pay with MORBIUS tokens or PLS (PulseChain native token).
                </p>
              </div>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-pink-400 mb-3">Game Mechanics</h3>
              <div className="space-y-3 text-gray-300">
                <p>
                  The Lottery draws 6 winning numbers from 1-55 every round. Match all 6 numbers to win the jackpot!
                </p>
                <p>
                  Each ticket costs 100 MORBIUS tokens. Multiple tickets increase your chances of winning.
                </p>
                <p>
                  Winners are automatically determined when the draw finalizes. All prizes are paid instantly.
                </p>
              </div>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-pink-400 mb-3">Your Ticket</h3>
              <div className="space-y-3 text-gray-300">
                <p>
                  Your lottery ticket is recorded on the blockchain and contains your selected numbers.
                </p>
                <p>
                  You can view your tickets anytime in "My Tickets" section and track their results.
                </p>
                <p>
                  Winning tickets can be claimed automatically once the draw results are available.
                </p>
              </div>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-pink-400 mb-3">Prize Distribution</h3>
              <div className="space-y-3 text-gray-300">
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
                  <strong>Player Pool:</strong> 70% goes to the player prize pool for lottery winnings.
                </p>
              </div>
            </div>

            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <h3 className="text-lg font-semibold text-pink-400 mb-3">Rollover Mechanics</h3>
              <div className="space-y-3 text-gray-300">
                <p>
                  100% of remaining bracket funds roll over to the next round, creating larger prize pools over time.
                </p>
                <p>
                  This means unclaimed prizes from previous rounds increase the total prize pool for future players.
                </p>
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-amber-400 mb-2">💡 Pro Tips</h3>
              <ul className="space-y-2 text-gray-300 text-sm">
                <li>• Buy multiple tickets to increase your chances of winning</li>
                <li>• Check the live timer to see when the next draw begins</li>
                <li>• All transactions are recorded on PulseChain for complete transparency</li>
                <li>• Winnings are paid instantly once draws are finalized</li>
                <li>• The MegaMorbius Bank grows with every purchase, increasing future jackpots</li>
              </ul>
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-center mt-6">
          <Button
            onClick={() => onOpenChange(false)}
            className="bg-pink-600 hover:bg-pink-700 text-white px-8"
          >
            Got it! Let's Play
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
        ease: "easeOut" as const,
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
        ease: "easeOut" as const,
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
        ease: "easeOut" as const,
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
        ease: "easeOut" as const,
        delay: 0.1,
      },
    },
  };

  return (
    <motion.div
      initial="initial"
      whileHover="hover"
      variants={variants}
      className="relative w-full h-full min-h-[6rem] overflow-hidden rounded-lg bg-gradient-to-br from-pink-600 via-purple-600 to-teal-700"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,197,94,0.2),transparent_70%)]" />
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
        className="flex flex-row rounded-full border border-neutral-100 dark:border-white/[0.2] p-2 items-center space-x-2 bg-white dark:bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900/80"
      >
        <div className="h-6 w-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 shrink-0" />
        <div className="w-full bg-gray-100 h-4 rounded-full dark:bg-neutral-900" />
      </motion.div>
      <motion.div
        variants={variantsSecond}
        className="flex flex-row rounded-full border border-neutral-100 dark:border-white/[0.2] p-2 items-center space-x-2 w-3/4 ml-auto bg-white dark:bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900/80"
      >
        <div className="w-full bg-gray-100 h-4 rounded-full dark:bg-neutral-900" />
        <div className="h-6 w-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 shrink-0" />
      </motion.div>
      <motion.div
        variants={variants}
        className="flex flex-row rounded-full border border-neutral-100 dark:border-white/[0.2] p-2 items-center space-x-2 bg-white dark:bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900/80"
      >
        <div className="h-6 w-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 shrink-0" />
        <div className="w-full bg-gray-100 h-4 rounded-full dark:bg-neutral-900" />
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
          className="flex flex-row rounded-full border border-neutral-100 dark:border-white/[0.2] p-2 items-center space-x-2 bg-neutral-100 dark:bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900/80 w-full h-4"
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
      <div className="relative flex flex-1 w-full h-full min-h-[10rem] rounded-lg overflow-hidden bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900/80" />
        <div className="relative z-10 flex items-center justify-center w-full h-full">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <div className="text-white/70 text-sm font-mono">Loading MORBIUS...</div>
          </div>
        </div>
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
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/80 via-blue-900/70 to-indigo-900/80" />

      {/* Content */}
      <div className="relative z-10 flex flex-col w-full h-full p-4 text-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
            <span className="text-xs font-mono text-white/80 uppercase tracking-wider">Live</span>
          </div>
          <span className="text-xs font-mono text-white/60">MORBIUS</span>
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
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 text-center">
              <div className="text-xs text-white/70 font-mono uppercase tracking-wider mb-1">24h Volume</div>
              <div className="text-lg font-bold font-mono text-white">
                ${tokenData?.volume?.h24 ? formatVolume(tokenData.volume.h24) : '0'}
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 text-center">
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
              className="flex items-center justify-center w-8 h-8 bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-full transition-all duration-200 hover:scale-110"
              title={social.type}
            >
              <span className="text-sm">
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

const SkeletonJackpot = ({ jackpotAmount }: { jackpotAmount?: bigint }) => {
  const jackpotDisplay = jackpotAmount ? formatAmount(jackpotAmount) : "...";

  return (
    <div className="relative w-full h-full min-h-[6rem] overflow-hidden rounded-lg bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <Meteors number={15} />
      <div className="relative z-10 flex flex-col items-center justify-center h-full p-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-white mb-1">
            {jackpotDisplay}
          </div>
          <div className="text-xs text-purple-200">
            MegaMORBIUS
          </div>
        </div>
      </div>
    </div>
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

const items = [
  {
    title: "Play Now",
    description: (
      <span className="text-sm">
        Start playing instantly - buy lottery tickets and join the next draw
      </span>
    ),
    header: <SkeletonPerformance />,
    className: "md:col-span-1",
    icon: <IconTicket className="h-4 w-4 text-neutral-500" />,
    onClick: ({ onPlayNow }: any) => onPlayNow?.(),
  },
  {
    title: "Payout Breakdown",
    description: (
      <span className="text-sm">
        Instant game: match 0–6 of 6 → 0×, 0.5×, 1.5×, 5×, 25×, 500×, 10,000× (before fees). Payouts are instant.
      </span>
    ),
    header: <SkeletonTimer />,
    className: "md:col-span-1",
    icon: <IconClock className="h-4 w-4 text-neutral-500" />,
    onClick: ({ onShowPayouts }: any) => onShowPayouts?.(),
  },
  {
    title: "How to Play",
    description: (
      <span className="text-sm">
        Learn the rules and mechanics of the Lottery - step by step guide
      </span>
    ),
    header: <SkeletonHowToPlay />,
    className: "md:col-span-1 bg-slate-800/60",
    icon: <IconQuestionMark className="h-4 w-4 text-neutral-500" />,
    onClick: () => {
      // Show how to play modal
      const event = new CustomEvent('showLotteryHowToPlayModal');
      window.dispatchEvent(event);
    },
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
    title: "Jackpot",
    description: (
      <span className="text-sm">
        Current MegaMORBIUS progressive jackpot amount
      </span>
    ),
    header: ({ megaBank }: any) => <SkeletonJackpot jackpotAmount={megaBank} />,
    className: "md:col-span-2",
    icon: <IconTrophy className="h-4 w-4 text-neutral-500" />,
  },
  {
    title: "Transaction History",
    description: (
      <span className="text-sm">
        View your instant play history, past results and payouts
      </span>
    ),
    header: <SkeletonPlayNow />,
    className: "md:col-span-1",
    icon: <IconHistory className="h-4 w-4 text-neutral-500" />,
    onClick: () => {
      window.location.href = '/lottery-purchase-showcase'
    },
  },
];
