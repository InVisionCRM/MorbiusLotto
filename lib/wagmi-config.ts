import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { pulsechain } from './chains'

export const config = getDefaultConfig({
  appName: 'Morbius Lotto',
  projectId: '21fef48091f12692cad574a6f7753643',
  chains: [pulsechain],
  ssr: true,
})
