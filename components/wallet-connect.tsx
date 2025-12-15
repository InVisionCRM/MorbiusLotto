'use client'

import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Wallet, ChevronDown, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { pulsechain } from '@/lib/chains'

export function WalletConnect() {
  const { address, isConnected, connector } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()
  const [isOpen, setIsOpen] = useState(false)

  // Filter out injected connector if user is already connected
  const availableConnectors = connectors.filter(c =>
    c.id !== 'injected' || !isConnected
  )

  if (isConnected && address) {
    const isWrongNetwork = chainId !== pulsechain.id

    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className={`px-3 py-1.5 text-sm font-medium border border-white/20 transition-colors ${
              isWrongNetwork
                ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/50'
                : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Wallet className="h-4 w-4 mr-2" />
            {address.slice(0, 6)}...{address.slice(-4)}
            <ChevronDown className="h-3 w-3 ml-2" />
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-black/95 border-white/20 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg">Wallet Connected</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/70">Address</span>
                <a
                  href={`https://scan.pulsechain.box/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 flex items-center gap-1 text-sm"
                >
                  {address.slice(0, 10)}...{address.slice(-8)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/70">Network</span>
                <span className={`text-sm ${isWrongNetwork ? 'text-red-400' : 'text-green-400'}`}>
                  {isWrongNetwork ? 'Wrong Network' : 'PulseChain'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/70">Connector</span>
                <span className="text-sm text-white/90">{connector?.name || 'Unknown'}</span>
              </div>
            </div>

            {isWrongNetwork && (
              <Button
                onClick={async () => {
                  try {
                    await switchChainAsync({ chainId: pulsechain.id })
                  } catch (err) {
                    console.error('Failed to switch network:', err)
                  }
                }}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                Switch to PulseChain
              </Button>
            )}

            <Button
              onClick={() => {
                disconnect()
                setIsOpen(false)
              }}
              variant="outline"
              className="w-full border-white/30 text-white hover:bg-white/10"
            >
              Disconnect
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="px-3 py-1.5 text-sm font-medium bg-white text-black rounded-lg hover:bg-white/90 transition-colors">
          Connect Wallet
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-black/95 border-white/20 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg">Connect Wallet</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {availableConnectors.map((connector) => (
            <Button
              key={connector.id}
              onClick={() => {
                connect({ connector })
                setIsOpen(false)
              }}
              disabled={isPending}
              className="w-full justify-start bg-white/10 hover:bg-white/20 text-white border border-white/20"
            >
              <Wallet className="h-4 w-4 mr-3" />
              {connector.name}
            </Button>
          ))}

          {error && (
            <div className="text-red-400 text-sm text-center mt-3">
              {error.message}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
