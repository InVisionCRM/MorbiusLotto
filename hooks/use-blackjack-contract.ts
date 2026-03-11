import { useReadContract, useWriteContract, useWatchContractEvent } from 'wagmi'
import { blackjackAbi } from '../abi/blackjack'
import { BLACKJACK_ADDRESS, BLACKJACK_LEGACY_ADDRESS, BLACKJACK_LEGACY_ADDRESS_2, BLACKJACK_LEGACY_ADDRESS_3, LEGACY_BLACKJACK_ADDRESSES } from '../lib/contracts'
import { useAccount } from 'wagmi'

const LEGACY_ZERO = '0x0000000000000000000000000000000000000000'

/** Valid Ethereum/PulseChain address: 0x + 40 hex chars (42 total). Rejects truncated env values. */
export function isLegacyAddress(addr: string | undefined): addr is `0x${string}` {
  return (
    typeof addr === 'string' &&
    addr.length === 42 &&
    addr.startsWith('0x') &&
    addr !== LEGACY_ZERO &&
    /^0x[0-9a-fA-F]{40}$/.test(addr)
  )
}

// ============ Read Hooks ============

/**
 * Get player's MORBIUS reserve balance
 */
export function usePlayerReserve() {
  const { address } = useAccount()
  const isValidAddress = (BLACKJACK_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'

  return useReadContract({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    functionName: 'getPlayerReserve',
    args: address ? [address] : undefined,
    query: {
      enabled: isValidAddress && !!address,
      refetchInterval: 10000,
    },
  })
}

/**
 * Get a specific player's MORBIUS reserve balance (for modals/profile viewing another address).
 */
export function usePlayerReserveForAddress(playerAddress: string | null) {
  const isValidAddress = (BLACKJACK_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'
  const addr = playerAddress
    ? (playerAddress.startsWith('0x') ? playerAddress : `0x${playerAddress}`) as `0x${string}`
    : undefined
  return useReadContract({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    functionName: 'getPlayerReserve',
    args: addr ? [addr] : undefined,
    query: {
      enabled: isValidAddress && !!playerAddress,
      refetchInterval: 10000,
    },
  })
}

/**
 * Get total reserves in contract
 */
export function useTotalReserves() {
  const isValidAddress = (BLACKJACK_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'

  return useReadContract({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    functionName: 'totalReserves',
    query: {
      enabled: isValidAddress,
      refetchInterval: 30000,
    },
  })
}

/**
 * Check if emergency pause is active
 */
export function useEmergencyPaused() {
  const isValidAddress = (BLACKJACK_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'

  return useReadContract({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    functionName: 'emergencyPaused',
    query: {
      enabled: isValidAddress,
      refetchInterval: 10000,
    },
  })
}

/**
 * Whether the main Blackjack contract is paused (OpenZeppelin Pausable).
 * Owner can pause/unpause; when true, deposit/withdraw/placeBet revert.
 */
export function useContractPaused() {
  const isValidAddress = (BLACKJACK_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'

  return useReadContract({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    functionName: 'paused',
    query: {
      enabled: isValidAddress,
      refetchInterval: 10000,
    },
  })
}

/**
 * Get daily withdrawal info for player
 */
export function useDailyWithdrawalInfo() {
  const { address } = useAccount()
  const isValidAddress = (BLACKJACK_ADDRESS as string) !== '0x0000000000000000000000000000000000000000'

  return useReadContract({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    functionName: 'getDailyWithdrawalInfo',
    args: address ? [address] : undefined,
    query: {
      enabled: isValidAddress && !!address,
      refetchInterval: 60000, // Check every minute
    },
  })
}

/**
 * Get player's reserve on a specific legacy Blackjack contract.
 * Pass BLACKJACK_LEGACY_ADDRESS, BLACKJACK_LEGACY_ADDRESS_2, or BLACKJACK_LEGACY_ADDRESS_3.
 */
export function useLegacyPlayerReserveAt(legacyAddress: string | undefined) {
  const { address } = useAccount()
  const enabled = isLegacyAddress(legacyAddress) && !!address
  return useReadContract({
    address: enabled ? (legacyAddress as `0x${string}`) : undefined,
    abi: blackjackAbi,
    functionName: 'getPlayerReserve',
    args: address ? [address] : undefined,
    query: {
      enabled,
      refetchInterval: 15000,
    },
  })
}

/**
 * Whether a specific legacy Blackjack contract is emergency-paused.
 */
export function useLegacyEmergencyPausedAt(legacyAddress: string | undefined) {
  const enabled = isLegacyAddress(legacyAddress)
  return useReadContract({
    address: enabled ? (legacyAddress as `0x${string}`) : undefined,
    abi: blackjackAbi,
    functionName: 'emergencyPaused',
    query: {
      enabled,
      refetchInterval: 15000,
    },
  })
}

/** @deprecated Use useLegacyPlayerReserveAt(BLACKJACK_LEGACY_ADDRESS) for first legacy */
export function useLegacyPlayerReserve() {
  return useLegacyPlayerReserveAt(BLACKJACK_LEGACY_ADDRESS)
}

/** @deprecated Use useLegacyEmergencyPausedAt(BLACKJACK_LEGACY_ADDRESS) for first legacy */
export function useLegacyEmergencyPaused() {
  return useLegacyEmergencyPausedAt(BLACKJACK_LEGACY_ADDRESS)
}

// ============ Write Hooks ============

/**
 * Deposit PLS (auto-swapped to MORBIUS)
 */
export function useDeposit() {
  return useWriteContract()
}

/**
 * Deposit MORBIUS directly
 */
export function useDepositMORBIUS() {
  return useWriteContract()
}

/**
 * Withdraw MORBIUS from reserve
 */
export function useWithdraw() {
  return useWriteContract()
}

/**
 * Withdraw MORBIUS with server signature (for off-chain balance verification)
 */
export function useWithdrawWithSignature() {
  return useWriteContract()
}

/**
 * Reveal server seed for verification
 */
export function useRevealServerSeed() {
  return useWriteContract()
}

// ============ Event Hooks ============

/**
 * Watch for deposit events
 */
export function useWatchDeposits(onDeposit?: (player: string, morbiusAmount: bigint, plsAmount: bigint) => void) {
  return useWatchContractEvent({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    eventName: 'Deposit',
    onLogs(logs) {
      for (const log of logs) {
        const args = (log as { args?: { player: string; morbiusAmount: bigint; plsAmount: bigint } }).args
        if (args && onDeposit) {
          onDeposit(args.player, args.morbiusAmount, args.plsAmount)
        }
      }
    },
  })
}

/**
 * Watch for MORBIUS deposit events
 */
export function useWatchDepositsMORBIUS(onDeposit?: (player: string, amount: bigint) => void) {
  return useWatchContractEvent({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    eventName: 'DepositMORBIUS',
    onLogs(logs) {
      for (const log of logs) {
        const args = (log as { args?: { player: string; amount: bigint } }).args
        if (args && onDeposit) {
          onDeposit(args.player, args.amount)
        }
      }
    },
  })
}

/**
 * Watch for withdrawal events
 */
export function useWatchWithdrawals(onWithdrawal?: (player: string, amount: bigint) => void) {
  return useWatchContractEvent({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    eventName: 'Withdrawal',
    onLogs(logs) {
      for (const log of logs) {
        const args = (log as { args?: { player: string; amount: bigint } }).args
        if (args && onWithdrawal) {
          onWithdrawal(args.player, args.amount)
        }
      }
    },
  })
}

/**
 * Watch for bet placement events
 */
export function useWatchBetPlaced(onBetPlaced?: (player: string, gameHash: string, betAmount: bigint) => void) {
  return useWatchContractEvent({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    eventName: 'BetPlaced',
    onLogs(logs) {
      for (const log of logs) {
        const args = (log as { args?: { player: string; gameHash: string; betAmount: bigint } }).args
        if (args && onBetPlaced) {
          onBetPlaced(args.player, args.gameHash, args.betAmount)
        }
      }
    },
  })
}

/**
 * Watch for game settlement events
 */
export function useWatchGameSettlements(onSettlement?: (player: string, amount: bigint, gameHash: string) => void) {
  return useWatchContractEvent({
    address: BLACKJACK_ADDRESS,
    abi: blackjackAbi,
    eventName: 'GameSettled',
    onLogs(logs) {
      for (const log of logs) {
        const args = (log as { args?: { player: string; amount: bigint; gameHash: string } }).args
        if (args && onSettlement) {
          onSettlement(args.player, args.amount, args.gameHash)
        }
      }
    },
  })
}

// ============ Combined Hooks ============

/**
 * Main blackjack reserve contract hook with all functionality
 */
export function useBlackjackContract() {
  const { address } = useAccount()

  // Read hooks
  const playerReserve = usePlayerReserve()
  const totalReserves = useTotalReserves()
  const emergencyPaused = useEmergencyPaused()
  const contractPaused = useContractPaused()
  const dailyWithdrawalInfo = useDailyWithdrawalInfo()

  // Write hooks
  const depositContract = useDeposit()
  const depositMORBIUSContract = useDepositMORBIUS()
  const withdrawContract = useWithdraw()
  const withdrawWithSignatureContract = useWithdrawWithSignature()
  const revealSeedContract = useRevealServerSeed()
  const placeBetContract = useWriteContract()

  // Event hooks
  useWatchDeposits()
  useWatchDepositsMORBIUS()
  useWatchWithdrawals()
  useWatchBetPlaced()
  useWatchGameSettlements()

  // Helper functions
  const deposit = async (plsAmount: bigint) => {
    if (!address) throw new Error('Wallet not connected')

    return depositContract.writeContractAsync({
      address: BLACKJACK_ADDRESS,
      abi: blackjackAbi,
      functionName: 'deposit',
      value: plsAmount, // Send PLS to deposit function
      maxPriorityFeePerGas: 40_000n, // PulseChain tip
    } as unknown as Parameters<typeof depositContract.writeContractAsync>[0])
  }

  const depositMORBIUS = async (amount: bigint) => {
    if (!address) throw new Error('Wallet not connected')

    return depositMORBIUSContract.writeContractAsync({
      address: BLACKJACK_ADDRESS,
      abi: blackjackAbi,
      functionName: 'depositMORBIUS',
      args: [amount],
      maxPriorityFeePerGas: 40_000n, // PulseChain tip
    } as unknown as Parameters<typeof depositMORBIUSContract.writeContractAsync>[0])
  }

  const withdraw = async (amount: bigint) => {
    if (!address) throw new Error('Wallet not connected')

    return withdrawContract.writeContractAsync({
      address: BLACKJACK_ADDRESS,
      abi: blackjackAbi,
      functionName: 'withdraw',
      args: [amount],
      maxPriorityFeePerGas: 40_000n, // PulseChain tip
    } as unknown as Parameters<typeof withdrawContract.writeContractAsync>[0])
  }

  /** Withdraw from a specific legacy Blackjack contract. Use when balance is stuck there after upgrade. */
  const withdrawLegacy = async (legacyAddress: `0x${string}`, amount: bigint) => {
    if (!address) throw new Error('Wallet not connected')
    if (!isLegacyAddress(legacyAddress)) throw new Error('Invalid legacy contract address')

    return withdrawContract.writeContractAsync({
      address: legacyAddress,
      abi: blackjackAbi,
      functionName: 'withdraw',
      args: [amount],
      gas: 700_000n, // 2x legacy gas for safety; avoids "Internal Transaction Awaiting" / stuck estimates
      maxPriorityFeePerGas: 40_000n, // 200k wei/beats tip (PulseChain) for faster inclusion
    } as unknown as Parameters<typeof withdrawContract.writeContractAsync>[0])
  }

  const withdrawWithSignature = async (
    amount: bigint,
    nonce: bigint,
    expiryTimestamp: bigint,
    v: number,
    r: `0x${string}`,
    s: `0x${string}`
  ) => {
    if (!address) throw new Error('Wallet not connected')

    return withdrawWithSignatureContract.writeContractAsync({
      address: BLACKJACK_ADDRESS,
      abi: blackjackAbi,
      functionName: 'withdrawWithSignature',
      args: [amount, nonce, expiryTimestamp, v, r, s],
      gas: 500_000n, // Manual gas limit — avoids estimation failures that block the tx entirely
      maxPriorityFeePerGas: 40_000n, // PulseChain tip
    } as any)
  }

  const revealServerSeed = async (serverSeed: string) => {
    if (!address) throw new Error('Wallet not connected')

    return revealSeedContract.writeContractAsync({
      address: BLACKJACK_ADDRESS,
      abi: blackjackAbi,
      functionName: 'revealServerSeed',
      args: [serverSeed as `0x${string}`],
      maxPriorityFeePerGas: 40_000n, // PulseChain tip
    } as unknown as Parameters<typeof revealSeedContract.writeContractAsync>[0])
  }

  const placeBet = async (gameHash: `0x${string}`, betAmount: bigint) => {
    if (!address) throw new Error('Wallet not connected')

    return placeBetContract.writeContractAsync({
      address: BLACKJACK_ADDRESS,
      abi: blackjackAbi,
      functionName: 'placeBet',
      args: [gameHash, betAmount],
      maxPriorityFeePerGas: 40_000n, // PulseChain tip
    } as any)
  }

  return {
    // Data
    playerReserve: playerReserve.data,
    totalReserves: totalReserves.data,
    emergencyPaused: emergencyPaused.data,
    contractPaused: contractPaused.data,
    isPaused: (emergencyPaused.data === true) || (contractPaused.data === true),
    dailyWithdrawalInfo: dailyWithdrawalInfo.data,

    // Loading states
    isLoading: playerReserve.isLoading || totalReserves.isLoading,

    // Functions
    deposit,
    depositMORBIUS,
    withdraw,
    withdrawLegacy,
    withdrawWithSignature,
    revealServerSeed,
    placeBet,

    // Transaction states
    depositTx: depositContract,
    depositMORBIISTx: depositMORBIUSContract,
    withdrawTx: withdrawContract,
    withdrawWithSignatureTx: withdrawWithSignatureContract,
    revealSeedTx: revealSeedContract,
    placeBetTx: placeBetContract,

    // Refetch functions
    refetchPlayerReserve: playerReserve.refetch,
  }
}