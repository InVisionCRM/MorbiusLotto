import { useEffect, useState } from 'react'
import { useReadContract, useWriteContract, useWatchContractEvent } from 'wagmi'
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2'
import { HEX_TOKEN_ADDRESS, LOTTERY_ADDRESS, PSSH_TOKEN_ADDRESS } from '@/lib/contracts'
import { pulsechain } from '@/lib/chains'

// Read current round information
export function useCurrentRound() {
  const isValidAddress = (LOTTERY_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getCurrentRoundInfo',
    query: {
      enabled: isValidAddress,
      refetchInterval: isValidAddress ? 5000 : false, // Refetch every 5 seconds
    },
  })
}

// Read player's tickets for a specific round
export function usePlayerTickets(roundId: number, playerAddress?: `0x${string}`) {
  return useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getPlayerTickets',
    args: playerAddress ? [BigInt(roundId), playerAddress] : undefined,
    query: {
      enabled: !!playerAddress,
    },
  })
}

// Read player's round history
export function usePlayerRoundHistory(playerAddress?: `0x${string}`, start = 0, count = 10) {
  const isValidAddress = (LOTTERY_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getPlayerRoundHistory',
    args: playerAddress ? [playerAddress, BigInt(start), BigInt(count)] : undefined,
    query: {
      enabled: isValidAddress && !!playerAddress,
    },
  })
}

// Read player's lifetime stats
export function usePlayerLifetime(playerAddress?: `0x${string}`) {
  const isValidAddress = (LOTTERY_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getPlayerLifetime',
    args: playerAddress ? [playerAddress] : undefined,
    query: {
      enabled: isValidAddress && !!playerAddress,
      refetchInterval: 5000,
    },
  })
}

// Read house (contract's) ticket for a specific round
export function useHouseTicket(roundId: number) {
  const isValidAddress = (LOTTERY_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getPlayerTickets',
    args: [BigInt(roundId), LOTTERY_ADDRESS as `0x${string}`],
    query: {
      enabled: isValidAddress && roundId > 0,
      refetchInterval: 5000, // Refetch every 5 seconds
    },
  })
}

// Read round history
export function useRound(roundId: number) {
  const isValidAddress = (LOTTERY_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getRound',
    args: [BigInt(roundId)],
    query: {
      enabled: isValidAddress && roundId > 0,
      refetchInterval: 5000, // Refetch every 5 seconds to catch finalized rounds
    },
  })
}

// Read MegaMillions bank balance
export function useMegaMillionsBank() {
  const isValidAddress = (LOTTERY_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getMegaMillionsBank',
    query: {
      enabled: isValidAddress,
      refetchInterval: isValidAddress ? 10000 : false, // Refetch every 10 seconds
    },
  })
}

// Read HEX jackpot balance
export function useHexJackpot() {
  const [data, setData] = useState<bigint>(BigInt(0))
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let mounted = true
    const fetchHex = async () => {
      if ((LOTTERY_ADDRESS as string) === '0x0000000000000000000000000000000000000000') return
      setIsLoading(true)
      try {
        const res = await fetch(
          `https://scan.pulsechain.box/api/v2/addresses/${LOTTERY_ADDRESS}/token-balances`
        )
        if (!res.ok) throw new Error(`API error: ${res.status}`)
        const json = await res.json()
        const hexEntry = Array.isArray(json)
          ? json.find((item: any) => item?.token?.address?.toLowerCase() === HEX_TOKEN_ADDRESS.toLowerCase())
          : null
        if (hexEntry && mounted) {
          const decimals = parseInt(hexEntry.token.decimals || '8', 10) || 8
          const raw = BigInt(hexEntry.value || 0)
          setData(raw)
        } else if (mounted) {
          setData(BigInt(0))
        }
        setError(null)
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error('HEX fetch failed'))
          setData(BigInt(0))
        }
      } finally {
        mounted && setIsLoading(false)
      }
    }
    fetchHex()
    const id = setInterval(fetchHex, 10000)
    return () => {
      mounted = false
      clearInterval(id)
    }
  }, [])

  return { data, isLoading, error }
}

// Read player's claimable winnings for a round
export function useClaimableWinnings(roundId: number, playerAddress?: `0x${string}`) {
  return useReadContract({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getClaimableWinnings',
    args: playerAddress ? [BigInt(roundId), playerAddress] : undefined,
    query: {
      enabled: !!playerAddress,
    },
  })
}

// Write: Buy tickets with pSSH
export function useBuyTickets() {
  const { writeContract, ...rest } = useWriteContract()

  const buyTickets = (tickets: number[][]) => {
    // Convert to uint8[6][] format
    const formattedTickets = tickets.map(ticket =>
      ticket.map(n => n as number)
    ) as unknown as readonly [number, number, number, number, number, number][]

    writeContract({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'buyTickets',
      args: [formattedTickets as any],
      chainId: pulsechain.id,
    })
  }

  return { buyTickets, ...rest }
}

