// Contract addresses on PulseChain mainnet

/** Treasury wallet that receives cosmetics shop payments (PLS + MORBIUS). */
export const SHOP_TREASURY_ADDRESS = '0x41682815B05fE6b54a6C0f8813bB99423EE0309D' as const

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
// Instant Lottery 6-of-55 (house bankroll, instant payout; use this for new UI)
export const LOTTERY_INSTANT_ADDRESS = '0x6CCecFd3165f4d911BA8D196eb5202cc80fEF8a8' as const
//old keno addresses: 0x3e0e64F76Fb985f8CDbcC0169ff9e1E5cB7fE52c, 0x4c18d2FBd745aef4CB6443e66Aa832C9F859a2e5, 0x734A1460b4131F8cFE4950894Be89d1a852c957A
// Keno contract (CryptoKeno Quick Play - new paytable 25x max @ 10/10, 100k max wager, 2.5M cap; block 25941422)
export const KENO_ADDRESS = '0x496fCE9733E2102102f448c533b84C7A88856e8a' as const

// Plinko contract (17-bucket casino-style game with RISK LEVELS + VARIABLE WAGERS)
// V10: 2% dist + 0.5% burn + 2.5% platform fees, max 100 balls, tunable bucket thresholds
// V11: 1.25% dist + 0.5% burn + 1.75% platform + 1.5% LP dist fees
export const PLINKO_ADDRESS = '0xeC29f41bA9380E34b71d0AeB53bd637ba5258A93' as const

// BigWheel contract (7-segment casino wheel game - proportional sizes)
export const BIGWHEEL_ADDRESS = '0x53331B63ef24904Ea470Cf07b924c7C13A699d8F' as const

// Roulette contract (European single-zero roulette, 0-36)
export const ROULETTE_ADDRESS = '0x5e51EcFa38C4254dD100e565620Ac6E511723d27' as const

// BlackjackV2 contract (6-deck provably fair blackjack with withdrawal fees)
// V3: 0x1b38626A12085547C35bD80455d054950AD72Cde (emergency paused Mar 2026; set as BLACKJACK_LEGACY_ADDRESS_5)
// V4: 0xe9b03E16f5c7D38b37B4F79ca250B714aFB6755C — set as BLACKJACK_LEGACY_ADDRESS_6
// V5: 0x73c35B2e4A640FDb253c04eC86aEdA49bb50C72b — security fixes (superseded by V6)
// V6: 0x62cb20cd01F5af1f951B0Ec6bBD499143afF906c — treasury pattern; on-chain withdrawal deadline → set as BLACKJACK_LEGACY_ADDRESS_7
// V7: 0xc2Ae080dE01108b5C9C0f2C5C86051CFd3D18C00 — on-chain withdrawal deadline (expiryTimestamp in signed withdraw)
export const BLACKJACK_ADDRESS = '0xc2Ae080dE01108b5C9C0f2C5C86051CFd3D18C00' as const

// MorbiusVault — stateless deposit router. Deposits (depositMORBIUS / deposit) route HERE;
// withdrawals are unchanged (server/hot-wallet flow). The V7 reserve contract (BLACKJACK_ADDRESS)
// is a custody-reserve contract that permanently traps its balance, so new deposits must not land
// there. Deployed on PulseChain 2026-07 (owner 0x7044…95e5, forwards MORBIUS to the hot wallet).
// NEXT_PUBLIC_MORBIUS_VAULT_CONTRACT_ADDRESS overrides the deployed default if ever redeployed.
export const MORBIUS_VAULT_ADDRESS = (
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MORBIUS_VAULT_CONTRACT_ADDRESS
    ? process.env.NEXT_PUBLIC_MORBIUS_VAULT_CONTRACT_ADDRESS
    : '0x4A5a82f644A7CB20A2c8Bf0Cf4369DC641E8CeD2'
) as `0x${string}`

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

export const BLACKJACK_LEGACY_ADDRESS_4 = (
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_4
    ? process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_4
    : ''
) as `0x${string}`

export const BLACKJACK_LEGACY_ADDRESS_5 = (
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_5
    ? process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_5
    : ''
) as `0x${string}`

export const BLACKJACK_LEGACY_ADDRESS_6 = (
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_6
    ? process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_6
    : ''
) as `0x${string}`

/** V6 (previous current); default so users can withdraw from old contract without env. */
export const BLACKJACK_LEGACY_ADDRESS_7 = (
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_7
    ? process.env.NEXT_PUBLIC_BLACKJACK_LEGACY_CONTRACT_ADDRESS_7
    : '0x62cb20cd01F5af1f951B0Ec6bBD499143afF906c'
) as `0x${string}`

