'use client'

import React, { useState } from 'react';
import FAQModal from './FAQModal';

export default function Footer() {
  const [faqOpen, setFaqOpen] = useState(false);

  return (
    <>
      <footer className="bg-black/5 border-t border-black/10 py-1 px-1 mt-auto">
        <div className="container mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1 md:gap-2">
            {/* Column 1 - More From Morbius.io */}
            <div>
              <h3 className="text-gray-900 font-bold text-xs mb-1">More From Morbius.io!</h3>
              <ul className="space-y-0.5">
                <li>
                  <a href="#" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    Lottery
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    KENO
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    Baccarat
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    BlackJack
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    Poker
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 2 - Quick Links */}
            <div>
              <h3 className="text-gray-900 font-bold text-xs mb-1">Quick Links</h3>
              <ul className="space-y-0.5">
                <li>
                  <a href="#" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    Home
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    How to Play
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
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
                    onClick={() => setFaqOpen(true)}
                    className="text-gray-700 hover:text-green-600 transition-colors text-xs text-left"
                  >
                    FAQs
                  </button>
                </li>
                <li>
                  <a href="#" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    User Agreement
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 3 - Resources */}
            <div>
              <h3 className="text-gray-900 font-bold text-xs mb-1">Resources</h3>
              <ul className="space-y-0.5">
                <li>
                  <a href="#" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    About Us
                  </a>
                </li>
                <li>
                  <a href="#" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    Help Center
                  </a>
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
                <li>
                  <a href="#" className="text-gray-700 hover:text-green-600 transition-colors text-xs">
                    Contact Us
                  </a>
                </li>
              </ul>
            </div>

            {/* Column 4 - Social Media */}
            <div>
              <h3 className="text-gray-900 font-bold text-xs mb-1">Connect</h3>
              <ul className="space-y-0.5">
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

          {/* Copyright */}
          <div className="mt-1 pt-1 border-t border-black/10 text-center">
            <p className="text-gray-600 text-[10px]">
              © 2025 Morbius.io. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* FAQ Modal */}
      <FAQModal open={faqOpen} onOpenChange={setFaqOpen} />
    </>
  );
}
