// Contract addresses on PulseChain mainnet
export const PSSH_TOKEN_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1' as const
export const MORBIUS_TOKEN_ADDRESS = PSSH_TOKEN_ADDRESS
export const WPLS_TOKEN_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27' as const
export const HEX_TOKEN_ADDRESS = '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39' as const
export const SUPERSTAKE_STAKE_ADDRESS = '0xdC48205df8aF83c97de572241bB92DB45402Aa0E' as const
export const TOKEN_DECIMALS = 18 as const
export const WPLS_PSSH_PAIR = '0x81acd0AA872675678A25fbB154992A2baD4F6CEF' as const
// Morbius/WPLS PulseX V1 pair (CORRECT - 141M WPLS liquidity)
export const MORBIUS_WPLS_V1_PAIR = '0x81acd0aa872675678a25fbb154992a2bad4f6cef' as const
// PulseX V1 router (CORRECT - was using factory address before)
export const PULSEX_V1_ROUTER_ADDRESS = '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02' as const
export const WPLS_TO_MORBIUS_BUFFER_BPS = 11000 as const // 10% buffer

// OLD Lottery contract (simple version)
export const LOTTERY_ADDRESS_OLD = '0xa216b3295685D44d12Aaf12112b9212cE45787eD' as const

// NEW Lottery contract (6-of-55 version V2) - Fixed PLS purchases
export const LOTTERY_ADDRESS = '0xEa6F2C484B720103EF11c77f71BF07eC11640e29' as const

// Keno contract
export const KENO_ADDRESS = '0xb04913A3085993153DaEE58704760BeB67c58705' as const

// Contract deployment info
export const LOTTERY_DEPLOY_BLOCK = 25247554
export const KENO_DEPLOY_BLOCK = 25243758
// Placeholder - update when deployed

// Lottery constants
export const TICKET_PRICE = BigInt(1_000_000_000_000_000_000_000) // 1000 tokens (18 decimals)
export const NUMBERS_PER_TICKET = 6
export const MIN_NUMBER = 1
export const MAX_NUMBER = 55
export const MEGA_MILLIONS_INTERVAL = 5 // Every 5th round
