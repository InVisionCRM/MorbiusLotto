'use client'

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect } from 'wagmi';
import { MorbiusBurnedDisplay } from '@/components/shared/MorbiusBurnedDisplay';
import { MorbiusPriceDisplay } from '@/components/shared/MorbiusPriceDisplay';

interface SlotMachinesMainNavProps {
  balance?: number;
  soundEnabled?: boolean;
  onSoundToggle?: () => void;
}

export default function SlotMachinesMainNav({
  balance = 0,
  soundEnabled = true,
  onSoundToggle
}: SlotMachinesMainNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-sm border-b border-purple-900/50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo and Title */}
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/morbius/MorbiusLogo (3).png"
                alt="Morbius Casino"
                width={40}
                height={40}
                className="rounded-full"
              />
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold text-white">MORBIUS SLOTS</h1>
                <p className="text-xs text-purple-400">Blockchain Gaming</p>
              </div>
            </Link>

            {/* Center - Price and Burned Display */}
            <div className="hidden md:flex items-center gap-4">
              <MorbiusPriceDisplay />
              <MorbiusBurnedDisplay />
            </div>

            {/* Right side controls */}
            <div className="flex items-center gap-3">
              {/* Sound Toggle */}
              {onSoundToggle && (
                <button
                  onClick={onSoundToggle}
                  className="p-2 rounded-lg bg-purple-900/30 hover:bg-purple-800/40 transition-colors"
                  title={soundEnabled ? 'Mute' : 'Unmute'}
                >
                  {soundEnabled ? (
                    <svg className="w-5 h-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  )}
                </button>
              )}

              {/* Games Menu */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-900/30 hover:bg-purple-800/40 transition-colors text-purple-300"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  <span className="hidden sm:inline">Games</span>
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl bg-black/95 border border-purple-900/50 shadow-xl shadow-purple-900/20 py-2 z-50">
                    <Link
                      href="/home"
                      className="flex items-center gap-3 px-4 py-2 text-purple-300 hover:bg-purple-900/30 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span>🏠</span>
                      <span>Home</span>
                    </Link>
                    <Link
                      href="/slot-machines"
                      className="flex items-center gap-3 px-4 py-2 text-purple-300 hover:bg-purple-900/30 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span>🎰</span>
                      <span>Slot Machines</span>
                    </Link>
                    <Link
                      href="/PLINKO"
                      className="flex items-center gap-3 px-4 py-2 text-purple-300 hover:bg-purple-900/30 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span>⚪</span>
                      <span>Plinko</span>
                    </Link>
                    <Link
                      href="/BLACKJACK"
                      className="flex items-center gap-3 px-4 py-2 text-purple-300 hover:bg-purple-900/30 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded overflow-hidden">
                        <Image src="/BlackJack/Cards/PNG/AS.png" alt="" width={20} height={20} className="object-contain" />
                      </span>
                      <span>Blackjack</span>
                    </Link>
                    <Link
                      href="/BIG-WHEEL"
                      className="flex items-center gap-3 px-4 py-2 text-purple-300 hover:bg-purple-900/30 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span>🎡</span>
                      <span>Big Wheel</span>
                    </Link>
                    <Link
                      href="/lottery"
                      className="flex items-center gap-3 px-4 py-2 text-purple-300 hover:bg-purple-900/30 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span>🎱</span>
                      <span>Lottery</span>
                    </Link>
                    <Link
                      href="/keno"
                      className="flex items-center gap-3 px-4 py-2 text-purple-300 hover:bg-purple-900/30 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span>🔢</span>
                      <span>Keno</span>
                    </Link>
                    <div className="border-t border-purple-900/30 my-2" />
                    <Link
                      href="/"
                      className="flex items-center gap-3 px-4 py-2 text-purple-300 hover:bg-purple-900/30 transition-colors"
                      onClick={() => setMenuOpen(false)}
                    >
                      <span>🏠</span>
                      <span>Home</span>
                    </Link>
                  </div>
                )}
              </div>

              {/* Wallet Connect */}
              <ConnectButton.Custom>
                {({
                  account,
                  chain,
                  openAccountModal,
                  openChainModal,
                  openConnectModal,
                  mounted,
                }) => {
                  const ready = mounted;
                  const connected = ready && account && chain;

                  return (
                    <div
                      {...(!ready && {
                        'aria-hidden': true,
                        style: {
                          opacity: 0,
                          pointerEvents: 'none',
                          userSelect: 'none',
                        },
                      })}
                    >
                      {(() => {
                        if (!connected) {
                          return (
                            <button
                              onClick={openConnectModal}
                              className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-sm hover:from-purple-500 hover:to-pink-500 transition-all"
                            >
                              Connect
                            </button>
                          );
                        }

                        if (chain.unsupported) {
                          return (
                            <button
                              onClick={openChainModal}
                              className="px-4 py-2 rounded-lg bg-red-600 text-white font-bold text-sm"
                            >
                              Wrong Network
                            </button>
                          );
                        }

                        return (
                          <button
                            onClick={openAccountModal}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-900/30 hover:bg-purple-800/40 transition-colors"
                          >
                            <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
                            <span className="text-purple-300 text-sm font-medium">
                              {account.displayName}
                            </span>
                          </button>
                        );
                      })()}
                    </div>
                  );
                }}
              </ConnectButton.Custom>
            </div>
          </div>
        </div>
      </nav>

      {/* Spacer for fixed nav */}
      <div className="h-16" />
    </>
  );
}
