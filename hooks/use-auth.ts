import { useState, useEffect, useCallback } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { AuthSession, SignedMessage, generateAuthMessage, createSession, saveSession, loadSession, clearSession, isSessionValid } from '@/lib/auth'

export function useAuth() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync, isPending: isSigning } = useSignMessage()

  const [session, setSession] = useState<AuthSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load session on mount
  useEffect(() => {
    const storedSession = loadSession()
    setSession(storedSession)
    setIsLoading(false)
  }, [])

  // Clear session when wallet disconnects
  useEffect(() => {
    if (!isConnected) {
      setSession(null)
      clearSession()
    }
  }, [isConnected])

  // Invalidate session when the connected account changes (wallet switch without disconnect)
  useEffect(() => {
    if (!isConnected || !address || !session) return
    if (session.address.toLowerCase() !== address.toLowerCase()) {
      setSession(null)
      clearSession()
    }
  }, [isConnected, address, session])

  // Sign in function
  const signIn = useCallback(async (): Promise<boolean> => {
    if (!address || !isConnected) {
      throw new Error('Wallet not connected')
    }

    try {
      const message = generateAuthMessage(address)
      const signature = await signMessageAsync({ message })

      const signedMessage: SignedMessage = {
        message,
        signature,
        address
      }

      const newSession = createSession(signedMessage)
      setSession(newSession)
      saveSession(newSession)

      return true
    } catch (error) {
      console.error('Sign in failed:', error)
      return false
    }
  }, [address, isConnected, signMessageAsync])

  // Sign out function
  const signOut = useCallback(() => {
    setSession(null)
    clearSession()
  }, [])

  // Check if user is authenticated
  const isAuthenticated = session !== null && isSessionValid(session)

  return {
    // State
    session,
    isAuthenticated,
    isLoading,
    isSigning,

    // Actions
    signIn,
    signOut,

    // Utilities
    address,
    isConnected
  }
}