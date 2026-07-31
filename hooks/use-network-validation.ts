import { useChainId, useSwitchChain } from 'wagmi'
import { pulsechain } from '@/lib/chains'
import { toast } from 'sonner'

export function useNetworkValidation() {
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()

  const isOnPulseChain = chainId === pulsechain.id

  // No wrong-network toast here: ChainGuard (mounted once in providers.tsx) both
  // auto-switches and owns the single notification. This hook previously fired a
  // toast from every component that called it — and fired it while disconnected
  // too, since wagmi still reports a chainId then.

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