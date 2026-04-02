import { isAddress, getAddress } from 'viem'
import PlayerProfilePageClient from './PlayerProfilePageClient'

type PlayerProfilePageProps = {
  params: {
    address: string
  }
}

export default function PlayerProfilePage({ params }: PlayerProfilePageProps) {
  const raw = params?.address
  const normalizedAddress =
    raw && raw.trim() && isAddress(raw.trim()) ? getAddress(raw.trim()) : null

  return <PlayerProfilePageClient normalizedAddress={normalizedAddress} />
}
