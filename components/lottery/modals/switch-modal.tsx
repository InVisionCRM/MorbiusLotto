'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'

export function SwitchModal() {
  const { isConnected } = useAccount()

  return (
    <div className="w-full">
      {!isConnected ? (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-white/60 text-sm mb-2">Connect your wallet to use the swap feature</p>
          <ConnectButton showBalance={false} />
        </div>
      ) : (
        <iframe
          src="https://switch.win/widget?network=pulsechain&background_color=000000&font_color=ffffff&secondary_font_color=ffffff&border_color=ffffff&backdrop_color=transparent&from=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee&to=0xB5C4ecEF450fd36d0eBa1420F6A19DBfBeE5292e"
          allow="clipboard-read; clipboard-write"
          width="100%"
          height="900px"
          className="border-0 rounded-lg"
        />
      )}
    </div>
  )
}

