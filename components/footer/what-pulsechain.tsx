import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import Image from "next/image"

interface WhatPulseChainModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WhatPulseChainModal({ open, onOpenChange }: WhatPulseChainModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gradient-to-br from-slate-950 to-slate-900/95 border-white/20 text-white max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-4 mb-4">
              <Image
                src="/Pulse Branding/Logo/ball.png"
                alt="PulseChain"
                width={48}
                height={48}
                className="flex-shrink-0"
              />
              <DialogTitle className="text-4xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                What is PulseChain?
              </DialogTitle>
            </div>
            <div className="w-20 h-0.5 bg-gradient-to-r from-blue-400 to-cyan-400 mx-auto"></div>
          </div>
        </DialogHeader>

        <div className="space-y-8">
          {/* Hero Section */}
          <div className="bg-gradient-to-r from-blue-950/20 to-cyan-950/20 p-6 rounded-lg border border-blue-400/20">
            <div className="text-center mb-6">
              <h3 className="text-2xl font-bold text-blue-300 mb-2">The Future of Blockchain Gaming</h3>
              <p className="text-blue-200 text-lg">
                PulseChain is a high-performance blockchain designed specifically for gaming, DeFi, and decentralized applications.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4 text-center">
              <div className="bg-white/5 p-4 rounded border border-white/10">
                <div className="text-2xl font-bold text-cyan-400 mb-1">⚡</div>
                <div className="text-white font-semibold">Fast Transactions</div>
                <div className="text-white/70 text-sm">Sub-second confirmations</div>
              </div>
              <div className="bg-white/5 p-4 rounded border border-white/10">
                <div className="text-2xl font-bold text-green-400 mb-1">$</div>
                <div className="text-white font-semibold">Low Fees</div>
                <div className="text-white/70 text-sm">Fraction of a cent per tx</div>
              </div>
              <div className="bg-white/5 p-4 rounded border border-white/10">
                <div className="text-2xl font-bold text-purple-400 mb-1">🎮</div>
                <div className="text-white font-semibold">Gaming Focused</div>
                <div className="text-white/70 text-sm">Built for Web3 gaming</div>
              </div>
            </div>
          </div>

          {/* Technical Details */}
          <div className="bg-white/5 p-6 rounded border border-white/10">
            <h3 className="text-xl font-bold text-white mb-4">Technical Specifications</h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-cyan-300 font-semibold mb-2">Network Details</h4>
                <ul className="text-white/80 space-y-1">
                  <li>• <strong>Chain ID:</strong> 369</li>
                  <li>• <strong>Native Token:</strong> PLS (Pulse)</li>
                  <li>• <strong>Consensus:</strong> Proof of Stake</li>
                  <li>• <strong>Block Time:</strong> ~3 seconds</li>
                </ul>
              </div>
              <div>
                <h4 className="text-cyan-300 font-semibold mb-2">Performance</h4>
                <ul className="text-white/80 space-y-1">
                  <li>• <strong>TPS:</strong> 1,000+</li>
                  <li>• <strong>Gas Fee:</strong> ~$0.001</li>
                  <li>• <strong>EVM Compatible:</strong> Yes</li>
                  <li>• <strong>Cross-Chain:</strong> Multi-bridge support</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Why Choose PulseChain */}
          <div className="bg-gradient-to-r from-cyan-950/20 to-blue-950/20 p-6 rounded border border-cyan-400/20">
            <h3 className="text-xl font-bold text-cyan-300 mb-4">Why Choose PulseChain for Gaming?</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-cyan-500/20 rounded-full flex items-center justify-center text-cyan-400 font-bold text-sm flex-shrink-0 mt-0.5">1</div>
                <div>
                  <h4 className="text-white font-semibold">Lightning Fast Transactions</h4>
                  <p className="text-white/70 text-sm">Experience seamless gameplay without waiting for confirmations. Perfect for competitive gaming and real-time interactions.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center text-green-400 font-bold text-sm flex-shrink-0 mt-0.5">2</div>
                <div>
                  <h4 className="text-white font-semibold">Micro Transactions Made Affordable</h4>
                  <p className="text-white/70 text-sm">Pay fractions of a penny for each game action. Enable true micro-transactions and in-game purchases that were previously impossible.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-purple-500/20 rounded-full flex items-center justify-center text-purple-400 font-bold text-sm flex-shrink-0 mt-0.5">3</div>
                <div>
                  <h4 className="text-white font-semibold">True Ownership & Interoperability</h4>
                  <p className="text-white/70 text-sm">Own your digital assets across games and platforms. Move items, currency, and achievements between different gaming experiences.</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-orange-500/20 rounded-full flex items-center justify-center text-orange-400 font-bold text-sm flex-shrink-0 mt-0.5">4</div>
                <div>
                  <h4 className="text-white font-semibold">Decentralized Gaming Future</h4>
                  <p className="text-white/70 text-sm">Play without intermediaries. No platform fees, no account restrictions, and complete control over your gaming experience.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Getting Started */}
          <div className="bg-white/5 p-6 rounded border border-white/10">
            <h3 className="text-xl font-bold text-white mb-4">Getting Started with PulseChain</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 bg-blue-950/20 rounded border border-blue-400/20">
                <div className="text-blue-400 font-bold">1</div>
                <div>
                  <div className="text-white font-semibold">Get a Wallet</div>
                  <div className="text-white/70 text-sm">Download MetaMask, Trust Wallet, or any PulseChain-compatible wallet</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-green-950/20 rounded border border-green-400/20">
                <div className="text-green-400 font-bold">2</div>
                <div>
                  <div className="text-white font-semibold">Add PulseChain Network</div>
                  <div className="text-white/70 text-sm">Configure your wallet with PulseChain RPC settings (Chain ID: 369)</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-purple-950/20 rounded border border-purple-400/20">
                <div className="text-purple-400 font-bold">3</div>
                <div>
                  <div className="text-white font-semibold">Get Some PLS</div>
                  <div className="text-white/70 text-sm">Purchase PLS tokens from exchanges or use bridges from other chains</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-orange-950/20 rounded border border-orange-400/20">
                <div className="text-orange-400 font-bold">4</div>
                <div>
                  <div className="text-white font-semibold">Start Gaming!</div>
                  <div className="text-white/70 text-sm">Connect your wallet to Morbius.io and start playing instantly</div>
                </div>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center">
            <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-6 rounded-lg">
              <h3 className="text-xl font-bold text-white mb-2">Ready to Experience the Future?</h3>
              <p className="text-blue-100 mb-4">Join thousands of players already enjoying fast, affordable blockchain gaming on PulseChain.</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <a
                  href="https://pulsechain.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-white text-blue-600 px-6 py-2 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
                >
                  Visit PulseChain.com
                </a>
                <a
                  href="https://docs.pulsechain.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-white text-white px-6 py-2 rounded-lg font-semibold hover:bg-white/10 transition-colors"
                >
                  Developer Docs
                </a>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}