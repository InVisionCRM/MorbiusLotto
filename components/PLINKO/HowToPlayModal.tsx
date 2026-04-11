'use client'

import React from 'react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IconHistory, IconVolume, IconStack2, IconShield } from '@tabler/icons-react';

interface HowToPlayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function HowToPlayModal({ open, onOpenChange }: HowToPlayModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[100000] sm:max-w-[700px] bg-black max-h-[85vh] overflow-y-auto border-4 border-[#1BE7FF] shadow-2xl shadow-[#1BE7FF]/40"
        style={{
          boxShadow: '0 0 30px rgba(27, 231, 255, 0.5), inset 0 0 20px rgba(27, 231, 255, 0.1)'
        }}>
        <DialogHeader className="pb-2">
          <DialogTitle className="text-4xl font-black text-center tracking-wider"
            style={{
              fontFamily: 'Impact, "Arial Black", sans-serif',
              background: 'linear-gradient(135deg, #6FF4FF 0%, #1BE7FF 50%, #0BA5C4 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 0 20px rgba(27, 231, 255, 0.3)'
            }}>
            HOW TO PLAY
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 px-1">
          {/* Crypto Introduction */}
          <div className="bg-gradient-to-br from-[#1BE7FF]/10 to-transparent rounded-lg p-4 border-l-4 border-[#1BE7FF]">
            <h3 className="text-lg font-bold text-[#1BE7FF] mb-3 uppercase tracking-wide">Welcome to Crypto Plinko</h3>
            <div className="space-y-2 text-sm text-gray-300">
              <p className="text-white font-medium">
                Experience the thrill of traditional Plinko with blockchain technology! 🎯
              </p>
              <p>
                Play with real cryptocurrency on <span className="inline-flex items-center gap-1"><Image src="/Pulse Branding/Logo/ball.png" alt="PulseChain" width={12} height={12} className="flex-shrink-0" /> PulseChain</span>. Win MORBIUS tokens when your ball lands in winning buckets.
                All transactions are secured by smart contracts and verified on-chain.
              </p>
              <div className="bg-black/40 rounded p-2 mt-3">
                <p className="text-xs text-gray-400">
                  <span className="text-[#1BE7FF] font-semibold inline-flex items-center gap-1">
                    <Image
                      src="/Pulse Branding/Logo/ball.png"
                      alt="PulseChain"
                      width={12}
                      height={12}
                      className="flex-shrink-0"
                    />
                    🔗 PulseChain:
                  </span> Fast, low-fee blockchain perfect for gaming
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  <span className="text-[#1BE7FF] font-semibold">💰 MORBIUS:</span> Native token powering the ecosystem
                </p>
              </div>
            </div>
          </div>

          {/* Game Rules */}
          <div className="bg-gradient-to-br from-[#AFFC41]/10 to-transparent rounded-lg p-4 border-l-4 border-[#AFFC41]">
            <h3 className="text-lg font-bold text-[#AFFC41] mb-3 uppercase tracking-wide">How to Play</h3>
            <div className="space-y-3 text-sm text-gray-300">
              <div className="flex items-start gap-3">
                <span className="text-white font-bold bg-[#1BE7FF] rounded-full w-6 h-6 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                <div>
                  <p className="font-semibold text-white">Connect Your Wallet</p>
                  <p className="text-xs text-gray-400">Link your <span className="inline-flex items-center gap-1"><Image src="/Pulse Branding/Logo/ball.png" alt="PulseChain" width={10} height={10} className="flex-shrink-0" /> PulseChain</span>-compatible wallet (MetaMask, etc.)</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-white font-bold bg-[#1BE7FF] rounded-full w-6 h-6 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                <div>
                  <p className="font-semibold text-white">Set Your Bet Amount</p>
                  <p className="text-xs text-gray-400">Choose how many MORBIUS tokens to wager (minimum 10)</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-white font-bold bg-[#1BE7FF] rounded-full w-6 h-6 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                <div>
                  <p className="font-semibold text-white">Choose Risk Level</p>
                  <p className="text-xs text-gray-400">Select Low, Medium, or High risk for different multiplier ranges</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-white font-bold bg-[#1BE7FF] rounded-full w-6 h-6 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">4</span>
                <div>
                  <p className="font-semibold text-white">Drop the Ball</p>
                  <p className="text-xs text-gray-400">Click "Drop Ball" to send your transaction to the blockchain</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-white font-bold bg-[#1BE7FF] rounded-full w-6 h-6 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">5</span>
                <div>
                  <p className="font-semibold text-white">Watch & Win</p>
                  <p className="text-xs text-gray-400">Physics simulation determines where your ball lands. Winning buckets multiply your bet!</p>
                </div>
              </div>
            </div>
          </div>

          {/* Risk Levels */}
          <div className="bg-gradient-to-br from-[#4392F1]/10 to-transparent rounded-lg p-4 border-l-4 border-[#4392F1]">
            <h3 className="text-lg font-bold text-[#4392F1] mb-3 uppercase tracking-wide">Risk Levels</h3>
            <div className="grid grid-cols-1 gap-3">
              <div className="bg-black/50 rounded-lg p-3 border border-[#AFFC41]/40">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-[#AFFC41]"></div>
                  <span className="font-bold text-[#AFFC41]">LOW RISK</span>
                  <span className="text-xs text-gray-400 ml-auto">Conservative Play</span>
                </div>
                <p className="text-xs text-gray-400 mb-2">Safer multipliers, more consistent wins</p>
                <div className="text-xs text-gray-500">Max multiplier: 7x • More winning buckets</div>
              </div>
              <div className="bg-black/50 rounded-lg p-3 border border-[#4392F1]/40">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-[#4392F1]"></div>
                  <span className="font-bold text-[#4392F1]">MEDIUM RISK</span>
                  <span className="text-xs text-gray-400 ml-auto">Balanced Strategy</span>
                </div>
                <p className="text-xs text-gray-400 mb-2">Good mix of safety and potential big wins</p>
                <div className="text-xs text-gray-500">Max multiplier: 15x • Balanced odds</div>
              </div>
              <div className="bg-black/50 rounded-lg p-3 border border-[#FF331F]/40">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-[#FF331F]"></div>
                  <span className="font-bold text-[#FF331F]">HIGH RISK</span>
                  <span className="text-xs text-gray-400 ml-auto">High Reward Potential</span>
                </div>
                <p className="text-xs text-gray-400 mb-2">Maximum multipliers but harder to win</p>
                <div className="text-xs text-gray-500">Max multiplier: 35x • Fewer winning buckets</div>
              </div>
            </div>
          </div>

          {/* Multiplier Tables */}
          <div className="bg-gradient-to-br from-[#FF331F]/10 to-transparent rounded-lg p-4 border-l-4 border-[#FF331F]">
            <h3 className="text-lg font-bold text-[#FF331F] mb-3 uppercase tracking-wide">Multiplier Odds</h3>
            <p className="text-xs text-gray-400 mb-3">Each bucket has a 5.88% chance (1 in 17). Odds are the same for all risk levels.</p>

            <div className="space-y-4">
              {/* Low Risk Table */}
              <div>
                <h4 className="font-bold text-[#AFFC41] mb-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#AFFC41]"></div>
                  LOW RISK Multipliers
                </h4>
                <div className="grid grid-cols-6 gap-1 text-xs">
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">16x</div>
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">9x</div>
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">2x</div>
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">1.4x</div>
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">1.4x</div>
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">1.2x</div>
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">1.1x</div>
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">1x</div>
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">0.5x</div>
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">1x</div>
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">1.1x</div>
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">1.2x</div>
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">1.4x</div>
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">1.4x</div>
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">2x</div>
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">9x</div>
                  <div className="bg-[#AFFC41]/20 p-2 rounded text-center font-bold text-[#AFFC41]">16x</div>
                </div>
              </div>

              {/* Medium Risk Table */}
              <div>
                <h4 className="font-bold text-[#4392F1] mb-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#4392F1]"></div>
                  MEDIUM RISK Multipliers
                </h4>
                <div className="grid grid-cols-6 gap-1 text-xs">
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">110x</div>
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">41x</div>
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">10x</div>
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">5x</div>
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">3x</div>
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">1.5x</div>
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">1x</div>
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">0.5x</div>
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">0.3x</div>
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">0.5x</div>
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">1x</div>
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">1.5x</div>
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">3x</div>
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">5x</div>
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">10x</div>
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">41x</div>
                  <div className="bg-[#4392F1]/20 p-2 rounded text-center font-bold text-[#4392F1]">110x</div>
                </div>
              </div>

              {/* High Risk Table */}
              <div>
                <h4 className="font-bold text-[#FF331F] mb-2 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#FF331F]"></div>
                  HIGH RISK Multipliers
                </h4>
                <div className="grid grid-cols-6 gap-1 text-xs">
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">1000x</div>
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">120x</div>
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">26x</div>
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">9x</div>
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">4x</div>
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">2x</div>
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">0.2x</div>
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">0.2x</div>
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">0.2x</div>
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">0.2x</div>
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">0.2x</div>
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">2x</div>
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">4x</div>
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">9x</div>
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">26x</div>
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">120x</div>
                  <div className="bg-[#FF331F]/20 p-2 rounded text-center font-bold text-[#FF331F]">1000x</div>
                </div>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/60 rounded-lg p-3 border border-[#1BE7FF]/30 hover:border-[#1BE7FF] transition-all">
              <div className="flex items-center gap-2 mb-2">
                <IconHistory size={16} className="text-[#1BE7FF]" />
                <h4 className="font-bold text-[#1BE7FF] text-sm">Game History</h4>
              </div>
              <p className="text-xs text-gray-400">Track all your drops and winnings</p>
            </div>
            <div className="bg-black/60 rounded-lg p-3 border border-[#1BE7FF]/30 hover:border-[#1BE7FF] transition-all">
              <div className="flex items-center gap-2 mb-2">
                <IconVolume size={16} className="text-[#1BE7FF]" />
                <h4 className="font-bold text-[#1BE7FF] text-sm">Sound Effects</h4>
              </div>
              <p className="text-xs text-gray-400">Toggle audio feedback on/off</p>
            </div>
            <div className="bg-black/60 rounded-lg p-3 border border-[#1BE7FF]/30 hover:border-[#1BE7FF] transition-all">
              <div className="flex items-center gap-2 mb-2">
                <IconStack2 size={16} className="text-[#1BE7FF]" />
                <h4 className="font-bold text-[#1BE7FF] text-sm">Bet Presets</h4>
              </div>
              <p className="text-xs text-gray-400">Quick-select common bet amounts</p>
            </div>
            <div className="bg-black/60 rounded-lg p-3 border border-[#1BE7FF]/30 hover:border-[#1BE7FF] transition-all">
              <div className="flex items-center gap-2 mb-2">
                <IconShield size={16} className="text-[#1BE7FF]" />
                <h4 className="font-bold text-[#1BE7FF] text-sm">Smart Contract</h4>
              </div>
              <p className="text-xs text-gray-400">All games verified on-chain</p>
            </div>
          </div>

          {/* Pro Tips */}
          <div className="bg-gradient-to-br from-[#AFFC41]/10 to-transparent rounded-lg p-4 border-l-4 border-[#AFFC41]">
            <h3 className="text-lg font-bold text-[#AFFC41] mb-3 uppercase tracking-wide">Pro Tips</h3>
            <ul className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-2">
                <span className="text-[#1BE7FF] mt-0.5">🎯</span>
                <span><strong>Edge buckets</strong> offer highest multipliers but are statistically harder to hit</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#1BE7FF] mt-0.5">💰</span>
                <span><strong>Start small</strong> - practice with lower bets to understand the physics</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#1BE7FF] mt-0.5">🔗</span>
                <span><strong>Blockchain speed</strong> - <span className="inline-flex items-center gap-1"><Image src="/Pulse Branding/Logo/ball.png" alt="PulseChain" width={10} height={10} className="flex-shrink-0" /> PulseChain</span> offers fast, low-fee transactions</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#1BE7FF] mt-0.5">📊</span>
                <span><strong>House edge</strong> - like traditional casinos, the house maintains a small edge</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#1BE7FF] mt-0.5">🎮</span>
                <span><strong>Responsible gaming</strong> - set limits and play within your means</span>
              </li>
            </ul>
          </div>

          {/* Call to Action */}
          <div className="text-center pt-3 pb-1">
            <div className="inline-block bg-gradient-to-r from-[#6FF4FF] via-[#1BE7FF] to-[#0BA5C4] rounded-full px-8 py-3 shadow-lg">
              <p className="text-lg font-black text-black tracking-wide">
                READY TO PLAY? 🎯
              </p>
              <p className="text-xs text-black/80 mt-1">
                Connect your wallet and start winning MORBIUS!
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
