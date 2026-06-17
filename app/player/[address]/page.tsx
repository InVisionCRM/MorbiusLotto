import { isAddress, getAddress } from 'viem'
import { Chakra_Petch, JetBrains_Mono } from 'next/font/google'
import PlayerProfilePageClient from './PlayerProfilePageClient'

// "Deep-Sea Neon" arcade2 fonts — Chakra Petch display + JetBrains Mono numerals,
// to match the arcade games. next/font must run in this server component.
const arcDisplay = Chakra_Petch({ subsets: ['latin'], weight: ['500', '600', '700'], variable: '--font-arc-display' })
const arcMono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-arc-mono' })

type PlayerProfilePageProps = {
  params: Promise<{
    address: string
  }>
}

export default async function PlayerProfilePage({ params }: PlayerProfilePageProps) {
  const { address: raw } = await params
  const trimmed = raw?.trim()
  const normalizedAddress =
    trimmed && isAddress(trimmed, { strict: false }) ? getAddress(trimmed) : null

  return (
    <PlayerProfilePageClient
      normalizedAddress={normalizedAddress}
      fontClass={`${arcDisplay.variable} ${arcMono.variable}`}
    />
  )
}
