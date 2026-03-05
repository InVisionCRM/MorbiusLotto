import { useEffect, useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWatchContractEvent } from 'wagmi'
import { LOTTERY_6OF55_V2_ABI } from '@/abi/lottery6of55-v2'
import { HEX_TOKEN_ADDRESS, LOTTERY_INSTANT_ADDRESS, MORBIUS_TOKEN_ADDRESS } from '@/lib/contracts'
import { pulsechain } from '@/lib/chains'

// Read current round information
export function useCurrentRound() {
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getCurrentRoundInfo',
    query: {
      enabled: isValidAddress,
      refetchInterval: 10000, // Poll every 10 seconds for auto-refresh
    },
  })
}

// Read player's tickets for a specific round
export function usePlayerTickets(roundId: number, playerAddress?: `0x${string}`) {
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
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
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
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
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
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
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getPlayerTickets',
    args: [BigInt(roundId), LOTTERY_INSTANT_ADDRESS as `0x${string}`],
    query: {
      enabled: isValidAddress && roundId > 0,
      refetchInterval: 5000, // Refetch every 5 seconds
    },
  })
}

// Read round players array
export function useRoundPlayers(roundId: number) {
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'roundPlayers',
    args: [BigInt(roundId)],
    query: {
      enabled: isValidAddress && roundId > 0,
    },
  })
}

// Read round history
export function useRound(roundId: number) {
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getRound',
    args: [BigInt(roundId)],
    query: {
      enabled: isValidAddress && roundId > 0,
      refetchInterval: 5000, // Refetch every 5 seconds to catch finalized rounds
    },
  })
}

// Read MegaMORBIUS bank balance (progressive jackpot)
export function useMegaMillionsBank() {
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getMegaMORBIUSBank',
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
      if ((LOTTERY_INSTANT_ADDRESS as string) === '0x0000000000000000000000000000000000000000') return
      setIsLoading(true)
      try {
        const res = await fetch(
          `https://scan.pulsechain.box/api/v2/addresses/${LOTTERY_INSTANT_ADDRESS}/token-balances`
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
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getClaimableWinnings',
    args: playerAddress ? [BigInt(roundId), playerAddress] : undefined,
    query: {
      enabled: !!playerAddress,
    },
  })
}

// Read current round totals (roundId, totalMORBIUS, totalTickets, uniquePlayers, rolloverReserve, megaMORBIUSBank, currentRoundState)
export function useCurrentRoundTotals() {
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getCurrentRoundTotals',
    query: {
      enabled: isValidAddress,
      refetchInterval: 10000,
    },
  })
}

// Read pending MORBIUS and tickets for a future round
export function usePendingForRound(roundId: number) {
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getPendingForRound',
    args: [BigInt(roundId)],
    query: {
      enabled: isValidAddress && roundId > 0,
    },
  })
}

// Read rollover reserve and mega MORBIUS bank balances
export function useRolloverState() {
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getRolloverState',
    query: {
      enabled: isValidAddress,
      refetchInterval: 10000,
    },
  })
}

// Read bracket configuration (percentages and distribution)
export function useBracketConfig() {
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getBracketConfig',
    query: {
      enabled: isValidAddress,
    },
  })
}

// Read unclaimed winnings breakdown for a round
export function useUnclaimedForRound(roundId: number) {
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getUnclaimedForRound',
    args: [BigInt(roundId)],
    query: {
      enabled: isValidAddress && roundId > 0,
    },
  })
}

// Read total tickets ever sold across all rounds
export function useTotalTicketsEver() {
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getTotalTicketsEver',
    query: {
      enabled: isValidAddress,
      refetchInterval: 10000,
    },
  })
}

// Read total MORBIUS ever collected across all rounds
export function useTotalMORBIUSEverCollected() {
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getTotalMORBIUSEverCollected',
    query: {
      enabled: isValidAddress,
      refetchInterval: 10000,
    },
  })
}

