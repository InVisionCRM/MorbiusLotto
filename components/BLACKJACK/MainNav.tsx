'use client'

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect } from 'wagmi';

interface MainNavProps {
  onOpenDepositModal?: () => void;
  onOpenApprovalModal?: () => void;
  reserveBalance?: bigint;
  currentView?: 'game' | 'history' | 'stats' | 'analytics' | 'verify';
  onViewChange?: (view: 'game' | 'history' | 'stats' | 'analytics' | 'verify') => void;
}

const viewLabels: Record<string, string> = {
  game: 'Play',
  history: 'History',
  stats: 'My Stats',
  analytics: 'Analytics',
  verify: 'Verify'
};

const viewIcons: Record<string, string> = {
  game: 'fa-play',
  history: 'fa-history',
  stats: 'fa-chart-bar',
  analytics: 'fa-chart-line',
  verify: 'fa-check-circle'
};

export default function MainNav({ onOpenDepositModal, onOpenApprovalModal, reserveBalance, currentView = 'game', onViewChange }: MainNavProps) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isDropdownOpen || isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen, isMobileMenuOpen]);

  const views: Array<'game' | 'history' | 'stats' | 'analytics' | 'verify'> = ['game', 'history', 'stats', 'analytics', 'verify'];

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-[100]"
      style={{
        background: 'linear-gradient(to right, #0f172a, #0f172a, rgba(6, 182, 212, 0.5))',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="container mx-auto px-2 py-1">
        <div className="flex items-center justify-between gap-2 overflow-x-hidden">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <span className="text-lg font-medium text-white">
              MORBIUS.IO
            </span>
          </Link>


          {/* Right Side Actions */}
          <div className="flex items-center gap-1 flex-shrink-0 min-w-0">
            {/* Reserve Balance */}
            {isConnected && reserveBalance !== undefined && (
              <button
                onClick={onOpenDepositModal}
                className="relative flex items-center justify-start bg-slate-900/30 rounded-lg py-1.5 px-10 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.3),inset_-2px_-2px_4px_rgba(255,255,255,0.1)] gap-1 text-xs sm:text-sm flex-shrink min-w-0 hover:bg-slate-900/50 transition-colors cursor-pointer"
              >
                <span className="text-gray-400 hidden xs:inline">Reserve:</span>
                <div className="flex items-center gap-1">
                  <span className="text-white/80 font-bold whitespace-nowrap">
                    {Math.floor(Number(reserveBalance) / 1e18)}
                  </span>
                  <Image
                    src="/morbius/MorbiusLogo (3).png"
                    alt="Morbius Logo"
                    width={20}
                    height={20}
                    className="object-contain"
                  />
                </div>
                <i className="fas fa-chevron-down text-white text-md absolute right-3 top-1/2 transform -translate-y-1/2"></i>
              </button>
            )}

            {/* Wallet Connection */}
            <div className="flex items-center flex-shrink-0">
              {isConnected && address ? (
                <button
                  onClick={() => disconnect()}
                  className="flex items-center  gap-2 px-4 py-1 rounded-sm text-white text-sm font-bold transition-all hover:scale-105 active:scale-95"
                  style={{
                    background: 'linear-gradient(145deg,rgba(44, 149, 156, 0.11),rgba(87, 107, 113, 0.15))',
                  }}
                >
                  <span className="text-white">{address.slice(-4)}</span>
                  <i className="fas fa-chevron-down text-white text-sm"></i>
                </button>
              ) : (
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <button
                      onClick={openConnectModal}
                      className="flex items-center gap-2 px-3 py-1 rounded-sm text-white/50 text-sm font-bold transition-all hover:scale-105 active:scale-95"
                      style={{
                        background: 'linear-gradient(145deg,rgba(28, 28, 45, 0),rgba(0, 0, 0, 0))',
                      }}
                    >
                      <span className="text-cyan-400">Connect</span>
                      <i className="fas fa-chevron-down text-cyan-400 text-xs"></i>
                    </button>
                  )}
                </ConnectButton.Custom>
              )}
            </div>

            {/* Hamburger Menu - Always visible */}
            <div className="relative z-50" ref={mobileMenuRef}>
              <button
                type="button"
                onClick={() => {
                  console.log('Hamburger clicked, current state:', isMobileMenuOpen);
                  setIsMobileMenuOpen(!isMobileMenuOpen);
                }}
                className="w-10 h-10 flex flex-col items-center justify-center gap-[7px] transition-all active:scale-95 rounded-md hover:bg-white/10"
              >
                <span className="w-10 h-[5px] bg-slate-900 rounded-full pointer-events-none" />
                <span className="w-10 h-[5px] bg-slate-900 rounded-full pointer-events-none" />
                <span className="w-10 h-[5px] bg-slate-900 rounded-full pointer-events-none" />
              </button>

              {/* Dropdown Menu */}
              {isMobileMenuOpen && (
                <div
                  className="fixed right-2 top-14 w-64 rounded-lg overflow-hidden shadow-xl z-[200]"
                  style={{
                    background: 'linear-gradient(145deg, rgb(16, 26, 35), rgb(25, 35, 45))',
                    border: '1px solid rgba(6, 182, 212, 0.3)',
                    boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
                  }}
                >
                  {/* Blackjack Views Section */}
                  <div className="p-2 border-b border-gray-700/50">
                    <div className="text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">Blackjack</div>
                    {views.map((view) => (
                      <button
                        key={view}
                        onClick={() => {
                          onViewChange?.(view);
                          setIsMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                          currentView === view
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : 'text-gray-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <i className={`fas ${viewIcons[view]} w-4 text-center`}></i>
                        <span className="text-sm font-medium">{viewLabels[view]}</span>
                        {currentView === view && (
                          <i className="fas fa-check ml-auto text-cyan-400 text-xs"></i>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Other Games Section */}
                  <div className="p-2 border-b border-gray-700/50">
                    <div className="text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">Other Games</div>
                    <Link
                      href="/"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <i className="fas fa-home w-4 text-center"></i>
                      <span className="text-sm font-medium">Home</span>
                    </Link>
                    <Link
                      href="/PLINKO"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <i className="fas fa-circle w-4 text-center"></i>
                      <span className="text-sm font-medium">Plinko</span>
                    </Link>
                    <Link
                      href="/BIG-WHEEL"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <i className="fas fa-dharmachakra w-4 text-center"></i>
                      <span className="text-sm font-medium">Big Wheel</span>
                    </Link>
                    <Link
                      href="/lottery"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <i className="fas fa-ticket-alt w-4 text-center"></i>
                      <span className="text-sm font-medium">Lottery</span>
                    </Link>
                    <Link
                      href="/keno"
                      className="flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                      onClick={() => setIsMobileMenuOpen(false)}
                    >
                      <i className="fas fa-th w-4 text-center"></i>
                      <span className="text-sm font-medium">Keno</span>
                    </Link>
                  </div>

                  {/* Account Section */}
                  {isConnected && (
                    <div className="p-2">
                      <div className="text-xs text-cyan-300/60 uppercase tracking-wider px-3 py-1">Account</div>
                      {onOpenDepositModal && (
                        <button
                          onClick={() => {
                            onOpenDepositModal();
                            setIsMobileMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        >
                          <i className="fas fa-wallet w-4 text-center"></i>
                          <span className="text-sm font-medium">Deposit/Withdraw</span>
                        </button>
                      )}
                      {onOpenApprovalModal && (
                        <button
                          onClick={() => {
                            onOpenApprovalModal();
                            setIsMobileMenuOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-gray-300 hover:bg-white/5 hover:text-white transition-colors"
                        >
                          <i className="fas fa-shield-alt w-4 text-center"></i>
                          <span className="text-sm font-medium">Approval</span>
                        </button>
                      )}
                      {reserveBalance !== undefined && (
                        <div className="flex items-center gap-3 px-3 py-2 text-gray-400">
                          <i className="fas fa-coins w-4 text-center"></i>
                          <span className="text-sm">Balance: {Math.floor(Number(reserveBalance) / 1e18)} MORBIUS</span>
                        </div>
                      )}
                      <button
                        onClick={() => {
                          disconnect();
                          setIsMobileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <i className="fas fa-sign-out-alt w-4 text-center"></i>
                        <span className="text-sm font-medium">Disconnect</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}