/** All Blackjack contract addresses: current + legacy (for reserve/withdraw UI and scripts) */
export const ALL_BLACKJACK_ADDRESSES: readonly `0x${string}`[] = [
  BLACKJACK_ADDRESS,
  ...(BLACKJACK_LEGACY_ADDRESS ? [BLACKJACK_LEGACY_ADDRESS] : []),
  ...(BLACKJACK_LEGACY_ADDRESS_2 ? [BLACKJACK_LEGACY_ADDRESS_2] : []),
  ...(BLACKJACK_LEGACY_ADDRESS_3 ? [BLACKJACK_LEGACY_ADDRESS_3] : []),
  ...(BLACKJACK_LEGACY_ADDRESS_4 ? [BLACKJACK_LEGACY_ADDRESS_4] : []),
  ...(BLACKJACK_LEGACY_ADDRESS_5 ? [BLACKJACK_LEGACY_ADDRESS_5] : []),
  ...(BLACKJACK_LEGACY_ADDRESS_6 ? [BLACKJACK_LEGACY_ADDRESS_6] : []),
  ...(BLACKJACK_LEGACY_ADDRESS_7 ? [BLACKJACK_LEGACY_ADDRESS_7] : []),
]

/** Legacy-only (previous contracts from which players can withdraw reserves) */
export const LEGACY_BLACKJACK_ADDRESSES: readonly `0x${string}`[] = [
  ...(BLACKJACK_LEGACY_ADDRESS ? [BLACKJACK_LEGACY_ADDRESS] : []),
  ...(BLACKJACK_LEGACY_ADDRESS_2 ? [BLACKJACK_LEGACY_ADDRESS_2] : []),
  ...(BLACKJACK_LEGACY_ADDRESS_3 ? [BLACKJACK_LEGACY_ADDRESS_3] : []),
  ...(BLACKJACK_LEGACY_ADDRESS_4 ? [BLACKJACK_LEGACY_ADDRESS_4] : []),
  ...(BLACKJACK_LEGACY_ADDRESS_5 ? [BLACKJACK_LEGACY_ADDRESS_5] : []),
  ...(BLACKJACK_LEGACY_ADDRESS_6 ? [BLACKJACK_LEGACY_ADDRESS_6] : []),
  ...(BLACKJACK_LEGACY_ADDRESS_7 ? [BLACKJACK_LEGACY_ADDRESS_7] : []),
]

// Tournament Prize Escrow V6 (gas-optimized: packed Pool struct, no tournamentIds array, optional EIP-2612 permit).
// Deployed at 0xF3E44A91847Ed037C63A7DBe4eba0B51367477a7 on PulseChain (verified, tx 0x7657...8290).
// Override via NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS for future redeploys without code changes.
const DEFAULT_TOURNAMENT_PRIZE_ESCROW_ADDRESS = '0xF3E44A91847Ed037C63A7DBe4eba0B51367477a7' as const

/** Previous live escrow (V5). Kept only so funds parked in old V5 pools can still be queried / reclaimed. */
export const TOURNAMENT_PRIZE_ESCROW_V5_LEGACY_ADDRESS = '0xA54da628C54d2C9885a537f18dc9c22856510eDf' as const

function resolveTournamentPrizeEscrowAddress(): `0x${string}` {
  const raw =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_TOURNAMENT_PRIZE_ESCROW_ADDRESS : undefined
  const t = typeof raw === 'string' ? raw.trim() : ''
  if (/^0x[a-fA-F0-9]{40}$/i.test(t)) {
    return t as `0x${string}`
  }
  return DEFAULT_TOURNAMENT_PRIZE_ESCROW_ADDRESS
}

export const TOURNAMENT_PRIZE_ESCROW_ADDRESS = resolveTournamentPrizeEscrowAddress()

/** Same as the default `TOURNAMENT_PRIZE_ESCROW_ADDRESS` post-cutover; exposed for code that wants to assert V6 specifically. */
export const TOURNAMENT_PRIZE_ESCROW_V6_ADDRESS = DEFAULT_TOURNAMENT_PRIZE_ESCROW_ADDRESS

// MorbiusTournament (on-chain create/join, uint256 IDs)
export const MORBIUS_TOURNAMENT_ADDRESS = '0x1F30Aa16B4Da0124308E33b8650C351BBCA70704' as const

