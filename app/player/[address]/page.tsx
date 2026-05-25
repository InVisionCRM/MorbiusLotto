import { isAddress, getAddress } from 'viem'
import PlayerProfilePageClient from './PlayerProfilePageClient'

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

  return <PlayerProfilePageClient normalizedAddress={normalizedAddress} />
}
