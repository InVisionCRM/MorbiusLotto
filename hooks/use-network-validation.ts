import { useChainId, useSwitchChain } from 'wagmi'
import { pulsechain } from '@/lib/chains'
import { useEffect } from 'react'
import { toast } from 'sonner'

export function useNetworkValidation() {
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()

  const isOnPulseChain = chainId === pulsechain.id

  useEffect(() => {
    if (!isOnPulseChain && chainId) {
      console.warn(`⚠️ Wrong network detected. Current: ${chainId}, Expected: ${pulsechain.id}`)
      toast.warning('Please switch to PulseChain network to use this app.')
    }
  }, [chainId, isOnPulseChain])

  const switchToPulseChain = async () => {
    try {
      await switchChainAsync({ chainId: pulsechain.id })
      toast.success('Switched to PulseChain!')
    } catch (error) {
      console.error('Failed to switch network:', error)
      toast.error('Failed to switch to PulseChain. Please switch manually in your wallet.')
    }
  }

  return {
    isOnPulseChain,
    switchToPulseChain,
    currentChainId: chainId
  }
}