// MORBIUS Holder Distributor (receives MORBIUS; holders claim proportional share)
// V1: 0x011eE5F4658c5183FB9f8cd72e264ca5DBd404ab (original; has ~1100 MORBIUS)
// V2: 0xc87B4F61460b24A0040AdaaB5452d07f38c876C6 (redeployed with fixed EX_BLACKJACK)
// V3: 0x0416947cd08Fc3cd8923dD857c58472F337aa42B (minHolding 1M MORBIUS; used by BlackjackV2 V3)
export const MORBIUS_HOLDER_DISTRIBUTOR_ADDRESS = '0x0416947cd08Fc3cd8923dD857c58472F337aa42B' as const
// MorbiusStaking contract (stake MORBIUS to earn proportional rewards)
// V1: 0xeD8638Fe2B7633b9B95cB48cC40A62F115589eaB (no tracking, platform fee to wallet)
// V2: 0xCc54f6d7ff847ab4Ab4f10314ebf84486921368B (+ stakedAt, totalRewardsClaimed, getStakerInfo; fee -> LP staking)
export const MORBIUS_STAKING_ADDRESS = '0xCc54f6d7ff847ab4Ab4f10314ebf84486921368B' as const
export const MORBIUS_STAKING_DEPLOY_BLOCK = 25877050 // V2: Deployed Feb 2026
// MorbiusLPStaking contract (stake Morbius/WPLS LP to earn MORBIUS rewards)
// V1: 0x45Fe6EDB92a14A574F22C9a0efE48684faa35e42 (no tracking)
// V2: 0x6Ae7E27CF0eE10516737D7416Ef3178Cb09d89cF (+ totalBurned, stakedAt, totalRewardsClaimed, getStakerInfo)
// V3: 0x742389696FB4C311cDDD30d3CEae6697c7d238AA (no unstake fee/burn, deployed Mar 2026)
export const MORBIUS_LP_STAKING_ADDRESS = '0x742389696FB4C311cDDD30d3CEae6697c7d238AA' as const
export const MORBIUS_LP_STAKING_DEPLOY_BLOCK = 25912039 // V3: Deployed Mar 2026

// ========== Distribution / claim contracts (1.25% holder, 1.5% LP from game fees) ==========
// For deploy scripts set: DISTRIBUTION_RECIPIENT = MERKLE_CLAIM_MORBIUS_ADDRESS (1.25% MORBIUS holders),
// LP_DISTRIBUTION_RECIPIENT = MERKLE_CLAIM_LP_ADDRESS (1.5% LP stakers). Keep server .env in sync.
// MerkleClaimMorbius — epoch-based Merkle drop for MORBIUS holders (receives 1.25% from games).
export const MERKLE_CLAIM_MORBIUS_ADDRESS = (
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MERKLE_CLAIM_MORBIUS_ADDRESS
    ? process.env.NEXT_PUBLIC_MERKLE_CLAIM_MORBIUS_ADDRESS
    : '0x3807f417617E53d4c5C7D7A825a5ce4D105A75d2'
) as `0x${string}`

// MerkleClaimLP — epoch-based Merkle drop for MORBIUS/WPLS LP stakers (receives 1.5% from games). Fund by sending MORBIUS to contract.
export const MERKLE_CLAIM_LP_ADDRESS = (
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MERKLE_CLAIM_LP_ADDRESS
    ? process.env.NEXT_PUBLIC_MERKLE_CLAIM_LP_ADDRESS
    : '0x64Dd1c933027d757212E43725c99bD4402211A1A'
) as `0x${string}`

// MorbiusBatchDisperse — owner-only batch ERC20 payouts (holder/LP reward airdrop after merkle rescue).
export const MORBIUS_BATCH_DISPERSE_ADDRESS = (
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_MORBIUS_BATCH_DISPERSE_ADDRESS
    ? process.env.NEXT_PUBLIC_MORBIUS_BATCH_DISPERSE_ADDRESS
    : '0x4Ea9064C08dC8B48e4537a0371261ab42E66eBD8'
) as `0x${string}`

// Contract deployment info
export const LOTTERY_DEPLOY_BLOCK = 25329129
export const KENO_DEPLOY_BLOCK = 25933639 // V2: Deployed Mar 2026 (fees on wager)
export const PLINKO_DEPLOY_BLOCK = 25914766 // V11: Deployed Mar 2026 (1.25% dist + 0.5% burn + 1.75% platform + 1.5% LP dist)
export const BIGWHEEL_DEPLOY_BLOCK = 25575736 // Deployed Jan 20, 2026
export const ROULETTE_DEPLOY_BLOCK = 26277896 // Deployed Apr 2026
export const BLACKJACK_DEPLOY_BLOCK = 25949514 // V7: Deployed Mar 2026 (on-chain withdrawal deadline; 1.25% dist + 0.5% burn + 1.75% platform + 1.5% LP dist fees)

// Lottery constants
export const TICKET_PRICE = BigInt("100000000000000000000") // 100 tokens (18 decimals)
export const NUMBERS_PER_TICKET = 6
export const MIN_NUMBER = 1
export const MAX_NUMBER = 55
