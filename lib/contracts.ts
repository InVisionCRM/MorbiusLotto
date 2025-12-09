// Contract addresses on PulseChain mainnet
export const PSSH_TOKEN_ADDRESS = '0xB7d4eB5fDfE3d4d3B5C16a44A49948c6EC77c6F1' as const
export const MORBIUS_TOKEN_ADDRESS = PSSH_TOKEN_ADDRESS
export const WPLS_TOKEN_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27' as const
export const HEX_TOKEN_ADDRESS = '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39' as const
export const SUPERSTAKE_STAKE_ADDRESS = '0xdC48205df8aF83c97de572241bB92DB45402Aa0E' as const
export const TOKEN_DECIMALS = 18 as const
export const WPLS_PSSH_PAIR = '0x81acd0AA872675678A25fbB154992A2baD4F6CEF' as const
// Morbius/WPLS PulseX V1 pair
export const MORBIUS_WPLS_V1_PAIR = '0xe4e30c4d131FD8CA288DC28D13fbd93ce28dc20D' as const
// PulseX V1 router
export const PULSEX_V1_ROUTER_ADDRESS = '0x1715a3E4A142d8b698131108995174F37aEBA10D' as const
export const WPLS_TO_MORBIUS_BUFFER_BPS = 11000 as const // 10% buffer

// OLD Lottery contract (simple version)
export const LOTTERY_ADDRESS_OLD = '0xa216b3295685D44d12Aaf12112b9212cE45787eD' as const

// NEW Lottery contract (6-of-55 version) - Using PulseX V1 Router
export const LOTTERY_ADDRESS = '0x5DCe9c1C35C5e3853FC7E5b00FEfF73c5c997a87' as const

// Keno contract
export const KENO_ADDRESS = '0x5559BB5dF01B3f4c962B4A7D014b745Dd9816a0A' as const

// Contract deployment info
export const LOTTERY_DEPLOY_BLOCK = 25220602
export const KENO_DEPLOY_BLOCK = 25220311
// Placeholder - update when deployed

// Lottery constants
export const TICKET_PRICE = BigInt(1_000_000_000_000_000_000) // 1 token (18 decimals)
export const NUMBERS_PER_TICKET = 6
export const MIN_NUMBER = 1
export const MAX_NUMBER = 55
export const MEGA_MILLIONS_INTERVAL = 55 // Every 55th round
