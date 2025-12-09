/**
 * Utility functions for managing wallet connection state
 */

/**
 * Clears WalletConnect cached data from localStorage
 * Call this if users experience persistent connection issues
 */
export function clearWalletConnectCache() {
  if (typeof window === 'undefined') return

  try {
    const keysToRemove: string[] = []

    // Find all WalletConnect and Wagmi related keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (
        key.startsWith('wc@2:') ||
        key.startsWith('wagmi.') ||
        key.startsWith('WALLETCONNECT_') ||
        key.includes('walletconnect')
      )) {
        keysToRemove.push(key)
      }
    }

    // Remove all found keys
    keysToRemove.forEach(key => {
      localStorage.removeItem(key)
    })

    console.log(`Cleared ${keysToRemove.length} WalletConnect cache entries`)
    return keysToRemove.length
  } catch (error) {
    console.error('Error clearing WalletConnect cache:', error)
    return 0
  }
}

/**
 * Checks if WalletConnect cache might be corrupted
 * Returns true if cache should be cleared
 */
export function isWalletConnectCacheCorrupted(): boolean {
  if (typeof window === 'undefined') return false

  try {
    // Check for common signs of corrupted cache
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('wc@2:')) {
        const value = localStorage.getItem(key)
        if (!value) continue

        try {
          JSON.parse(value)
        } catch {
          // Found unparseable WalletConnect data
          return true
        }
      }
    }
    return false
  } catch (error) {
    console.error('Error checking WalletConnect cache:', error)
    return true
  }
}

/**
 * Reset wallet connection state
 * Useful when switching accounts or experiencing connection issues
 */
export function resetWalletConnection() {
  if (typeof window === 'undefined') return

  try {
    // Clear WalletConnect cache
    clearWalletConnectCache()

    // Force page reload to reinitialize connections
    window.location.reload()
  } catch (error) {
    console.error('Error resetting wallet connection:', error)
  }
}
