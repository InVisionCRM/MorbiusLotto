import { useWalletDetection } from '@/hooks/use-wallet-detection'
import { useNetworkValidation } from '@/hooks/use-network-validation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function WalletDebug() {
  const {
    isInternetMoney,
    isMetaMask,
    isWalletConnect,
    isMobile,
    connectorName,
    connectorId,
    clearWalletCache,
    address,
    isConnected
  } = useWalletDetection()

  const { isOnPulseChain, currentChainId, switchToPulseChain } = useNetworkValidation()

  const clearAllCache = () => {
    // Clear all wallet-related cache
    clearWalletCache()

    // Also clear localStorage items that might cause issues
    if (typeof window !== 'undefined') {
      try {
        const keys = Object.keys(localStorage)
        keys.forEach(key => {
          if (key.includes('wallet') ||
              key.includes('WALLETCONNECT') ||
              key.includes('wc@') ||
              key.includes('rainbow')) {
            localStorage.removeItem(key)
          }
        })
        console.log('🧹 Cleared all wallet cache')
        // Reload to reinitialize connections
        window.location.reload()
      } catch (error) {
        console.error('Failed to clear cache:', error)
      }
    }
  }

  // Only show in development or when explicitly enabled
  if (process.env.NODE_ENV === 'production') return null

  return (
    <Card className="p-4 m-4 bg-gray-900 border-gray-700">
      <h3 className="text-lg font-bold mb-3 text-white">🔧 Wallet Debug</h3>

      <div className="space-y-2 text-sm">
        <div>Connected: <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
          {isConnected ? '✅' : '❌'}
        </span></div>

        <div>Address: <span className="font-mono text-xs">
          {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'None'}
        </span></div>

        <div>Network: <span className={isOnPulseChain ? 'text-green-400' : 'text-red-400'}>
          {isOnPulseChain ? 'PulseChain ✅' : `Chain ${currentChainId} ❌`}
        </span></div>

        <div>Connector: <span className="font-mono text-xs">
          {connectorName || 'None'} ({connectorId || 'none'})
        </span></div>

        <div>Wallet Type:
          {isInternetMoney && <span className="text-purple-400 ml-2">🌐 Internet Money</span>}
          {isMetaMask && <span className="text-orange-400 ml-2">🦊 MetaMask</span>}
          {isWalletConnect && <span className="text-blue-400 ml-2">🔗 WalletConnect</span>}
          {!isInternetMoney && !isMetaMask && !isWalletConnect && <span className="text-gray-400 ml-2">Unknown</span>}
        </div>

        <div>Device: <span className={isMobile ? 'text-blue-400' : 'text-green-400'}>
          {isMobile ? '📱 Mobile' : '💻 Desktop'}
        </span></div>
      </div>

      <div className="flex gap-2 mt-4">
        <Button
          onClick={clearAllCache}
          variant="outline"
          size="sm"
          className="text-xs"
        >
          🧹 Clear Cache & Reload
        </Button>

        {!isOnPulseChain && (
          <Button
            onClick={switchToPulseChain}
            variant="outline"
            size="sm"
            className="text-xs"
          >
            🔄 Switch to PulseChain
          </Button>
        )}
      </div>
    </Card>
  )
}