'use client'

import React, { useState } from 'react';
import Image from 'next/image';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect } from 'wagmi';
import HowToPlayModal from './HowToPlayModal';
import SwapModal from './SwapModal';
import { RiskLevel } from '@/app/PLINKO/types';

interface MainNavProps {
  balance: number;
  soundEnabled: boolean;
  onSoundToggle: () => void;
  freePlayEnabled: boolean;
  onFreePlayToggle: () => void;
  onShowHistory?: () => void; // Opens full history modal
  onBuyBalls?: () => void; // Opens buy balls modal (contract mode only)
  ballCount?: number; // Contract ball balance (contract mode only)
}

export default function MainNav({ balance, soundEnabled, onSoundToggle, freePlayEnabled, onFreePlayToggle, onShowHistory, onBuyBalls, ballCount }: MainNavProps) {
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();

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

            {/* Right Section: Wallet + Drop Ball + Hamburger */}
            <div className="flex items-center gap-2">
              {/* Custom Wallet Button */}
              {isConnected && address ? (
                <button
                  onClick={() => disconnect()}
                  className="flex items-center border-slate-900 gap-2 px-4 py-1 rounded-sm text-white text-sm font-bold transition-all hover:scale-105 active:scale-95"
                  style={{
                    background: 'linear-gradient(145deg,rgba(44, 148, 156, 0.72),rgba(87, 107, 113, 0))',
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


              {/* Hamburger Menu */}
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="w-16 h-8 flex flex-col items-center justify-center gap-[5px] transition-all active:scale-95 rounded-sm"
                  style={{
                    background: 'linear-gradient(145deg,rgba(113, 113, 134, 0),rgba(5, 15, 40, 0))',
                  }}
                >
                  <div className="w-15 h-[5px] bg-slate-900 rounded-full p-1" />
                  <div className="w-16 h-[5px] bg-slate-900 rounded-full p-1" />
                  <div className="w-15 h-[5px] bg-slate-900 rounded-full p-1" />
                </button>

                {/* Dropdown Menu */}
                {menuOpen && (
                  <>
                    {/* Backdrop */}
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setMenuOpen(false)}
                    />

                    {/* Menu Panel */}
                    <div
                      className="absolute right-0 top-12 w-48 rounded-lg z-50"
                      style={{
                        background: 'linear-gradient(145deg, rgba(50, 50, 59, 0.9), rgba(26, 29, 34, 0.9))',
                        border: '2px inset rgba(0, 0, 0, 0.5)',
                        backdropFilter: 'blur(2px)',
                      }}
                    >
                      {/* Title */}
                      <div
                        className="px-3 py-2"
                        style={{
                          borderBottom: '1px inset rgba(0, 0, 0, 0.3)',
                        }}
                      >
                        <span
                          className="font-bold text-sm"
                          style={{
                            color: 'rgba(226, 212, 243, 0.74)',
                          }}
                        >
                          PLINKO
                        </span>
                      </div>

                      {/* Menu Items */}
                      <div className="py-1">
                        <a
                          href="/home"
                          onClick={() => {
                            setMenuOpen(false);
                          }}
                          className="block w-full px-3 py-2 text-left text-cyan-400/70 hover:bg-cyan-400/10 hover:text-cyan-300 transition-colors text-sm font-medium"
                        >
                          Home
                        </a>
                        <button
                          onClick={() => {
                            setHowToPlayOpen(true);
                            setMenuOpen(false);
                          }}
                          className="w-full px-3 py-2 text-left text-cyan-400/70 hover:bg-cyan-400/10 hover:text-cyan-300 transition-colors text-sm font-medium"
                        >
                          How to Play
                        </button>
                        <button
                          onClick={() => {
                            if (onShowHistory) onShowHistory();
                            setMenuOpen(false);
                          }}
                          className="w-full px-3 py-2 text-left text-cyan-400/70 hover:bg-cyan-400/10 hover:text-cyan-300 transition-colors text-sm font-medium"
                        >
                          My History
                        </button>
                        <button
                          onClick={() => {
                            window.location.href = '/plinko-dashboard';
                            setMenuOpen(false);
                          }}
                          className="w-full px-3 py-2 text-left text-cyan-400/70 hover:bg-cyan-400/10 hover:text-cyan-300 transition-colors text-sm font-medium"
                        >
                          Dashboard
                        </button>
                        <button
                          onClick={() => {
                            window.location.href = '/plinko-verifier';
                            setMenuOpen(false);
                          }}
                          className="w-full px-3 py-2 text-left text-cyan-400/70 hover:bg-cyan-400/10 hover:text-cyan-300 transition-colors text-sm font-medium"
                        >
                          Verifier
                        </button>
                        <button
                          onClick={() => {
                            setSwapOpen(true);
                            setMenuOpen(false);
                          }}
                          className="w-full px-3 py-2 text-left text-cyan-400/70 hover:bg-cyan-400/10 hover:text-cyan-300 transition-colors text-sm font-medium"
                        >
                          Buy Morbius
                        </button>

                        {/* Sound Toggle */}
                        <div
                          className="px-3 py-2 mt-1"
                          style={{
                            borderTop: '1px inset rgba(0, 0, 0, 0.3)',
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className="text-xs font-medium"
                              style={{
                                color: 'rgba(226, 212, 243, 0.74)',
                              }}
                            >
                              Sound
                            </span>
                            <button
                              onClick={onSoundToggle}
                              className={`relative w-10 h-5 rounded-full transition-all duration-300 ${
                                soundEnabled
                                  ? 'bg-gradient-to-r from-green-500 to-green-600'
                                  : 'bg-gradient-to-r from-gray-600 to-gray-700'
                              } shadow-lg`}
                            >
                              <div
                                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-300 flex items-center justify-center ${
                                  soundEnabled ? 'left-[22px]' : 'left-0.5'
                                }`}
                              >
                                <i className={`fas ${soundEnabled ? 'fa-volume-up' : 'fa-volume-mute'} text-[7px] ${soundEnabled ? 'text-green-600' : 'text-gray-600'}`}></i>
                              </div>
                            </button>
                          </div>
                        </div>

                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* How to Play Modal */}
      <HowToPlayModal open={howToPlayOpen} onOpenChange={setHowToPlayOpen} />

      {/* Swap Modal */}
      <SwapModal open={swapOpen} onOpenChange={setSwapOpen} />
    </>
  );
}


