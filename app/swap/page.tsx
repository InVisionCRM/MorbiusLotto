'use client'

import { useState } from 'react'
import { ContractAddress } from '@/components/ui/contract-address'
import { MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'
import Footer from '@/components/PLINKO/Footer'
import GlobalMainNav from '@/components/shared/GlobalMainNav'
import { MorbiusLoadingChip } from '@/components/shared/MorbiusLoadingChip'

export default function SwapPage() {
  const [isLoading, setIsLoading] = useState(true)

  return (
    <GlobalMainNav>
      <div className="min-h-screen bg-black text-white pt-4 md:pt-2">
        {/* Main Content */}
        <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold text-center mb-4 bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
            Buy Morbius
          </h1>

          {/* Morbius Token Address */}
          <div className="mb-8 flex justify-center">
            <ContractAddress
              address={MORBIUS_TOKEN_ADDRESS}
              label="Morbius Token"
            />
          </div>

          {/* Iframe Container */}
          <div className="relative w-full h-[80vh] bg-black/50 rounded-lg overflow-hidden border border-cyan-500/30">
            {isLoading && (
              <>
                <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
                  <div className="text-center">
                    <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-white/60">Loading Internet Money Swap...</p>
                  </div>
                </div>
                <MorbiusLoadingChip />
              </>
            )}
            <iframe
              src="https://swap.internetmoney.io/"
              className="w-full h-full"
              title="Internet Money Swap"
              allow="clipboard-write"
              onLoad={() => setIsLoading(false)}
            />
          </div>

          {/* Footer Text */}
          <div className="text-center mt-6 text-white/60 text-sm">
            <p>Secure token swaps powered by Internet Money Wallet</p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
    </GlobalMainNav>
  )
}