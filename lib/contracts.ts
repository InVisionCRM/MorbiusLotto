// Contract addresses on PulseChain mainnet
export const MORBIUS_TOKEN_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1' as const
export const WPLS_TOKEN_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27' as const
export const HEX_TOKEN_ADDRESS = '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39' as const
export const SUPERSTAKE_STAKE_ADDRESS = '0xdC48205df8aF83c97de572241bB92DB45402Aa0E' as const
export const TOKEN_DECIMALS = 18 as const
export const WPLS_MORBIUS_PAIR = '0x81acd0AA872675678A25fbB154992A2baD4F6CEF' as const
// MORBIUS/WPLS PulseX V1 pair (CORRECT - 141M WPLS liquidity)
export const MORBIUS_WPLS_V1_PAIR = '0x81acd0aa872675678a25fbb154992a2bad4f6cef' as const
// PulseX V1 router (CORRECT - was using factory address before)
export const PULSEX_V1_ROUTER_ADDRESS = '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02' as const
export const WPLS_TO_MORBIUS_BUFFER_BPS = 11000 as const // 10% buffer

// OLD Lottery contract (simple version)
export const LOTTERY_ADDRESS_OLD = '0x25056D6159F6C7a7812d1B65aca2Ca14E3E0F4c3' as const

// Lottery contract (6-of-55 version V2) - Original deployment
export const LOTTERY_ADDRESS = '0xD66b4489fbfF99A8d62f969203899840F2ec69c5' as const
//old keno addresses: 0x3e0e64F76Fb985f8CDbcC0169ff9e1E5cB7fE52c, 0x4c18d2FBd745aef4CB6443e66Aa832C9F859a2e5
// Keno contract (CryptoKeno - refactored version without add-ons)
export const KENO_ADDRESS = '0x734A1460b4131F8cFE4950894Be89d1a852c957A' as const

// Plinko contract (17-bucket casino-style game with RISK LEVELS + VARIABLE WAGERS)
// V8: New deployment on PulseChain Mainnet
export const PLINKO_ADDRESS = '0x37B1db8F06870BFFeFed862C06535BEFc4383ff8' as const

// BigWheel contract (7-segment casino wheel game - proportional sizes)
export const BIGWHEEL_ADDRESS = '0x53331B63ef24904Ea470Cf07b924c7C13A699d8F' as const

// BlackjackV2 contract (6-deck provably fair blackjack with withdrawal fees)
export const BLACKJACK_ADDRESS = '0xFCE49ab8b53366C397A0205c4c0CF42aE2B658A8' as const

// Previous Blackjack contracts (if upgraded: players with balance here can withdraw from them)
export const BLACKJACK_LEGACY_ADDRESS = (
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS
    ? process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS
    : ''
) as `0x${string}`

export const BLACKJACK_LEGACY_ADDRESS_2 = (
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_2
    ? process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_2
    : ''
) as `0x${string}`

export const BLACKJACK_LEGACY_ADDRESS_3 = (
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_3
    ? process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_3
    : ''
) as `0x${string}`

/** All Blackjack contract addresses: current + legacy (for reserve/withdraw UI and scripts) */
export const ALL_BLACKJACK_ADDRESSES: readonly `0x${string}`[] = [
  BLACKJACK_ADDRESS,
  ...(BLACKJACK_LEGACY_ADDRESS ? [BLACKJACK_LEGACY_ADDRESS] : []),
  ...(BLACKJACK_LEGACY_ADDRESS_2 ? [BLACKJACK_LEGACY_ADDRESS_2] : []),
  ...(BLACKJACK_LEGACY_ADDRESS_3 ? [BLACKJACK_LEGACY_ADDRESS_3] : []),
]

/** Legacy-only (previous contracts from which players can withdraw reserves) */
export const LEGACY_BLACKJACK_ADDRESSES: readonly `0x${string}`[] = [
  ...(BLACKJACK_LEGACY_ADDRESS ? [BLACKJACK_LEGACY_ADDRESS] : []),
  ...(BLACKJACK_LEGACY_ADDRESS_2 ? [BLACKJACK_LEGACY_ADDRESS_2] : []),
  ...(BLACKJACK_LEGACY_ADDRESS_3 ? [BLACKJACK_LEGACY_ADDRESS_3] : []),
]

// Tournament Prize Escrow (custom token prize pools for tournaments)
export const TOURNAMENT_PRIZE_ESCROW_ADDRESS = (
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS
    ? process.env.NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS
    : '0x0000000000000000000000000000000000000000'
) as `0x${string}`

// MorbiusTournament (on-chain create/join, uint256 IDs) + Escrow V3
export const MORBIUS_TOURNAMENT_ADDRESS = (
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MORBIUS_TOURNAMENT_ADDRESS
    ? process.env.NEXT_PUBLIC_MORBIUS_TOURNAMENT_ADDRESS
    : '0x0000000000000000000000000000000000000000'
) as `0x${string}`

export const TOURNAMENT_PRIZE_ESCROW_V3_ADDRESS = (
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_V3_ADDRESS
    ? process.env.NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_V3_ADDRESS
    : '0x0000000000000000000000000000000000000000'
) as `0x${string}`

// MORBIUS Holder Distributor (receives MORBIUS; holders claim proportional share)
// OLD: 0x011eE5F4658c5183FB9f8cd72e264ca5DBd404ab (has ~1100 MORBIUS; use this for claims)
// NEW: 0xc87B4F61460b24A0040AdaaB5452d07f38c876C6 (redeployed with fixed EX_BLACKJACK; currently empty)
export const MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS = '0x011eE5F4658c5183FB9f8cd72e264ca5DBd404ab' as const

// Contract deployment info
export const LOTTERY_DEPLOY_BLOCK = 25329129
export const KENO_DEPLOY_BLOCK = 25341670 // Deployed Dec 21, 2025
export const PLINKO_DEPLOY_BLOCK = 25557180 // V8: New deployment block 25,557,180
export const BIGWHEEL_DEPLOY_BLOCK = 25575736 // Deployed Jan 20, 2026
export const BLACKJACK_DEPLOY_BLOCK = 25666579 // Deployed Jan 30, 2026 (1M daily limit)

// Lottery constants
export const TICKET_PRICE = BigInt(100_000_000_000_000_000_000) // 100 tokens (18 decimals)
export const NUMBERS_PER_TICKET = 6
export const MIN_NUMBER = 1
export const MAX_NUMBER = 55
