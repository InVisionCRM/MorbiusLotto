import { createConfig, http } from 'wagmi'
import { pulsechain } from './chains'
import { walletConnect, injected } from 'wagmi/connectors'

export const config = createConfig({
  chains: [pulsechain],
  connectors: [
    walletConnect({ projectId: '21fef48091f12692cad574a6f7753643' }),
    injected(),
  ],
  transports: {
    [pulsechain.id]: http(),
  },
  ssr: true,
})
