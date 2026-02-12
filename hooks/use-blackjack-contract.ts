import { useReadContract, useWriteContract, useWatchContractEvent } from 'wagmi'
import { blackjackAbi } from '../abi/blackjack'
import { BLACKJACK_ADDRESS, BLACKJACK_LEGACY_ADDRESS } from '../lib/contracts'
import { useAccount } from 'wagmi'

const LEGACY_ZERO = '0x0000000000000000000000000000000000000000'
const isLegacyConfigured = typeof BLACKJACK_LEGACY_ADDRESS === 'string' && BLACKJACK_LEGACY_ADDRESS !== '' && BLACKJACK_LEGACY_ADDRESS !== LEGACY_ZERO

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
 * Get player's reserve on the previous (legacy) Blackjack contract.
 * When the contract was upgraded, balances stayed in the old contract; players can withdraw from it here.
 */
export function useLegacyPlayerReserve() {
  const { address } = useAccount()
  return useReadContract({
    address: isLegacyConfigured ? (BLACKJACK_LEGACY_ADDRESS as `0x${string}`) : undefined,
    abi: blackjackAbi,
    functionName: 'getPlayerReserve',
    args: address ? [address] : undefined,
    query: {
      enabled: isLegacyConfigured && !!address,
      refetchInterval: 15000,
    },
  })
}

/**
 * Whether the legacy Blackjack contract is emergency-paused.
 * If true, withdraw() reverts with "Emergency pause active"; owner/emergencyAdmin must unpause.
 */
export function useLegacyEmergencyPaused() {
  return useReadContract({
    address: isLegacyConfigured ? (BLACKJACK_LEGACY_ADDRESS as `0x${string}`) : undefined,
    abi: blackjackAbi,
    functionName: 'emergencyPaused',
    query: {
      enabled: isLegacyConfigured,
      refetchInterval: 15000,
    },
  })
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
        const { args } = log
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
        const { args } = log
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
        const { args } = log
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
        const { args } = log
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
        const { args } = log
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
    })
  }

  const depositMORBIUS = async (amount: bigint) => {
    if (!address) throw new Error('Wallet not connected')

    return depositMORBIUSContract.writeContractAsync({
      address: BLACKJACK_ADDRESS,
      abi: blackjackAbi,
      functionName: 'depositMORBIUS',
      args: [amount],
    })
  }

  const withdraw = async (amount: bigint) => {
    if (!address) throw new Error('Wallet not connected')

    return withdrawContract.writeContractAsync({
      address: BLACKJACK_ADDRESS,
      abi: blackjackAbi,
      functionName: 'withdraw',
      args: [amount],
    })
  }

  /** Withdraw from the previous (legacy) Blackjack contract. Use when balance is stuck there after upgrade. */
  const withdrawLegacy = async (amount: bigint) => {
    if (!address) throw new Error('Wallet not connected')
    if (!isLegacyConfigured) throw new Error('Legacy contract not configured')

    return withdrawContract.writeContractAsync({
      address: BLACKJACK_LEGACY_ADDRESS as `0x${string}`,
      abi: blackjackAbi,
      functionName: 'withdraw',
      args: [amount],
    })
  }

  const withdrawWithSignature = async (
    amount: bigint,
    nonce: bigint,
    v: number,
    r: `0x${string}`,
    s: `0x${string}`
  ) => {
    if (!address) throw new Error('Wallet not connected')

    return withdrawWithSignatureContract.writeContractAsync({
      address: BLACKJACK_ADDRESS,
      abi: blackjackAbi,
      functionName: 'withdrawWithSignature',
      args: [amount, nonce, v, r, s],
    })
  }

  const revealServerSeed = async (serverSeed: string) => {
    if (!address) throw new Error('Wallet not connected')

    return revealSeedContract.writeContractAsync({
      address: BLACKJACK_ADDRESS,
      abi: blackjackAbi,
      functionName: 'revealServerSeed',
      args: [serverSeed as `0x${string}`],
    })
  }

  const placeBet = async (gameHash: `0x${string}`, betAmount: bigint) => {
    if (!address) throw new Error('Wallet not connected')

    return placeBetContract.writeContractAsync({
      address: BLACKJACK_ADDRESS,
      abi: blackjackAbi,
      functionName: 'placeBet',
      args: [gameHash, betAmount],
    })
  }

  return {
    // Data
    playerReserve: playerReserve.data,
    totalReserves: totalReserves.data,
    emergencyPaused: emergencyPaused.data,
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