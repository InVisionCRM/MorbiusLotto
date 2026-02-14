'use client'

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAccount, useDisconnect } from 'wagmi';
import { WalletMenu } from '@/components/shared/WalletMenu';
import { useProfile } from '@/hooks/use-player-profile';
import { MorbiusBurnedDisplay } from '@/components/shared/MorbiusBurnedDisplay';
import { MorbiusPriceDisplay } from '@/components/shared/MorbiusPriceDisplay';

interface KenoMainNavProps {
  onShowPrizePool?: () => void;
  onShowHistory?: () => void;
}

export default function KenoMainNav({ onShowPrizePool, onShowHistory }: KenoMainNavProps) {
  const { isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { profileDisplayName, profileImageUrl } = useProfile();
  const [menuOpen, setMenuOpen] = useState(false);
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
      {/* Top Navigation Bar */}
      <nav
        className="fixed top-0 left-0 right-0 z-[100]"
        style={{
          background: 'linear-gradient(to right, #0f172a, #0f172a, rgba(6, 182, 212, 0.5))',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div className="container mx-auto px-2 py-1">
          <div className="flex items-center justify-between">
            {/* Left Section: Logo + Brand */}
            <div className="flex items-center gap-3">
              <div
                className="p-1 rounded-sm"
                style={{
                  background: 'linear-gradient(145deg,rgba(12, 86, 103, 0.01),rgba(0, 0, 0, 0)0.27))',
                }}
              >
                <Image
                  src="/morbius/MorbiusLogo (3).png"
                  alt="Morbius Logo"
                  width={32}
                  height={32}
                  className="object-contain"
                />
              </div>
              <span
                className="text-md font-prosto-one"
                style={{
                  color: 'rgb(226, 212, 243)'
                }}
              >
                MORBIUS.IO
              </span>
            </div>

            {/* Right Section: Wallet + Hamburger */}
            <div className="flex items-center gap-2">
              <WalletMenu
                profileDisplayName={profileDisplayName}
                profileImageUrl={profileImageUrl}
              />

              {/* Hamburger Menu */}
              <div className="relative z-50" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="w-10 h-10 flex flex-col items-center justify-center gap-[7px] transition-all active:scale-95 rounded-md hover:bg-white/10"
                >
                  <span className="w-10 h-[5px] bg-slate-900 rounded-full pointer-events-none" />
                  <span className="w-10 h-[5px] bg-slate-900 rounded-full pointer-events-none" />
                  <span className="w-10 h-[5px] bg-slate-900 rounded-full pointer-events-none" />
                </button>

                {/* Dropdown Menu */}
                {menuOpen && (
                  <div
                    className="fixed right-2 top-14 w-64 rounded-lg overflow-hidden shadow-xl z-[200] max-h-[80vh] overflow-y-auto"
                    style={{
                      background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(25, 35, 45))',
                      border: '1px solid rgba(6, 182, 212, 0.3)',
                      boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
                    }}
                  >
                    {/* Home */}
                    <div className="p-2 border-b border-gray-700/50">
                      <Link
                        href="/"
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        onClick={() => setMenuOpen(false)}
                      >
                        <i className="fas fa-home w-4 text-center" aria-hidden />
                        <span className="text-sm font-medium">Home</span>
                      </Link>
                    </div>
                    {/* Keno Section */}
                    <div className="p-2 border-b border-gray-700/50">
                      <div className="text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">Keno</div>
                      {onShowPrizePool && (
                        <button
                          onClick={() => {
                            onShowPrizePool();
                            setMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        >
                          <i className="fas fa-trophy w-4 text-center"></i>
                          <span className="text-sm font-medium">Prize Pool</span>
                        </button>
                      )}
                      {onShowHistory && (
                        <button
                          onClick={() => {
                            onShowHistory();
                            setMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        >
                          <i className="fas fa-history w-4 text-center"></i>
                          <span className="text-sm font-medium">My History</span>
                        </button>
                      )}
                      <Link
                        href="/keno-dashboard"
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        onClick={() => setMenuOpen(false)}
                      >
                        <i className="fas fa-chart-bar w-4 text-center"></i>
                        <span className="text-sm font-medium">Dashboard</span>
                      </Link>
                    </div>

                    {/* Other Games Section */}
                    <div className="p-2 border-b border-gray-700/50">
                      <div className="text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">Other Games</div>
                      <Link
                        href="/PLINKO"
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        onClick={() => setMenuOpen(false)}
                      >
                        <i className="fas fa-circle w-4 text-center"></i>
                        <span className="text-sm font-medium">Plinko</span>
                      </Link>
                      <Link
                        href="/BLACKJACK"
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        onClick={() => setMenuOpen(false)}
                      >
                        <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center rounded overflow-hidden">
                          <Image src="/BlackJack/Cards/PNG/AS.png" alt="" width={20} height={20} className="object-contain" />
                        </span>
                        <span className="text-sm font-medium">Blackjack</span>
                      </Link>
                      {/* Big Wheel - commented out
                      <Link
                        href="/BIG-WHEEL"
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        onClick={() => setMenuOpen(false)}
                      >
                        <i className="fas fa-dharmachakra w-4 text-center"></i>
                        <span className="text-sm font-medium">Big Wheel</span>
                      </Link>
                      */}
                      <Link
                        href="/lottery"
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        onClick={() => setMenuOpen(false)}
                      >
                        <i className="fas fa-ticket-alt w-4 text-center"></i>
                        <span className="text-sm font-medium">Lottery</span>
                      </Link>
                      <Link
                        href="/Morb-It"
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        onClick={() => setMenuOpen(false)}
                      >
                        <i className="fas fa-image w-4 text-center"></i>
                        <span className="text-sm font-medium">Meme Generator</span>
                      </Link>
                    </div>

                    {/* Account Section */}
                    {isConnected && (
                      <div className="p-2 border-b border-gray-700/50">
                        <div className="text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">Account</div>
                        <button
                          onClick={() => {
                            disconnect();
                            setMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <i className="fas fa-sign-out-alt w-4 text-center"></i>
                          <span className="text-sm font-medium">Disconnect</span>
                        </button>
                      </div>
                    )}

                    {/* Morbius Stats Section */}
                    <div className="p-2">
                      <div className="text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">Morbius Stats</div>
                      <MorbiusBurnedDisplay variant="inline" className="px-3 py-2" />
                      <MorbiusPriceDisplay className="px-3 py-2" />
                      <Link
                        href="/claim-fees"
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        onClick={() => setMenuOpen(false)}
                      >
                        <i className="fas fa-wallet w-4 text-center" aria-hidden />
                        <span className="text-sm font-medium">Claim fees</span>
                      </Link>
                      <Link
                        href="/swap"
                        className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        onClick={() => setMenuOpen(false)}
                      >
                        <i className="fas fa-exchange-alt w-4 text-center" aria-hidden />
                        <span className="text-sm font-medium">Swap</span>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}
