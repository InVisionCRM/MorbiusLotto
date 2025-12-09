'use client'

import { useAccount, useConnections } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { clearWalletConnectCache, isWalletConnectCacheCorrupted } from '@/lib/wallet-utils'
import { AlertCircle, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'

/**
 * Debug component to help diagnose and fix wallet connection issues
 * Add this temporarily to your page when troubleshooting
 */
export function WalletDebug() {
  const { address, isConnected, connector } = useAccount()
  const connections = useConnections()
  const [cacheCleared, setCacheCleared] = useState(false)
  const [cacheCorrupted, setCacheCorrupted] = useState(false)

  const handleClearCache = () => {
    const clearedCount = clearWalletConnectCache()
    setCacheCleared(true)
    alert(`Cleared ${clearedCount} cache entries. Please reconnect your wallet.`)
  }

  const handleCheckCache = () => {
    const corrupted = isWalletConnectCacheCorrupted()
    setCacheCorrupted(corrupted)
    if (corrupted) {
      alert('Cache corruption detected! Click "Clear Cache" to fix.')
    } else {
      alert('Cache looks healthy.')
    }
  }

  return (
    <Card className="p-4 space-y-3 border-yellow-500/50 bg-yellow-500/5">
      <div className="flex items-center gap-2 text-yellow-500">
        <AlertCircle className="h-4 w-4" />
        <h3 className="font-semibold">Wallet Debug Panel</h3>
      </div>

      <div className="space-y-1 text-xs">
        <div>
          <strong>Connected:</strong> {isConnected ? 'Yes' : 'No'}
        </div>
        <div>
          <strong>Address:</strong> {address || 'None'}
        </div>
        <div>
          <strong>Connector:</strong> {connector?.name || 'None'}
        </div>
        <div>
          <strong>Active Connections:</strong> {connections.length}
        </div>
        {cacheCorrupted && (
          <div className="text-red-500">
            <strong>Cache Status:</strong> Corrupted - needs clearing!
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleCheckCache}
          variant="outline"
          size="sm"
          className="flex-1"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Check Cache
        </Button>
        <Button
          onClick={handleClearCache}
          variant="outline"
          size="sm"
          className="flex-1"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Clear Cache
        </Button>
      </div>

      {cacheCleared && (
        <p className="text-xs text-green-500">
          Cache cleared successfully! Reconnect your wallet.
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Remove this component in production
      </p>
    </Card>
  )
}