// Read total MORBIUS ever claimed by winners
export function useTotalMORBIUSEverClaimed() {
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getTotalMORBIUSEverClaimed',
    query: {
      enabled: isValidAddress,
      refetchInterval: 10000,
    },
  })
}

// Read total outstanding claimable MORBIUS across all rounds
export function useTotalMORBIUSClaimableAll() {
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getTotalMORBIUSClaimableAll',
    query: {
      enabled: isValidAddress,
      refetchInterval: 10000,
    },
  })
}

// Read historical totals for a specific round
export function useRoundHistoryTotals(roundId: number) {
  const isValidAddress = (LOTTERY_INSTANT_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  return useReadContract({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    functionName: 'getRoundHistoryTotals',
    args: [BigInt(roundId)],
    query: {
      enabled: isValidAddress && roundId > 0,
    },
  })
}

// Write: Buy tickets with MORBIUS
export function useBuyTickets() {
  const { address } = useAccount()
  const { writeContract, ...rest } = useWriteContract()

  const buyTickets = (tickets: number[][]) => {
    // Validate tickets first
    for (const ticket of tickets) {
      if (ticket.length !== 6) {
        throw new Error(`Invalid ticket length: expected 6 numbers, got ${ticket.length}`)
      }
      for (const n of ticket) {
        if (n < 1 || n > 55) {
          throw new Error(`Invalid number ${n}: must be between 1-55`)
        }
      }
    }

    console.log('🛒 buyTickets: raw tickets:', tickets)

    // Convert to the exact format expected by the contract: uint8[6][]
    // wagmi/viem should handle the conversion from number[][] to uint8[6][]
    writeContract({
      address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'buyTickets',
      args: [tickets as any], // Type assertion needed for wagmi
      chain: pulsechain,
      account: address!,
      maxPriorityFeePerGas: 40_000n, // PulseChain tip
    })
  }

  return { buyTickets, ...rest }
}

// Write: Buy tickets for multiple rounds (MORBIUS only)
export function useBuyTicketsForRounds() {
  const { address } = useAccount()
  const { writeContract, ...rest } = useWriteContract()

  const buyTicketsForRounds = (ticketGroups: number[][][], offsets: number[]) => {
    const formattedGroups = ticketGroups.map(group =>
      group.map(ticket => ticket.map(n => n as number))
    ) as unknown as readonly [readonly [number, number, number, number, number, number][]][]

    const formattedOffsets = offsets.map(o => BigInt(o))

    // Calculate total tickets across all groups for gas estimation
    const totalTickets = ticketGroups.reduce((sum, group) => sum + group.length, 0)

    writeContract({
      address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'buyTicketsForRounds',
      args: [formattedGroups as any, formattedOffsets as any],
      chain: pulsechain,
      account: address!,
      maxPriorityFeePerGas: 40_000n, // PulseChain tip
    })
  }

  return { buyTicketsForRounds, ...rest }
}

// Write: Buy tickets with WPLS (supports extra buffer)
export function useBuyTicketsWithWPLS(defaultExtraBufferBp: number = 2500) {
  const { address } = useAccount()
  const { writeContract, ...rest } = useWriteContract()

  const buyTicketsWithWPLS = (tickets: number[][], extraBufferBp?: number) => {
    const bufferBp = extraBufferBp ?? defaultExtraBufferBp
    // Convert to uint8[6][] format
    const formattedTickets = tickets.map(ticket =>
      ticket.map(n => n as number)
    ) as unknown as readonly [number, number, number, number, number, number][]

    writeContract({
      address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'buyTicketsWithWPLSAndBuffer',
      args: [formattedTickets as any, BigInt(bufferBp)],
      chain: pulsechain,
      account: address!,
      maxPriorityFeePerGas: 40_000n, // PulseChain tip
    })
  }

  return { buyTicketsWithWPLS, ...rest }
}

// Write: Buy tickets with native PLS (wraps and swaps on-chain)
export function useBuyTicketsWithPLS() {
  const { address } = useAccount()
  const { writeContract, ...rest } = useWriteContract()

  const buyTicketsWithPLS = (tickets: number[][], valueWei: bigint) => {
    const formattedTickets = tickets.map(ticket => ticket.map(n => n as number)) as unknown as readonly [number, number, number, number, number, number][]

    writeContract({
      address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'buyTicketsWithPLS',
      args: [formattedTickets as any],
      chain: pulsechain,
      account: address!,
      value: valueWei,
      maxPriorityFeePerGas: 40_000n, // PulseChain tip
    })
  }

  return { buyTicketsWithPLS, ...rest }
}

// Write: Buy tickets for multiple rounds with native PLS (wraps and swaps on-chain)
export function useBuyTicketsWithPLSForRounds() {
  const { address } = useAccount()
  const { writeContract, ...rest } = useWriteContract()

  const buyTicketsWithPLSForRounds = (ticketGroups: number[][][], offsets: number[], valueWei: bigint) => {
    const formattedGroups = ticketGroups.map(group =>
      group.map(ticket => ticket.map(n => n as number))
    ) as unknown as readonly [readonly [number, number, number, number, number, number][]][]

    const formattedOffsets = offsets.map(o => BigInt(o))

    writeContract({
      address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'buyTicketsWithPLSForRounds',
      args: [formattedGroups as any, formattedOffsets as any],
      chain: pulsechain,
      account: address!,
      value: valueWei,
      maxPriorityFeePerGas: 40_000n, // PulseChain tip
    })
  }

  return { buyTicketsWithPLSForRounds, ...rest }
}

// Write: Finalize round
export function useFinalizeRound() {
  const { address } = useAccount()
  const { writeContract, ...rest } = useWriteContract()

  const finalizeRound = () => {
    writeContract({
      address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'finalizeRound',
      chain: pulsechain,
      account: address!,
      maxPriorityFeePerGas: 40_000n, // PulseChain tip
    })
  }

  return { finalizeRound, ...rest }
}

// Write: Claim winnings
export function useClaimWinnings() {
  const { address } = useAccount()
  const { writeContract, ...rest } = useWriteContract()

  const claimWinnings = (roundId: number) => {
    writeContract({
      address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
      abi: LOTTERY_6OF55_V2_ABI,
      functionName: 'claimWinnings',
      args: [BigInt(roundId)],
      chain: pulsechain,
      account: address!,
      maxPriorityFeePerGas: 40_000n, // PulseChain tip
    })
  }

  return { claimWinnings, ...rest }
}

// Watch for RoundFinalized events
export function useWatchRoundFinalized(
  onRoundFinalized: (roundId: bigint, winningNumbers: number[], totalMORBIUS: bigint) => void
) {
  useWatchContractEvent({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    eventName: 'RoundFinalized',
    onLogs(logs) {
      logs.forEach((log: any) => {
        if (log.args?.roundId && log.args?.winningNumbers && log.args?.totalMORBIUS) {
          onRoundFinalized(
            log.args.roundId,
            Array.from(log.args.winningNumbers).map(n => Number(n)),
            log.args.totalMORBIUS
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
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
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
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
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
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
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
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
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

// Watch for multi-round purchases
export function useWatchMultiRoundPurchases(
  playerAddress: `0x${string}` | undefined,
  onMultiRoundPurchase: (roundIds: readonly bigint[], ticketCounts: readonly bigint[], transactionHash: string) => void
) {
  useWatchContractEvent({
    address: LOTTERY_INSTANT_ADDRESS as `0x${string}`,
    abi: LOTTERY_6OF55_V2_ABI,
    eventName: 'TicketsPurchasedForRounds',
    args: playerAddress ? { player: playerAddress } : undefined,
    onLogs(logs) {
      logs.forEach((log: any) => {
        if (log.args?.roundIds && log.args?.ticketCounts && log.transactionHash) {
          onMultiRoundPurchase(
            log.args.roundIds,
            log.args.ticketCounts,
            log.transactionHash
          )
        }
      })
    },
  })
}