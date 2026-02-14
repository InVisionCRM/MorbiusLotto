'use client'

import React, { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { AboutUsModal } from '@/components/footer/about-us';
import { UserAgreementModal } from '@/components/footer/user-agreement';
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts';

export default function Footer() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [userAgreementOpen, setUserAgreementOpen] = useState(false);
  const [morbiusCopied, setMorbiusCopied] = useState(false);
  const copyMorbius = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(MORBIUS_TOKEN_ADDRESS);
      setMorbiusCopied(true);
      toast.success('MORBIUS address copied');
      setTimeout(() => setMorbiusCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  }, []);

  return (
    <>
      <footer
        className="w-full bg-black/50 backdrop-blur-sm border-t border-black/10 py-4 px-4 mt-auto bg-cover bg-center"
        style={{ backgroundImage: "url('/Pulse Branding/Banner/Dark/minimal.png')" }}
      >
        <div className="container mx-auto max-w-4xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {/* Column 1 - More From Morbius.io */}
            <div className="flex flex-col items-center md:items-start">
              <h3 className="text-purple-500 font-bold text-xs mb-2 md:mb-1">More From Morbius.io!</h3>
              <ul className="space-y-1 md:space-y-0.5 text-center md:text-left">
                <li>
                  <a href="/lottery" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    Lottery
                  </a>
                </li>
                <li>
                  <a href="/keno" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    KENO
                  </a>
                </li>
                <li>
                  <a href="/PLINKO" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    Plinko
                  </a>
                </li>
                <li>
                  <a href="/BIG-WHEEL" className="text-gray-700 hover:text-yellow-500 transition-colors text-xs font-bold">
                    Big Wheel
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 2 - Quick Links */}
            <div className="flex flex-col items-center md:items-start">
              <h3 className="text-purple-500 font-bold text-xs mb-2 md:mb-1">Quick Links</h3>
              <ul className="space-y-1 md:space-y-0.5 text-center md:text-left">
                <li>
                  <a href="/" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    Home
                  </a>
                </li>
                <li>
                  <a href="/swap" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    Buy Morbius
                  </a>
                </li>
                <li>
                  <a
                    href="https://pulsechain.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-700 hover:text-green-600 transition-colors text-xs"
                  >
                    What is PulseChain?
                  </a>
                </li>
                <li>
                  <button
                    onClick={() => setUserAgreementOpen(true)}
                    className="text-gray-700 hover:text-green-600 transition-colors text-xs text-left"
                  >
                    User Agreement
                  </button>
                </li>
              </ul>
            </div>

            {/* Column 3 - Resources */}
            <div className="flex flex-col items-center md:items-start">
              <h3 className="text-purple-500 font-bold text-xs mb-2 md:mb-1">Resources</h3>
              <ul className="space-y-1 md:space-y-0.5 text-center md:text-left">
                <li>
                  <button
                    onClick={() => setAboutOpen(true)}
                    className="text-gray-700 hover:text-green-600 transition-colors text-xs text-left"
                  >
                    About Us
                  </button>
                </li>
                <li>
                  <a href="#" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    Privacy Policy
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 4 - Social Media */}
            <div className="flex flex-col items-center md:items-start">
              <h3 className="text-purple-500 font-bold text-xs mb-2 md:mb-1">Connect</h3>
              <ul className="space-y-1 md:space-y-0.5 text-center md:text-left">
                <li>
                  <a
                    href="https://x.com/Morbius_io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-700 hover:text-green-600 transition-colors text-xs flex items-center gap-2"
                  >
                    <i className="fab fa-x-twitter"></i>
                    <span>@Morbius_io</span>
                  </a>
                </li>
                <li>
                  <a
                    href="https://t.me/Morbius_cash"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-700 hover:text-green-600 transition-colors text-xs flex items-center gap-2"
                  >
                    <i className="fab fa-telegram"></i>
                    <span>Morbius_cash</span>
                  </a>
                </li>
                <li>
                  <a
                    href="https://morbius.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-700 hover:text-green-600 transition-colors text-xs flex items-center gap-2"
                  >
                    <i className="fas fa-globe"></i>
                    <span>Morbius.io</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>

          {/* Morbius token address — click to copy */}
          <div className="mt-3 pt-2 border-t border-black/10 text-center">
            <button
              type="button"
              onClick={copyMorbius}
              className="text-white font-bold font-poppins text-sm cursor-pointer hover:opacity-90 transition-opacity select-all"
              title="Click to copy MORBIUS address"
            >
              {MORBIUS_TOKEN_ADDRESS}
              {morbiusCopied && <span className="ml-2 text-cyan-400">Copied!</span>}
            </button>
          </div>

          {/* Copyright */}
          <div className="mt-2 pt-2 border-t border-black/10 text-center">
            <p className="text-gray-600 text-[10px] sm:text-xs">
              © 2025 Morbius.io. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* About Us Modal */}
      <AboutUsModal open={aboutOpen} onOpenChange={setAboutOpen} />

      {/* User Agreement Modal */}
      <UserAgreementModal open={userAgreementOpen} onOpenChange={setUserAgreementOpen} />
    </>
  );
}
