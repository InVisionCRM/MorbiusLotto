import { useAccount, usePublicClient } from 'wagmi'
import { useMemo } from 'react'

export function useWalletDetection() {
  const { connector, address, isConnected } = useAccount()
  const publicClient = usePublicClient()

  const walletInfo = useMemo(() => {
    const connectorName = connector?.name?.toLowerCase() || ''
    const connectorId = connector?.id?.toLowerCase() || ''

    const isInternetMoney = connectorName.includes('internet money') ||
                           connectorId.includes('internetmoney') ||
                           connectorName.includes('internet-money')

    const isMetaMask = connectorName.includes('metamask') ||
                      connectorId.includes('metamask')

    const isWalletConnect = connectorName.includes('walletconnect') ||
                           connectorId.includes('walletconnect')

    const isMobile = typeof window !== 'undefined' &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

    return {
      isInternetMoney,
      isMetaMask,
      isWalletConnect,
      isMobile,
      connectorName: connector?.name,
      connectorId: connector?.id
    }
  }, [connector])

  // Custom gas estimation for problematic wallets
  const getSafeGasEstimate = async (tx: any) => {
    if (!publicClient) {
      console.warn('No public client available, using fallback gas estimate')
      return BigInt(1500000)
    }

    try {
      if (walletInfo.isInternetMoney) {
        // Internet Money needs conservative gas estimation
        console.log('🌐 Using conservative gas estimation for Internet Money')

        try {
          let gasEstimate = await publicClient.estimateGas(tx)
          // Add 40% buffer for Internet Money
          gasEstimate = gasEstimate * BigInt(140) / BigInt(100)

          // Cap at reasonable limit
          const maxGas = BigInt(2000000)
          return gasEstimate > maxGas ? maxGas : gasEstimate
        } catch (error) {
          console.warn('🌐 Gas estimation failed for Internet Money, using fallback:', error)
          // Fallback for complex transactions
          return BigInt(1500000)
        }
      }

      // Standard estimation for other wallets
      return await publicClient.estimateGas(tx)
    } catch (error) {
      console.warn('Gas estimation failed, using fallback:', error)
      return BigInt(1000000)
    }
  }

  // Clear cache for problematic connections
  const clearWalletCache = () => {
    if (typeof window === 'undefined') return

    try {
      const keys = Object.keys(localStorage)
      const walletKeys = keys.filter(key =>
        key.includes('walletconnect') ||
        key.includes('wagmi') ||
        key.includes('rainbow') ||
        key.startsWith('wc@2:')
      )

      walletKeys.forEach(key => {
        localStorage.removeItem(key)
      })

      console.log(`🧹 Cleared ${walletKeys.length} wallet cache entries`)
    } catch (error) {
      console.warn('Failed to clear wallet cache:', error)
    }
  }

  return {
    ...walletInfo,
    getSafeGasEstimate,
    clearWalletCache,
    address,
    isConnected
  }
}