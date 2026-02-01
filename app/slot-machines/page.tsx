'use client'

import React, { useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import SlotMachinesMainNav from '@/components/SlotMachines/SlotMachinesMainNav';
import MorbiusBlazing7s from '@/components/SlotMachines/MorbiusBlazing7s';

// Available slot machines
const SLOT_MACHINES = [
  {
    id: 'morbius-blazing-7s',
    name: 'Morbius Blazing 7s',
    description: 'Classic 5-reel slot with fiery 7s and progressive jackpots',
    image: '/morbius/MorbiusLogo (3).png',
    features: ['5 Reels', '20 Paylines', 'Progressive Jackpots', 'Free Spins', 'Wild Symbols'],
    minBet: 1,
    maxBet: 100,
    maxWin: '75,000x',
    rtp: '96.5%',
    volatility: 'High',
    available: true,
  },
  {
    id: 'pulse-fortune',
    name: 'Pulse Fortune',
    description: 'PulseChain themed slot with mega multipliers',
    image: '/Pulse Branding/Logo/ball.png',
    features: ['5 Reels', '25 Paylines', 'Bonus Rounds', 'Cascading Wins'],
    minBet: 1,
    maxBet: 50,
    maxWin: '10,000x',
    rtp: '97.2%',
    volatility: 'Medium',
    available: false,
  },
  {
    id: 'crypto-gems',
    name: 'Crypto Gems',
    description: 'Gem-matching slot with cluster pays',
    image: '/morbius/MorbiusLogo (3).png',
    features: ['6 Reels', 'Cluster Pays', 'Multipliers', 'Buy Bonus'],
    minBet: 0.5,
    maxBet: 200,
    maxWin: '50,000x',
    rtp: '96.8%',
    volatility: 'Very High',
    available: false,
  },
];

export default function SlotMachinesPage() {
  const { address, isConnected } = useAccount();
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [balance, setBalance] = useState(10000);

  const handleBalanceChange = useCallback((newBalance: number) => {
    setBalance(newBalance);
  }, []);

  const handleSpinComplete = useCallback((result: any) => {
    console.log('Spin complete:', result);
  }, []);

  // If a machine is selected, show the game
  if (selectedMachine === 'morbius-blazing-7s') {
    return (
      <div
        className="min-h-screen"
        style={{
          background: 'linear-gradient(180deg, #0a0015 0%, #1a0a2e 50%, #0a0015 100%)',
        }}
      >
        <SlotMachinesMainNav
          balance={balance}
          soundEnabled={soundEnabled}
          onSoundToggle={() => setSoundEnabled(!soundEnabled)}
        />

        <div className="container mx-auto px-4 py-8">
          {/* Back button */}
          <button
            onClick={() => setSelectedMachine(null)}
            className="flex items-center gap-2 mb-6 text-purple-300 hover:text-purple-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Slot Machines
          </button>

          {/* Game */}
          <MorbiusBlazing7s
            betAmount={1}
            onSpinComplete={handleSpinComplete}
            disabled={false}
            balance={balance}
            onBalanceChange={handleBalanceChange}
          />
        </div>

        {/* Footer */}
        <footer className="mt-8 py-6 border-t border-purple-900/30">
          <div className="container mx-auto px-4">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="text-purple-400/60 text-sm">
                Morbius Casino - Blockchain Gaming on PulseChain
              </div>
              <div className="flex items-center gap-4 text-sm text-purple-400/60">
                <span>Play Responsibly</span>
                <span>|</span>
                <span>18+</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // Default: Show slot machine listing
  return (
    <div
      className="min-h-screen"
      style={{
        background: 'linear-gradient(180deg, #0a0015 0%, #1a0a2e 50%, #0a0015 100%)',
      }}
    >
      <SlotMachinesMainNav
        balance={balance}
        soundEnabled={soundEnabled}
        onSoundToggle={() => setSoundEnabled(!soundEnabled)}
      />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1
            className="text-5xl font-black mb-4"
            style={{
              background: 'linear-gradient(180deg, #ffd700, #ff6b35, #ff3366)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            SLOT MACHINES
          </h1>
          <p className="text-purple-300 text-lg max-w-2xl mx-auto">
            Experience the thrill of blockchain-powered slot machines with provably fair gameplay,
            progressive jackpots, and instant payouts.
          </p>
        </div>

        {/* Slot Machine Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SLOT_MACHINES.map((machine) => (
            <div
              key={machine.id}
              className={`relative rounded-2xl overflow-hidden transition-all duration-300 ${
                machine.available
                  ? 'hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/30 cursor-pointer'
                  : 'opacity-60'
              }`}
              style={{
                background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)',
                border: '2px solid',
                borderColor: machine.available ? '#4a1a6e' : '#2a2a4a',
              }}
              onClick={() => machine.available && setSelectedMachine(machine.id)}
            >
              {/* Coming Soon Badge */}
              {!machine.available && (
                <div className="absolute top-4 right-4 z-10">
                  <span className="px-3 py-1 rounded-full bg-purple-600/80 text-white text-xs font-bold">
                    COMING SOON
                  </span>
                </div>
              )}

              {/* Machine Preview */}
              <div
                className="p-6 flex flex-col items-center"
                style={{
                  background: 'linear-gradient(180deg, rgba(138, 43, 226, 0.1), transparent)',
                }}
              >
                <div className="relative w-24 h-24 mb-4">
                  <Image
                    src={machine.image}
                    alt={machine.name}
                    fill
                    className="object-contain"
                  />
                  {machine.available && (
                    <div className="absolute inset-0 animate-pulse rounded-full bg-purple-500/20" />
                  )}
                </div>

                <h2 className="text-2xl font-black text-white mb-2">{machine.name}</h2>
                <p className="text-purple-300/80 text-sm text-center mb-4">{machine.description}</p>

                {/* Features */}
                <div className="flex flex-wrap justify-center gap-2 mb-4">
                  {machine.features.map((feature, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 rounded-full text-xs font-medium bg-purple-900/50 text-purple-300"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div
                className="p-4 grid grid-cols-2 gap-4"
                style={{
                  background: 'linear-gradient(180deg, #0f0f1a, #0a0a15)',
                  borderTop: '1px solid #2a2a4a',
                }}
              >
                <div className="text-center">
                  <div className="text-purple-400/60 text-xs">Min/Max Bet</div>
                  <div className="text-white font-bold">${machine.minBet} - ${machine.maxBet}</div>
                </div>
                <div className="text-center">
                  <div className="text-purple-400/60 text-xs">Max Win</div>
                  <div className="text-yellow-400 font-bold">{machine.maxWin}</div>
                </div>
                <div className="text-center">
                  <div className="text-purple-400/60 text-xs">RTP</div>
                  <div className="text-green-400 font-bold">{machine.rtp}</div>
                </div>
                <div className="text-center">
                  <div className="text-purple-400/60 text-xs">Volatility</div>
                  <div className="text-orange-400 font-bold">{machine.volatility}</div>
                </div>
              </div>

              {/* Play Button */}
              {machine.available && (
                <div className="p-4">
                  <button
                    className="w-full py-3 rounded-xl font-black text-lg uppercase tracking-wider transition-all"
                    style={{
                      background: 'linear-gradient(180deg, #ff6b35, #ff3366)',
                      boxShadow: '0 0 20px rgba(255, 107, 53, 0.4)',
                      border: '2px solid #ffd700',
                    }}
                  >
                    PLAY NOW
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Info Section */}
        <div
          className="mt-12 p-6 rounded-2xl"
          style={{
            background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f1a 100%)',
            border: '2px solid #2a2a4a',
          }}
        >
          <h3 className="text-2xl font-bold text-white mb-4">Why Play Morbius Slots?</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-purple-900/50 flex items-center justify-center mb-3">
                <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h4 className="text-white font-bold mb-2">Provably Fair</h4>
              <p className="text-purple-300/70 text-sm">
                Every spin is verifiable on-chain. Our smart contracts ensure complete transparency.
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-purple-900/50 flex items-center justify-center mb-3">
                <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h4 className="text-white font-bold mb-2">Instant Payouts</h4>
              <p className="text-purple-300/70 text-sm">
                Win and withdraw instantly. No waiting periods, no restrictions.
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-purple-900/50 flex items-center justify-center mb-3">
                <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h4 className="text-white font-bold mb-2">Progressive Jackpots</h4>
              <p className="text-purple-300/70 text-sm">
                Jackpots grow with every spin. Hit the mega jackpot and win life-changing amounts.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-12 py-6 border-t border-purple-900/30">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Image
                src="/morbius/MorbiusLogo (3).png"
                alt="Morbius"
                width={32}
                height={32}
              />
              <span className="text-purple-400/60 text-sm">
                Morbius Casino - Blockchain Gaming on PulseChain
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-purple-400/60">
              <Link href="/" className="hover:text-purple-300 transition-colors">Home</Link>
              <Link href="/PLINKO" className="hover:text-purple-300 transition-colors">Plinko</Link>
              <Link href="/BLACKJACK" className="hover:text-purple-300 transition-colors">Blackjack</Link>
              <span>|</span>
              <span>Play Responsibly</span>
              <span>18+</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