// Write: Buy tickets for multiple rounds (pSSH only)
export function useBuyTicketsForRounds() {
  const { writeContract, ...rest } = useWriteContract()

  const buyTicketsForRounds = (ticketGroups: number[][][], offsets: number[]) => {
    const formattedGroups = ticketGroups.map(group =>
      group.map(ticket => ticket.map(n => n as number))
    ) as unknown as readonly [readonly [number, number, number, number, number, number][]][]

    const formattedOffsets = offsets.map(o => BigInt(o))

    // Calculate total tickets across all groups for gas estimation
    const totalTickets = ticketGroups.reduce((sum, group) => sum + group.length, 0)

    writeContract({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'buyTicketsForRounds',
      args: [formattedGroups as any, formattedOffsets as any],
      chainId: pulsechain.id,
    })
  }

  return { buyTicketsForRounds, ...rest }
}

// Write: Buy tickets with WPLS (supports extra buffer)
export function useBuyTicketsWithWPLS(defaultExtraBufferBp: number = 2500) {
  const { writeContract, ...rest } = useWriteContract()

  const buyTicketsWithWPLS = (tickets: number[][], extraBufferBp?: number) => {
    const bufferBp = extraBufferBp ?? defaultExtraBufferBp
    // Convert to uint8[6][] format
    const formattedTickets = tickets.map(ticket =>
      ticket.map(n => n as number)
    ) as unknown as readonly [number, number, number, number, number, number][]

    writeContract({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'buyTicketsWithWPLSAndBuffer',
      args: [formattedTickets as any, BigInt(bufferBp)],
      chainId: pulsechain.id,
    })
  }

  return { buyTicketsWithWPLS, ...rest }
}

// Write: Buy tickets with native PLS (wraps and swaps on-chain)
export function useBuyTicketsWithPLS() {
  const { writeContract, ...rest } = useWriteContract()

  const buyTicketsWithPLS = (tickets: number[][], valueWei: bigint) => {
    const formattedTickets = tickets.map(ticket => ticket.map(n => n as number)) as unknown as readonly [number, number, number, number, number, number][]

    writeContract({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'buyTicketsWithPLS',
      args: [formattedTickets as any],
      chainId: pulsechain.id,
      value: valueWei,
    })
  }

  return { buyTicketsWithPLS, ...rest }
}

// Write: Finalize round
export function useFinalizeRound() {
  const { writeContract, ...rest } = useWriteContract()

  const finalizeRound = () => {
    writeContract({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'finalizeRound',
      chainId: pulsechain.id,
    })
  }

  return { finalizeRound, ...rest }
}

// Write: Claim winnings
export function useClaimWinnings() {
  const { writeContract, ...rest } = useWriteContract()

  const claimWinnings = (roundId: number) => {
    writeContract({
      address: LOTTERY_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'claimWinnings',
      args: [BigInt(roundId)],
      chainId: pulsechain.id,
    })
  }

  return { claimWinnings, ...rest }
}

// Watch for RoundFinalized events
export function useWatchRoundFinalized(
  onRoundFinalized: (roundId: bigint, winningNumbers: number[], totalPssh: bigint) => void
) {
  useWatchContractEvent({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    eventName: 'RoundFinalized',
    onLogs(logs) {
      logs.forEach((log: any) => {
        if (log.args?.roundId && log.args?.winningNumbers && log.args?.totalPssh) {
          onRoundFinalized(
            log.args.roundId,
            Array.from(log.args.winningNumbers).map(n => Number(n)),
            log.args.totalPssh
          )
        }
      })
    },
  })
}

// Watch for TicketsPurchased events
export function useWatchTicketsPurchased(
  playerAddress: `0x${string}` | undefined,
  onTicketsPurchased: (roundId: bigint, ticketCount: bigint) => void
) {
  useWatchContractEvent({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    eventName: 'TicketsPurchased',
    args: playerAddress ? { player: playerAddress } : undefined,
    onLogs(logs) {
      logs.forEach((log: any) => {
        if (log.args?.roundId && log.args?.ticketCount) {
          onTicketsPurchased(log.args.roundId, log.args.ticketCount)
        }
      })
    },
  })
}

// Watch for MegaMillions triggered events
export function useWatchMegaMillions(
  onMegaMillions: (roundId: bigint, bankAmount: bigint) => void
) {
  useWatchContractEvent({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    eventName: 'MegaMillionsTriggered',
    onLogs(logs) {
      logs.forEach((log: any) => {
        if (log.args?.roundId && log.args?.bankAmount) {
          onMegaMillions(log.args.roundId, log.args.bankAmount)
        }
      })
    },
  })
}

// Watch for HEX overlay triggered events
export function useWatchHexOverlay(
  onHexOverlay: (roundId: bigint, hexAmount: bigint) => void
) {
  useWatchContractEvent({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    eventName: 'HexOverlayTriggered',
    onLogs(logs) {
      logs.forEach((log: any) => {
        if (log.args?.roundId && log.args?.hexAmount) {
          onHexOverlay(log.args.roundId, log.args.hexAmount)
        }
      })
    },
  })
}

// Watch for free tickets credited events
export function useWatchFreeTickets(
  playerAddress: `0x${string}` | undefined,
  onFreeTickets: (credits: bigint) => void
) {
  useWatchContractEvent({
    address: LOTTERY_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    eventName: 'FreeTicketsCredited',
    args: playerAddress ? { player: playerAddress } : undefined,
    onLogs(logs) {
      logs.forEach((log: any) => {
        if (log.args?.credits) {
          onFreeTickets(log.args.credits)
        }
      })
    },
  })
}
