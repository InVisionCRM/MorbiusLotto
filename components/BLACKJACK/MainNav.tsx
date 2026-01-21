'use client'

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect } from 'wagmi';

interface MainNavProps {
  onOpenDepositModal?: () => void;
  reserveBalance?: bigint;
  currentView?: 'game' | 'history' | 'stats' | 'analytics' | 'verify';
  onViewChange?: (view: 'game' | 'history' | 'stats' | 'analytics' | 'verify') => void;
}

const viewLabels: Record<string, string> = {
  game: 'Play',
  history: 'History',
  stats: 'Stats',
  analytics: 'Analytics',
  verify: 'Verify'
};

export default function MainNav({ onOpenDepositModal, reserveBalance, currentView = 'game', onViewChange }: MainNavProps) {
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
    <nav className="sticky top-0 z-40 border-b border-gray-800/50 bg-black/80 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center">
            <span className="text-lg font-medium text-white">
              MORBIUS.IO
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-8">
            <Link
              href="/"
              className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
            >
              Home
            </Link>
            <Link
              href="/lottery"
              className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
            >
              Lottery
            </Link>
            <Link
              href="/keno"
              className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
            >
              KENO
            </Link>
            <Link
              href="/PLINKO"
              className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
            >
              Plinko
            </Link>
            <Link
              href="/BIG-WHEEL"
              className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
            >
              Big Wheel
            </Link>
            <Link
              href="/BLACKJACK"
              className="text-white font-medium text-sm"
            >
              Blackjack
            </Link>
          </div>

          {/* View Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center space-x-2 text-gray-300 hover:text-white transition-colors text-sm font-medium"
            >
              <span>{viewLabels[currentView] || 'Play'}</span>
              <span
                aria-hidden
                className={`text-xs leading-none transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
              >
                ▾
              </span>
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 mt-2 w-40 border border-gray-800 bg-black/95 backdrop-blur-sm shadow-lg z-50">
                {views.map((view) => (
                  <button
                    key={view}
                    onClick={() => {
                      onViewChange?.(view);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors hover:underline underline-offset-4 ${
                      currentView === view ? 'text-white underline' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {viewLabels[view]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center space-x-4">
            {/* Deposit/Withdraw Button */}
            {isConnected && (
              <button
                onClick={onOpenDepositModal}
                className="text-gray-300 hover:text-white transition-colors text-sm font-medium"
              >
                Deposit/Withdraw
              </button>
            )}

            {/* Reserve Balance */}
            {isConnected && reserveBalance !== undefined && (
              <div className="flex items-center space-x-2 text-sm">
                <span className="text-gray-400">Reserve:</span>
                <span className="text-white font-medium">
                  {Math.floor(Number(reserveBalance) / 1e18)} MORBIUS
                </span>
              </div>
            )}

            {/* Wallet Connection */}
            <div className="flex items-center">
              {isConnected && address ? (
                <button
                  onClick={() => disconnect()}
                  className="text-gray-300 hover:text-white transition-colors text-sm font-medium"
                >
                  {address.slice(0, 6)}...{address.slice(-4)}
                </button>
              ) : (
                <ConnectButton.Custom>
                  {({ openConnectModal }) => (
                    <button
                      onClick={openConnectModal}
                      className="text-gray-300 hover:text-white transition-colors text-sm font-medium"
                    >
                      Connect Wallet
                    </button>
                  )}
                </ConnectButton.Custom>
              )}
            </div>

            {/* Mobile Menu Button */}
            <button 
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              className="md:hidden p-2 text-gray-300 hover:text-white transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden mt-4 pb-4 border-t border-gray-800/50" ref={mobileMenuRef}>
            <div className="flex flex-col space-y-3 pt-4">
              <Link
                href="/"
                className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Home
              </Link>
              <Link
                href="/lottery"
                className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Lottery
              </Link>
              <Link
                href="/keno"
                className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                KENO
              </Link>
              <Link
                href="/PLINKO"
                className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Plinko
              </Link>
              <Link
                href="/BIG-WHEEL"
                className="text-gray-400 hover:text-white transition-colors text-sm font-medium"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Big Wheel
              </Link>
              <Link
                href="/BLACKJACK"
                className="text-white font-medium text-sm"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Blackjack
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}